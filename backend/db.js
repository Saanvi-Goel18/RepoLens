const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

// Create table if not exists
db.pragma('journal_mode = WAL'); // Faster performance

db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    overall_score INTEGER NOT NULL,
    category_scores TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

/**
 * Save a scan result
 */
function saveScan(jobId, owner, repo, overallScore, categoryScores) {
    const stmt = db.prepare(`
        INSERT INTO scans (id, owner, repo, overall_score, category_scores)
        VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(jobId, owner, repo, overallScore, JSON.stringify(categoryScores));
}

/**
 * Get historical scans for a repository, ordered by creation date
 */
function getRepoHistory(owner, repo) {
    const stmt = db.prepare(`
        SELECT id, overall_score, category_scores, created_at 
        FROM scans 
        WHERE owner = ? AND repo = ? 
        ORDER BY created_at ASC
    `);
    
    const rows = stmt.all(owner, repo);
    return rows.map(r => ({
        ...r,
        category_scores: JSON.parse(r.category_scores)
    }));
}

/**
 * Get recent completed scans across all repos
 */
function getRecentScans(limit = 10) {
    const stmt = db.prepare(`
        SELECT owner, repo, overall_score, created_at 
        FROM scans 
        ORDER BY created_at DESC 
        LIMIT ?
    `);
    
    return stmt.all(limit);
}

module.exports = {
    db,
    saveScan,
    getRepoHistory,
    getRecentScans
};
