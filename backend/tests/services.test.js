/**
 * Unit tests for githubService.js, llmService.js, and audit.js.
 * External dependencies are mocked using require.cache and global.fetch overrides.
 */

require('dotenv').config({ path: '../.env' }); // Suppress warnings if needed

let passed = 0;
let failed = 0;

function assert(label, condition) {
    if (condition) {
        console.log(`  \u2713 ${label}`);
        passed++;
    } else {
        console.error(`  \u2717 ${label}`);
        failed++;
    }
}

// Ensure tests run sequentially and mocks don't bleed.
async function runTests() {
    console.log('\n\u2500\u2500 githubService.js \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    await testGithubService();

    console.log('\n\u2500\u2500 llmService.js \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    await testLlmService();

    console.log('\n\u2500\u2500 audit.js \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    await testAuditService();

    console.log(`\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
}

async function testGithubService() {
    let mocks = {
        reposGet: async () => {},
        gitGetTree: async () => {}
    };

    class MockOctokit {
        constructor() {
            this.rest = {
                repos: { get: (...args) => mocks.reposGet(...args) },
                git: { getTree: (...args) => mocks.gitGetTree(...args) }
            };
        }
    }

    const octokitPath = require.resolve('octokit');
    require.cache[octokitPath] = { id: octokitPath, filename: octokitPath, loaded: true, exports: { Octokit: MockOctokit } };

    const { fetchRepoTree, checkRepoAccess } = require('../githubService');

    // 1. fetchRepoTree: Successful tree fetch
    mocks.reposGet = async () => ({ data: { default_branch: 'main' } });
    mocks.gitGetTree = async () => ({
        data: {
            tree: [{ path: 'file1.js', type: 'blob', size: 100, url: 'url1' }, { path: 'dir', type: 'tree' }],
            truncated: false
        }
    });
    let files = await fetchRepoTree('owner', 'repo');
    assert('fetchRepoTree: Returns only blob files', files.length === 1 && files[0].path === 'file1.js');

    // 2. fetchRepoTree: Truncated tree warning
    // We mock console.warn to verify it is called.
    const originalWarn = console.warn;
    let warningLogged = false;
    console.warn = (msg) => { if (msg.includes('truncated')) warningLogged = true; };
    mocks.gitGetTree = async () => ({
        data: { tree: [], truncated: true }
    });
    await fetchRepoTree('owner', 'repo');
    assert('fetchRepoTree: Logs warning when tree is truncated', warningLogged);
    console.warn = originalWarn;

    // 3. fetchRepoTree: 404 on non-existent repo
    mocks.reposGet = async () => {
        const err = new Error('Not Found');
        err.status = 404;
        throw err;
    };
    try {
        await fetchRepoTree('invalid', 'invalid');
        assert('fetchRepoTree: 404 error throws correctly', false);
    } catch (e) {
        assert('fetchRepoTree: 404 error throws correctly', e.status === 404);
    }

    // 4. checkRepoAccess: Public repo
    mocks.reposGet = async () => ({ data: { private: false } });
    let access = await checkRepoAccess('owner', 'public');
    assert('checkRepoAccess: Returns isPrivate=false for public repo', access.isPrivate === false);

    // 5. checkRepoAccess: Private repo
    mocks.reposGet = async () => ({ data: { private: true } });
    access = await checkRepoAccess('owner', 'private', 'some-token');
    assert('checkRepoAccess: Returns isPrivate=true for private repo', access.isPrivate === true);

    // 6. checkRepoAccess: 404 / Error path
    mocks.reposGet = async () => {
        const err = new Error('Not Found');
        err.status = 404;
        throw err;
    };
    try {
        await checkRepoAccess('owner', 'repo');
        assert('checkRepoAccess: Throws 404 if inaccessible', false);
    } catch (e) {
        assert('checkRepoAccess: Throws 404 if inaccessible', e.status === 404);
    }

    // Cleanup cache for clean environment
    delete require.cache[require.resolve('../githubService')];
}

async function testLlmService() {
    process.env.GROQ_API_KEY = 'test-key'; // satisfy the missing-key guard
    let mocks = {
        createCompletion: async () => {}
    };

    class MockOpenAI {
        constructor() {
            this.chat = {
                completions: { create: (...args) => mocks.createCompletion(...args) }
            };
        }
    }

    const openaiPath = require.resolve('openai');
    require.cache[openaiPath] = { id: openaiPath, filename: openaiPath, loaded: true, exports: MockOpenAI };

    const { analyzeWithLLM } = require('../llmService');

    const fakeFiles = [{ path: 'test.js', content: 'const a = 1;' }];

    // 1. Successful scored JSON response
    mocks.createCompletion = async () => ({
        choices: [{
            message: {
                content: JSON.stringify({
                    categoryScores: { security: 95, scalability: 90, quality: 85, production: 80, maintainability: 75 },
                    issues: [{ category: 'Quality', severity: 'Info', file: 'test.js', line: 1, description: 'Test', fix: 'Fix' }]
                })
            }
        }]
    });
    let report = await analyzeWithLLM(fakeFiles, []);
    assert('analyzeWithLLM: Parses successful JSON correctly', report.categoryScores.security === 95 && report.issues.length === 1);

    // 2. Malformed/unparseable response (tests defensive fallback)
    // Send completely empty JSON to trigger fallback defaults.
    mocks.createCompletion = async () => ({
        choices: [{
            message: { content: '{}' }
        }]
    });
    report = await analyzeWithLLM(fakeFiles, []);
    assert('analyzeWithLLM: Applies defensive defaults on missing fields', report.categoryScores.security === 50 && report.issues.length === 0);

    // 3. API error / timeout path
    mocks.createCompletion = async () => {
        throw new Error('Groq API Timeout');
    };
    try {
        await analyzeWithLLM(fakeFiles, []);
        assert('analyzeWithLLM: Throws on API error', false);
    } catch (e) {
        assert('analyzeWithLLM: Throws on API error', e.message.includes('Groq API Timeout'));
    }

    delete require.cache[require.resolve('../llmService')];
}

async function testAuditService() {
    const { auditDependencies } = require('../audit');

    const originalFetch = global.fetch;
    let mockFetchResponse = async () => {};
    
    global.fetch = async (url, options) => {
        return mockFetchResponse(url, options);
    };

    // 1. Package with no vulnerabilities
    mockFetchResponse = async () => ({
        ok: true,
        json: async () => ({
            results: [{ vulns: [] }]
        })
    });
    let files = [{ path: 'package.json', content: JSON.stringify({ dependencies: { 'react': '18.2.0' } }) }];
    let issues = await auditDependencies(files);
    assert('auditDependencies: Returns 0 issues for clean package', issues.length === 0);

    // 2. Package with vulnerabilities (takes vulns[0])
    mockFetchResponse = async () => ({
        ok: true,
        json: async () => ({
            results: [{
                vulns: [{ id: 'CVE-123', details: 'A vulnerability' }, { id: 'CVE-456' }]
            }]
        })
    });
    issues = await auditDependencies(files);
    assert('auditDependencies: Flags vulnerable package and takes first CVE', issues.length === 1 && issues[0].description.includes('CVE-123'));

    // 3. API failure path
    mockFetchResponse = async () => ({
        ok: false,
        statusText: 'Internal Server Error'
    });
    // We just want to make sure it handles it gracefully (returns empty issues without crashing)
    issues = await auditDependencies(files);
    assert('auditDependencies: Fails gracefully on API error', issues.length === 0);

    global.fetch = originalFetch;
}

runTests().catch(err => {
    console.error('Test runner crashed:', err);
    process.exit(1);
});
