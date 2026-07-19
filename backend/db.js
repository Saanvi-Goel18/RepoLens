const { Pool } = require('pg');

// Initialize database pool
// This uses the DATABASE_URL environment variable automatically if passed to the constructor
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create table if not exists
async function initDb() {
  try {
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
  } catch (err) {
    console.error('Failed to initialize database table:', err);
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

module.exports = {
    pool,
    saveScan,
    getRepoHistory,
    getRecentScans
};
