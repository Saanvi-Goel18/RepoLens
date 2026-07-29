/**
 * Integration test: job persistence restart scenario
 * Proves that createJob + updateJob write correct rows and getJob
 * reconstructs the right shape — i.e. /result will work post-restart.
 *
 * Run with:  node tests/persistence.test.js
 * Requires DATABASE_URL in .env.
 */
require('dotenv').config({ path: '../.env' });
const { createJob, updateJob, getJob, pool } = require('../db');

const JOB_ID  = `test-restart-${Date.now()}`;
const ERR_ID  = `${JOB_ID}-err`;

const FAKE_REPORT = {
    overallScore: 72,
    categoryScores: { security: 80, scalability: 65, quality: 70, production: 75, maintainability: 68 },
    issues: [{ category: 'Security', severity: 'Warning', file: 'index.js', line: 10, description: 'Test issue', fix: 'Fix it' }]
};
const FAKE_STATS = { filesAnalyzed: 6, totalTokens: 4200 };

let passed = 0;
let failed = 0;

function assert(label, cond) {
    if (cond) { console.log('  \u2713', label); passed++; }
    else       { console.error('  \u2717', label); failed++; }
}

async function run() {
    console.log('\n\u2500\u2500 Job Persistence Integration Test \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n');

    try {
        // Step 1: createJob
        console.log('Step 1: createJob');
        await createJob(JOB_ID, 'test-owner', 'test-repo', 'https://github.com/test-owner/test-repo');
        const r1 = await getJob(JOB_ID);
        assert('row exists after createJob',     r1 !== null);
        assert('status is queued',               r1?.status === 'queued');
        assert('result null before completion',  r1?.result === null);
        assert('stats null before completion',   r1?.stats === null);
        assert('owner reconstructed',            r1?.owner === 'test-owner');
        assert('repoUrl reconstructed',          r1?.repoUrl === 'https://github.com/test-owner/test-repo');
        assert('userToken absent from DB row',   !('userToken' in r1));

        // Step 2: updateJob (done)
        console.log('\nStep 2: updateJob (done)');
        await updateJob(JOB_ID, {
            status:      'done',
            result:      FAKE_REPORT,
            stats:       FAKE_STATS,
            completedAt: new Date().toISOString()
        });
        const r2 = await getJob(JOB_ID);
        assert('status updated to done',          r2?.status === 'done');
        assert('overallScore round-trips',        r2?.result?.overallScore === 72);
        assert('categoryScores round-trips',      r2?.result?.categoryScores?.security === 80);
        assert('issues array round-trips',        r2?.result?.issues?.length === 1);
        assert('stats.filesAnalyzed round-trips', r2?.stats?.filesAnalyzed === 6);
        assert('stats.totalTokens round-trips',   r2?.stats?.totalTokens === 4200);
        assert('completedAt populated',           r2?.completedAt !== null);

        // Step 3: Simulate restart - in-memory Map would be empty, only DB exists
        console.log('\nStep 3: post-restart read (only DB exists)');
        const r3 = await getJob(JOB_ID);
        assert('report retrievable post-restart',  r3 !== null);
        assert('status intact post-restart',       r3?.status === 'done');
        assert('full result intact post-restart',  r3?.result?.overallScore === 72);
        assert('id field correct',                 r3?.id === JOB_ID);

        // Step 4: ON CONFLICT DO NOTHING safety
        console.log('\nStep 4: duplicate createJob is a no-op');
        await createJob(JOB_ID, 'different-owner', 'different-repo', 'https://github.com/different/repo');
        const r4 = await getJob(JOB_ID);
        assert('duplicate: owner unchanged',  r4?.owner === 'test-owner');
        assert('duplicate: status unchanged', r4?.status === 'done');

        // Step 5: updateJob (error path)
        console.log('\nStep 5: updateJob (error path)');
        await createJob(ERR_ID, 'o', 'r', 'https://github.com/o/r');
        await updateJob(ERR_ID, {
            status:      'error',
            error:       'Analysis timed out after 3 minutes.',
            completedAt: new Date().toISOString()
        });
        const r5 = await getJob(ERR_ID);
        assert('error status persisted',   r5?.status === 'error');
        assert('error message persisted',  r5?.error === 'Analysis timed out after 3 minutes.');
        assert('result null on error job', r5?.result === null);
        assert('stats null on error job',  r5?.stats === null);

    } finally {
        await pool.query('DELETE FROM jobs WHERE id = $1', [JOB_ID]);
        await pool.query('DELETE FROM jobs WHERE id = $1', [ERR_ID]);
        await pool.end();
    }

    console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) { console.error('SOME TESTS FAILED'); process.exit(1); }
    else              console.log('All tests passed! \u2713');
}

run().catch(err => { console.error('Test runner crashed:', err); process.exit(1); });
