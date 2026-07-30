/**
 * Detects missing global error-handling middleware in Express app entry files.
 * An Express error handler is a 4-argument middleware: (err, req, res, next).
 */
function detectMissingErrorHandler(files) {
    const issues = [];

    // Matches the 4-arg error handler signature: app.use((err, req, res, next) => ...)
    // or function(err, req, res, next) — handles different spacing and naming conventions
    const errorHandlerRegex = /(?:app\.use\s*\(\s*)?function\s*\w*\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*\w+\s*\)|(?:app\.use\s*\()?\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*\w+\s*\)\s*=>/;

    for (const file of files) {
        if (!file.path.match(/\.(js|ts)$/)) continue;

        const content = file.content;

        // Only check files that actually set up an Express app
        const isExpressApp = content.includes('express()') && content.match(/app\.listen\s*\(/);
        if (!isExpressApp) continue;

        const hasErrorHandler = errorHandlerRegex.test(content);
        if (!hasErrorHandler) {
            issues.push({
                category: 'Production Readiness',
                severity: 'Warning',
                file: file.path,
                line: 1,
                description: 'Express app defined with app.listen() but no global 4-argument error-handling middleware (err, req, res, next) found. Unhandled errors will return empty responses or crash the process.',
                fix: 'Add a global error handler at the end of your middleware stack: app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: "Internal Server Error" }); });'
            });
        }
    }

    return issues;
}

const metadata = {"name":"Missing Error Handler","tier":"language-specific","languages":["js","ts"],"func":"detectMissingErrorHandler"};
module.exports = { detectMissingErrorHandler, metadata };
