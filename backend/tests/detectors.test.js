const { detectSecrets } = require('../detectors/secrets');
const { detectVibeIssues } = require('../detectors/vibe');

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeFile(path, content) {
    return { path, content };
}

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

// ─── detectSecrets tests ──────────────────────────────────────────────────────

console.log('\n── detectSecrets ─────────────────────────────');

// 1. Clean file → no issues (except missing .env.example info)
{
    const files = [makeFile('index.js', 'const x = process.env.API_KEY;')];
    const issues = detectSecrets(files);
    const secIssues = issues.filter(i => i.severity === 'Critical');
    assert('Clean process.env usage: no critical issues', secIssues.length === 0);
}

// 2. AWS access key detected
{
    const files = [makeFile('config.js', 'const key = "AKIAIOSFODNN7EXAMPLE";')];
    const issues = detectSecrets(files);
    assert('AWS key detected as Critical', issues.some(i => i.severity === 'Critical' && i.description.includes('AWS')));
}

// 3. Hardcoded API key assignment detected
{
    const files = [makeFile('app.js', 'const api_key = "sk-realkey12345678";')];
    const issues = detectSecrets(files);
    assert('Hardcoded api_key detected', issues.some(i => i.severity === 'Critical'));
}

// 4. Dummy/placeholder values are NOT flagged
{
    const files = [makeFile('app.js', 'const password = "your_api_key";')];
    const issues = detectSecrets(files);
    const critical = issues.filter(i => i.severity === 'Critical');
    assert('Dummy placeholder value not flagged', critical.length === 0);
}

// 5. Template string variable not flagged
{
    const files = [makeFile('app.js', 'const token = `${process.env.TOKEN}`;')];
    const issues = detectSecrets(files);
    const critical = issues.filter(i => i.severity === 'Critical');
    assert('Template string variable not flagged', critical.length === 0);
}

// 6. .env file committed → Critical issue
{
    const files = [makeFile('.env', 'API_KEY=real_secret_value')];
    const issues = detectSecrets(files);
    assert('.env committed detected as Critical', issues.some(i =>
        i.severity === 'Critical' && i.file === '.env'
    ));
}

// 7. .env.example present → no missing-env-example info issue
{
    const files = [
        makeFile('.env.example', 'API_KEY=your_key_here'),
        makeFile('index.js', 'const x = 1;')
    ];
    const issues = detectSecrets(files);
    assert('.env.example present: no missing-example warning', !issues.some(i =>
        i.description.includes('.env.example')
    ));
}

// 8. No .env.example → Info issue raised
{
    const files = [makeFile('index.js', 'const x = 1;')];
    const issues = detectSecrets(files);
    assert('Missing .env.example raises Info issue', issues.some(i =>
        i.severity === 'Info' && i.description.includes('.env.example')
    ));
}

// 9. package.json is skipped (no false positives from dep names)
{
    const files = [makeFile('package.json', '{ "dependencies": { "secret": "1.0.0" } }')];
    const issues = detectSecrets(files);
    const critical = issues.filter(i => i.severity === 'Critical');
    assert('package.json skipped during secret scan', critical.length === 0);
}

// 10. Hardcoded Bearer JWT flagged
{
    const files = [makeFile('client.js', 'headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdCJ9.abc123" }')];
    const issues = detectSecrets(files);
    assert('Hardcoded JWT Bearer token detected', issues.some(i =>
        i.severity === 'Critical' && i.description.includes('JWT')
    ));
}


// ─── detectVibeIssues tests ───────────────────────────────────────────────────

console.log('\n── detectVibeIssues ──────────────────────────');

// 11. Auth route + no rate limiter → Critical
{
    const files = [makeFile('routes.js', `app.post('/login', (req, res) => {});`)];
    const issues = detectVibeIssues(files);
    assert('Auth route without rate limiter: Critical', issues.some(i =>
        i.severity === 'Critical' && i.description.includes('rate-limit')
    ));
}

// 12. Auth route + rate limiter present → no issue
{
    const files = [
        makeFile('routes.js', `app.post('/login', (req, res) => {});`),
        makeFile('middleware.js', `require('express-rate-limit')`)
    ];
    const issues = detectVibeIssues(files);
    assert('Auth route WITH rate limiter: no Critical', !issues.some(i =>
        i.severity === 'Critical' && i.description.includes('rate-limit')
    ));
}

// 13. No auth routes → no rate limiter issue even without rate limiter
{
    const files = [makeFile('index.js', `app.get('/posts', handler);`)];
    const issues = detectVibeIssues(files);
    assert('No auth routes: no rate limiter issue', !issues.some(i =>
        i.description.includes('rate-limit')
    ));
}

// 14. DB call inside try/catch → no warning
{
    const files = [makeFile('db.js', `
async function getUser() {
    try {
        const user = await prisma.User.findUnique({ where: { id: 1 } });
        return user;
    } catch(err) {
        throw err;
    }
}`)];
    const issues = detectVibeIssues(files);
    assert('DB call inside try/catch: no warning', !issues.some(i =>
        i.description.includes('try/catch')
    ));
}

// 15. DB call outside try/catch → Warning
{
    const files = [makeFile('db.js', `
async function getUser() {
    const user = await User.find({ id: 1 });
    return user;
}`)];
    const issues = detectVibeIssues(files);
    assert('DB call outside try/catch: Warning raised', issues.some(i =>
        i.severity === 'Warning' && i.description.includes('try/catch')
    ));
}

// 16. catch(err) without space is correctly handled (the bug we fixed)
{
    const files = [makeFile('db.js', `
async function getUser() {
    try {
        const user = await mongoose.User.find({});
    } catch(err) {
        console.error(err);
    }
}`)];
    const issues = detectVibeIssues(files);
    assert('catch(err) style (no space) correctly parsed as inside try/catch', !issues.some(i =>
        i.description.includes('try/catch')
    ));
}

// 17. Mixed modules within a single file → Warning
{
    const files = [makeFile('mixed.js', `
const express = require('express');
import helmet from 'helmet';
`)];
    const issues = detectVibeIssues(files);
    assert('Mixed require+import in same file: Warning', issues.some(i =>
        i.severity === 'Warning' && i.description.includes('Mixed module')
    ));
}

// 18. require in one file, import in another → no false positive
{
    const files = [
        makeFile('backend/server.js', `const express = require('express');`),
        makeFile('frontend/App.jsx', `import React from 'react';`)
    ];
    const issues = detectVibeIssues(files);
    assert('require in .js + import in .jsx: no mixed-module issue', !issues.some(i =>
        i.description.includes('Mixed module')
    ));
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n────────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed! ✓');
