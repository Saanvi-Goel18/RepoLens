/**
 * Detects leftover console.log / console.debug calls in non-test files.
 * Reports a summary with up to 3 example locations rather than one issue per line.
 */
function detectDebugStatements(files) {
    const issues = [];

    const debugRegex = /\bconsole\.(log|debug)\s*\(/g;

    for (const file of files) {
        // Skip test files
        if (file.path.match(/(\/tests?\/|\.test\.|\.spec\.)/i)) continue;
        if (!file.path.match(/\.(js|ts|jsx|tsx)$/)) continue;

        const lines = file.content.split('\n');
        const matchedLines = [];

        for (let i = 0; i < lines.length; i++) {
            debugRegex.lastIndex = 0;
            if (debugRegex.test(lines[i])) {
                matchedLines.push(i + 1);
            }
        }

        if (matchedLines.length === 0) continue;

        // Cap at 3 example locations
        const examples = matchedLines.slice(0, 3);
        const extraCount = matchedLines.length - examples.length;
        const locationStr = examples.map(l => `line ${l}`).join(', ') +
            (extraCount > 0 ? ` (+${extraCount} more)` : '');

        issues.push({
            category: 'Code Quality',
            severity: 'Info',
            file: file.path,
            line: examples[0],
            description: `${matchedLines.length} console.log/debug statement(s) found in production code at ${locationStr}.`,
            fix: 'Remove or replace debug console statements with a proper logging library (e.g. winston, pino) that can be silenced in production.'
        });
    }

    return issues;
}

const metadata = {"name":"Debug Statements","tier":"language-specific","languages":["js","ts"],"func":"detectDebugStatements"};
module.exports = { detectDebugStatements, metadata };
