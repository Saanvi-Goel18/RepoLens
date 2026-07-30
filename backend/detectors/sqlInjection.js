/**
 * Detects SQL injection risks: SQL strings built via concatenation or
 * template literals that mix SQL keywords with variables.
 */
function detectSQLInjection(files) {
    const issues = [];

    // Matches: string concatenation like 'SELECT ... ' + var
    // or template literals like `SELECT ... ${var}`
    const concatSQLRegex = /['"`](SELECT|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b[^'"`]*['"`]\s*\+\s*\w+/gi;
    const templateSQLRegex = /`(SELECT|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b[^`]*\$\{[^}]+\}[^`]*`/gi;

    for (const file of files) {
        if (!file.path.match(/\.(js|ts|py|php|rb|java)$/)) continue;

        const lines = file.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Reset regex state before each exec
            concatSQLRegex.lastIndex = 0;
            templateSQLRegex.lastIndex = 0;

            if (concatSQLRegex.test(line) || templateSQLRegex.test(line)) {
                issues.push({
                    category: 'Security',
                    severity: 'Critical',
                    file: file.path,
                    line: i + 1,
                    description: `Potential SQL injection: SQL query built via string concatenation or template literal with variable interpolation on line ${i + 1}.`,
                    fix: 'Use parameterized queries or a query builder (e.g. knex, pg\'s $1 placeholders) instead of building SQL strings dynamically.'
                });
            }
        }
    }

    return issues;
}

const metadata = {"name":"SQL Injection","tier":"language-specific","languages":["js","ts"],"func":"detectSQLInjection"};
module.exports = { detectSQLInjection, metadata };
