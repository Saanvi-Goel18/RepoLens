const { Pool } = require('pg');

// Initialize database pool
// This uses the DATABASE_URL environment variable automatically if passed to the constructor
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create tables if they don't exist
async function initDb() {
  try {
    // Existing scans table — stores score summaries for the trend chart
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        overall_score INTEGER NOT NULL,
        category_scores TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Jobs table — stores full job state so reports survive server restarts.
    // user_token is intentionally NOT stored here (ephemeral credential).
    // result/stats/error are TEXT-encoded JSON to stay consistent with
    // how category_scores is stored in the scans table.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id           TEXT        PRIMARY KEY,
        owner        TEXT        NOT NULL,
        repo         TEXT        NOT NULL,
        repo_url     TEXT        NOT NULL,
        status       TEXT        NOT NULL DEFAULT 'queued',
        result       TEXT,
        error        TEXT,
        stats        TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);
  } catch (err) {
    console.error('Failed to initialize database tables:', err);
  }
}
initDb();

/**
 * Save a scan result
 */
async function saveScan(jobId, owner, repo, overallScore, categoryScores) {
    const query = `
        INSERT INTO scans (id, owner, repo, overall_score, category_scores)
        VALUES ($1, $2, $3, $4, $5)
    `;
    
    await pool.query(query, [jobId, owner, repo, overallScore, JSON.stringify(categoryScores)]);
}

/**
 * Get historical scans for a repository, ordered by creation date
 */
async function getRepoHistory(owner, repo) {
    const query = `
        SELECT id, overall_score, category_scores, created_at 
        FROM scans 
        WHERE owner = $1 AND repo = $2 
        ORDER BY created_at ASC
    `;
    
    const { rows } = await pool.query(query, [owner, repo]);
    return rows.map(r => ({
        ...r,
        category_scores: JSON.parse(r.category_scores)
    }));
}

/**
 * Get recent completed scans across all repos
 */
async function getRecentScans(limit = 10) {
    const query = `
        SELECT owner, repo, overall_score, created_at 
        FROM scans 
        ORDER BY created_at DESC 
        LIMIT $1
    `;
    
    const { rows } = await pool.query(query, [limit]);
    return rows;
}

// ─── Job persistence ──────────────────────────────────────────────────────────

/**
 * Write the initial job row when a scan is queued.
 * user_token is intentionally NOT stored here — it is ephemeral and
 * should never be written to disk.
 * Uses ON CONFLICT DO NOTHING so a duplicate call is always safe.
 */
async function createJob(jobId, owner, repo, repoUrl) {
    await pool.query(
        `INSERT INTO jobs (id, owner, repo, repo_url, status)
         VALUES ($1, $2, $3, $4, 'queued')
         ON CONFLICT (id) DO NOTHING`,
        [jobId, owner, repo, repoUrl]
    );
}

/**
 * Update mutable fields on a job row.
 * Only keys present in `fields` are written — callers pass only what changed.
 * Accepted keys: status, result, error, stats, completedAt.
 */
async function updateJob(jobId, fields) {
    const setClauses = [];
    const values = [];
    let i = 1;

    if (fields.status      !== undefined) { setClauses.push(`status = $${i++}`);       values.push(fields.status); }
    if (fields.result      !== undefined) { setClauses.push(`result = $${i++}`);       values.push(JSON.stringify(fields.result)); }
    if (fields.error       !== undefined) { setClauses.push(`error = $${i++}`);        values.push(fields.error); }
    if (fields.stats       !== undefined) { setClauses.push(`stats = $${i++}`);        values.push(JSON.stringify(fields.stats)); }
    if (fields.completedAt !== undefined) { setClauses.push(`completed_at = $${i++}`); values.push(fields.completedAt); }

    if (setClauses.length === 0) return;

    values.push(jobId);
    await pool.query(
        `UPDATE jobs SET ${setClauses.join(', ')} WHERE id = $${i}`,
        values
    );
}

/**
 * Fetch a completed job by ID — used as the /result fallback after a restart.
 * Reconstructs the same shape as the in-memory job object.
 * userToken is absent (it was never persisted).
 * Returns null if not found.
 */
async function getJob(jobId) {
    const { rows } = await pool.query(
        `SELECT id, owner, repo, repo_url, status, result, error, stats, created_at, completed_at
         FROM jobs WHERE id = $1`,
        [jobId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
        id:          r.id,
        owner:       r.owner,
        repo:        r.repo,
        repoUrl:     r.repo_url,
        status:      r.status,
        result:      r.result      ? JSON.parse(r.result)  : null,
        error:       r.error       ?? null,
        stats:       r.stats       ? JSON.parse(r.stats)   : null,
        createdAt:   r.created_at,
        completedAt: r.completed_at ?? null,
    };
}

module.exports = {
    pool,
    saveScan,
    getRepoHistory,
    getRecentScans,
    createJob,
    updateJob,
    getJob
};
