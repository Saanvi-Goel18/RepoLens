const { computeFinalScores } = require('../scorer');
const { getFileWeight } = require('../prioritizer');

// ─── scorer.js tests ──────────────────────────────────────────────────────────

function testScorer() {
    let passed = 0;
    let failed = 0;

    function assert(label, condition) {
        if (condition) {
            console.log(`  ✓ ${label}`);
            passed++;
        } else {
            console.error(`  ✗ ${label}`);
            failed++;
        }
    }

    console.log('\n── scorer.js ─────────────────────────────────');

    // Test 1: No issues → LLM scores pass through unchanged
    {
        const llmReport = {
            categoryScores: { security: 80, scalability: 70, quality: 90, production: 60, maintainability: 75 },
            issues: []
        };
        const result = computeFinalScores(llmReport, []);
        assert('No static issues: scores unchanged', result.categoryScores.security === 80);
        assert('No static issues: overall = weighted avg', result.overallScore ===
            Math.round(80 * 0.30 + 70 * 0.20 + 90 * 0.20 + 60 * 0.20 + 75 * 0.10));
    }

    // Test 2: Critical security issue applies -30 penalty
    {
        const llmReport = {
            categoryScores: { security: 80, scalability: 70, quality: 90, production: 60, maintainability: 75 },
            issues: []
        };
        const staticIssues = [{
            category: 'Security', severity: 'Critical',
            file: 'index.js', line: 1, description: 'Hardcoded secret', fix: 'Use env var'
        }];
        const result = computeFinalScores(llmReport, staticIssues);
        assert('Critical security issue: -30 penalty', result.categoryScores.security === 50);
    }

    // Test 3: Security score cannot go below 0
    {
        const llmReport = {
            categoryScores: { security: 20, scalability: 70, quality: 90, production: 60, maintainability: 75 },
            issues: []
        };
        const staticIssues = [
            { category: 'Security', severity: 'Critical', file: 'f', line: 1, description: '', fix: '' },
            { category: 'Security', severity: 'Critical', file: 'f', line: 2, description: '', fix: '' }
        ];
        const result = computeFinalScores(llmReport, staticIssues);
        assert('Score floor is 0 (not negative)', result.categoryScores.security === 0);
    }

    // Test 4: Issues sorted by severity (Critical first)
    {
        const llmReport = {
            categoryScores: { security: 80, scalability: 70, quality: 90, production: 60, maintainability: 75 },
            issues: [
                { category: 'Security', severity: 'Info', file: 'f', line: 1, description: '', fix: '' },
                { category: 'Security', severity: 'Warning', file: 'f', line: 2, description: '', fix: '' },
            ]
        };
        const staticIssues = [
            { category: 'Security', severity: 'Critical', file: 'f', line: 3, description: '', fix: '' }
        ];
        const result = computeFinalScores(llmReport, staticIssues);
        assert('Issues sorted: Critical first', result.issues[0].severity === 'Critical');
        assert('Issues sorted: Info last', result.issues[result.issues.length - 1].severity === 'Info');
    }

    // Test 5: LLM issues merged with static issues
    {
        const llmReport = {
            categoryScores: { security: 80, scalability: 70, quality: 90, production: 60, maintainability: 75 },
            issues: [{ category: 'Code Quality', severity: 'Warning', file: 'app.js', line: 5, description: 'LLM issue', fix: 'fix' }]
        };
        const staticIssues = [
            { category: 'Security', severity: 'Critical', file: 'index.js', line: 1, description: 'Static issue', fix: 'fix' }
        ];
        const result = computeFinalScores(llmReport, staticIssues);
        assert('Total issues = static + LLM issues', result.issues.length === 2);
    }

    return { passed, failed };
}

// ─── prioritizer.js tests ─────────────────────────────────────────────────────

function testPrioritizer() {
    let passed = 0;
    let failed = 0;

    function assert(label, condition) {
        if (condition) {
            console.log(`  ✓ ${label}`);
            passed++;
        } else {
            console.error(`  ✗ ${label}`);
            failed++;
        }
    }

    console.log('\n── prioritizer.js ────────────────────────────');

    assert('Entry point gets highest weight (11)', getFileWeight('index.js') === 11);
    assert('server.ts is an entry point', getFileWeight('server.ts') === 11);
    assert('Auth files get weight 10', getFileWeight('auth/login.js') === 10);
    assert('Middleware gets weight 10', getFileWeight('middleware/rateLimit.js') === 10);
    assert('Models get weight 9', getFileWeight('models/User.js') === 9);
    assert('DB config gets weight 9', getFileWeight('database/config.js') === 9);
    assert('Config JSON gets weight 8', getFileWeight('config.json') === 8);
    assert('Routes get weight 7', getFileWeight('routes/users.js') === 7);
    assert('Generic JS file gets weight 4', getFileWeight('utils/helper.js') === 4);
    assert('node_modules gets weight 0', getFileWeight('node_modules/express/index.js') === 0);
    assert('.git folder gets weight 0', getFileWeight('.git/config') === 0);
    assert('Image files get weight 0', getFileWeight('assets/logo.png') === 0);
    assert('dist folder gets weight 0', getFileWeight('dist/bundle.js') === 0);
    assert('Python files get weight 4', getFileWeight('app.py') === 4);

    return { passed, failed };
}

// ─── Run all tests ────────────────────────────────────────────────────────────

console.log('Running RepoLens unit tests...');
const s = testScorer();
const p = testPrioritizer();

const total = s.passed + p.passed;
const totalFailed = s.failed + p.failed;

console.log(`\n────────────────────────────────────────────`);
console.log(`Results: ${total} passed, ${totalFailed} failed`);

if (totalFailed > 0) {
    process.exit(1);
} else {
    console.log('All tests passed! ✓');
}
