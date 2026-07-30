const { detectSQLInjection } = require('../detectors/sqlInjection');
const { detectBlockingIO } = require('../detectors/blockingIO');
const { detectDebugStatements } = require('../detectors/debugStatements');
const { detectMissingErrorHandler } = require('../detectors/missingErrorHandler');
const { detectOversizedFunctions } = require('../detectors/oversizedFunctions');

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

// ─── detectSQLInjection ───────────────────────────────────────────────────────

console.log('\n── detectSQLInjection ──────────────────────────────');

// 1. Concatenated SQL → Critical
{
    const files = [makeFile('db.js', "const q = 'SELECT * FROM users WHERE id = ' + id;")];
    const issues = detectSQLInjection(files);
    assert('SQL concat: flags as Critical', issues.length > 0 && issues[0].severity === 'Critical');
}

// 2. Template literal SQL → Critical
{
    const files = [makeFile('db.js', 'const q = `SELECT * FROM users WHERE id = ${userId}`;')];
    const issues = detectSQLInjection(files);
    assert('SQL template literal: flags as Critical', issues.length > 0 && issues[0].severity === 'Critical');
}

// 3. Parameterized query → clean
{
    const files = [makeFile('db.js', "db.query('SELECT * FROM users WHERE id = $1', [id]);")];
    const issues = detectSQLInjection(files);
    assert('Parameterized query: no issue flagged', issues.length === 0);
}

// 4. Edge case: non-JS file not checked
{
    const files = [makeFile('query.md', 'SELECT * FROM users WHERE id = ' + 'foo')];
    const issues = detectSQLInjection(files);
    assert('Edge: markdown file not scanned', issues.length === 0);
}

// ─── detectBlockingIO ─────────────────────────────────────────────────────────

console.log('\n── detectBlockingIO ────────────────────────────────');

// 1. readFileSync in a route file → Warning
{
    const content = "app.get('/file', (req, res) => {\n  const data = fs.readFileSync('file.txt');\n  res.send(data);\n});";
    const files = [makeFile('routes.js', content)];
    const issues = detectBlockingIO(files);
    assert('readFileSync in route file: flags Warning', issues.length > 0 && issues[0].severity === 'Warning');
}

// 2. readFileSync in a non-route utility file → no issue
{
    const files = [makeFile('utils.js', "const config = fs.readFileSync('config.json');")];
    const issues = detectBlockingIO(files);
    assert('readFileSync in utility (no routes): no issue', issues.length === 0);
}

// 3. Edge: execSync in a route file → Warning
{
    const content = "app.post('/run', (req, res) => {\n  const out = execSync('ls');\n  res.send(out);\n});";
    const files = [makeFile('server.js', content)];
    const issues = detectBlockingIO(files);
    assert('execSync in route file: flags Warning', issues.length > 0 && issues[0].description.includes('execSync'));
}

// ─── detectDebugStatements ────────────────────────────────────────────────────

console.log('\n── detectDebugStatements ───────────────────────────');

// 1. console.log in production file → Info
{
    const files = [makeFile('server.js', "app.get('/', () => {\n  console.log('debug');\n  res.send('ok');\n});")];
    const issues = detectDebugStatements(files);
    assert('console.log in production: flags Info', issues.length > 0 && issues[0].severity === 'Info');
}

// 2. Test file → not flagged
{
    const files = [makeFile('tests/unit.test.js', "console.log('test helper');")];
    const issues = detectDebugStatements(files);
    assert('console.log in test file: no issue', issues.length === 0);
}

// 3. Edge: many console.logs → single issue (not one per line)
{
    const content = Array(20).fill("  console.log('x');").join('\n');
    const files = [makeFile('app.js', content)];
    const issues = detectDebugStatements(files);
    assert('20 console.logs: exactly 1 summary issue', issues.length === 1);
    assert('20 console.logs: reports count in description', issues[0]?.description.includes('20'));
}

// ─── detectMissingErrorHandler ────────────────────────────────────────────────

console.log('\n── detectMissingErrorHandler ───────────────────────');

// 1. Express app with no error handler → Warning
{
    const content = "const app = express();\napp.get('/', (req, res) => res.send('hi'));\napp.listen(3000);";
    const files = [makeFile('server.js', content)];
    const issues = detectMissingErrorHandler(files);
    assert('Express app without error handler: flags Warning', issues.length > 0 && issues[0].severity === 'Warning');
}

// 2. Express app WITH 4-arg error handler → no issue
{
    const content = "const app = express();\napp.get('/', (req, res) => res.send('hi'));\napp.use((err, req, res, next) => { res.status(500).send(err); });\napp.listen(3000);";
    const files = [makeFile('server.js', content)];
    const issues = detectMissingErrorHandler(files);
    assert('Express app with error handler: no issue', issues.length === 0);
}

// 3. Edge: non-Express file with app.listen pattern → not flagged
{
    const content = "// pure script\napp.listen(3000);";
    const files = [makeFile('script.js', content)];
    const issues = detectMissingErrorHandler(files);
    assert('File with listen but no express(): no issue', issues.length === 0);
}

// ─── detectOversizedFunctions ─────────────────────────────────────────────────

console.log('\n── detectOversizedFunctions ────────────────────────');

// 1. Short function → no issue
{
    const content = "function hello() {\n  return 'world';\n}";
    const files = [makeFile('utils.js', content)];
    const issues = detectOversizedFunctions(files);
    assert('Short function: no issue', issues.length === 0);
}

// 2. Function > 80 lines → Info issue
{
    const body = Array(85).fill('  const x = 1;').join('\n');
    const content = `function bigFn() {\n${body}\n}`;
    const files = [makeFile('service.js', content)];
    const issues = detectOversizedFunctions(files);
    assert('Function > 80 lines: flags Info', issues.length > 0 && issues[0].severity === 'Info');
    assert('Function > 80 lines: mentions function name', issues[0]?.description.includes('bigFn'));
}

// 3. Edge: arrow function > 80 lines → flagged
{
    const body = Array(85).fill('  const y = 2;').join('\n');
    const content = `const arrowFn = async (req, res) => {\n${body}\n}`;
    const files = [makeFile('handler.js', content)];
    const issues = detectOversizedFunctions(files);
    assert('Oversized arrow function: flagged', issues.length > 0);
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log('\n────────────────────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log('All tests passed! ✓');
process.exit(failed > 0 ? 1 : 0);
