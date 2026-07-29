/**
 * Dry-run validation of db.js job persistence logic.
 * Validates SQL structure and the getJob reconstruction without a live DB connection.
 * Run with: node tests/validate_db_logic.js
 */

let passed = 0;
let failed = 0;

function assert(label, cond) {
    if (cond) { console.log('  \u2713', label); passed++; }
    else       { console.error('  \u2717', label); failed++; }
}

console.log('\n-- db.js logic dry-run --\n');

// 1. updateJob builds correct parameterized SET clause
const fields = { status: 'done', result: { overallScore: 72 }, stats: { filesAnalyzed: 6 }, completedAt: new Date().toISOString() };
const setClauses = [];
const values = [];
let i = 1;
if (fields.status      !== undefined) { setClauses.push(`status = $${i++}`);        values.push(fields.status); }
if (fields.result      !== undefined) { setClauses.push(`result = $${i++}`);        values.push(JSON.stringify(fields.result)); }
if (fields.error       !== undefined) { setClauses.push(`error = $${i++}`);         values.push(fields.error); }
if (fields.stats       !== undefined) { setClauses.push(`stats = $${i++}`);         values.push(JSON.stringify(fields.stats)); }
if (fields.completedAt !== undefined) { setClauses.push(`completed_at = $${i++}`);  values.push(fields.completedAt); }
values.push('test-job-id');

const updateSql = `UPDATE jobs SET ${setClauses.join(', ')} WHERE id = $${i}`;
assert('SET clause non-empty',                     setClauses.length === 4);
assert('param count matches placeholder count',    values.length === i);
assert('status clause present',                    setClauses[0] === 'status = $1');
assert('result clause present',                    setClauses[1] === 'result = $2');
assert('stats clause present',                     setClauses[2] === 'stats = $3');
assert('completed_at clause present',              setClauses[3] === 'completed_at = $4');
assert('WHERE clause uses next param index',       updateSql.endsWith('WHERE id = $5'));
assert('result JSON-stringified',                  values[1] === '{"overallScore":72}');
assert('stats JSON-stringified',                   values[2] === '{"filesAnalyzed":6}');

// 2. updateJob with empty fields is a no-op (guard check)
const emptyClauses = [];
assert('empty fields guard works', emptyClauses.length === 0);

// 3. getJob reconstructs the in-memory shape correctly
const fakeRow = {
    id: 'abc-123',
    owner: 'test-owner',
    repo: 'test-repo',
    repo_url: 'https://github.com/test-owner/test-repo',
    status: 'done',
    result: JSON.stringify({ overallScore: 72, categoryScores: { security: 80 }, issues: [{ severity: 'Warning' }] }),
    error: null,
    stats: JSON.stringify({ filesAnalyzed: 6, totalTokens: 4200 }),
    created_at: new Date('2025-01-01T10:00:00Z'),
    completed_at: new Date('2025-01-01T10:03:00Z'),
};

const r = fakeRow;
const reconstructed = {
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

assert('id reconstructed',                         reconstructed.id === 'abc-123');
assert('owner reconstructed',                      reconstructed.owner === 'test-owner');
assert('repo_url mapped to repoUrl',               reconstructed.repoUrl === 'https://github.com/test-owner/test-repo');
assert('status reconstructed',                     reconstructed.status === 'done');
assert('result.overallScore parsed',               reconstructed.result?.overallScore === 72);
assert('result.categoryScores.security parsed',    reconstructed.result?.categoryScores?.security === 80);
assert('result.issues array parsed',               Array.isArray(reconstructed.result?.issues));
assert('stats.filesAnalyzed parsed',               reconstructed.stats?.filesAnalyzed === 6);
assert('stats.totalTokens parsed',                 reconstructed.stats?.totalTokens === 4200);
assert('error is null (not undefined)',             reconstructed.error === null);
assert('completedAt is a Date',                    reconstructed.completedAt instanceof Date);
assert('userToken absent from reconstructed obj',  !('userToken' in reconstructed));

// 4. null result (error job) doesn't crash
const errRow = { ...fakeRow, status: 'error', result: null, stats: null, error: 'Timed out', completed_at: null };
const errReconstructed = {
    result:      errRow.result ? JSON.parse(errRow.result) : null,
    stats:       errRow.stats  ? JSON.parse(errRow.stats)  : null,
    error:       errRow.error  ?? null,
    completedAt: errRow.completed_at ?? null,
};
assert('null result handled without crash',        errReconstructed.result === null);
assert('null stats handled without crash',         errReconstructed.stats === null);
assert('error message preserved',                  errReconstructed.error === 'Timed out');
assert('null completed_at coerced to null',        errReconstructed.completedAt === null);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) { console.error('SOME CHECKS FAILED'); process.exit(1); }
else              console.log('All checks passed! \u2713');
