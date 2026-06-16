/**
 * Custom vibe-coded checks: missing rate limiting, poor async error handling, module system mismatches.
 */
function detectVibeIssues(files) {
    const issues = [];
    
    let hasExpressRateLimit = false;
    let hasAuthRoutes = false;
    
    // Check for express-rate-limit and auth routes
    for (const file of files) {
        if (file.content.match(/rate-?limit|throttl/i)) {
            hasExpressRateLimit = true;
        }
        if (file.path.match(/(auth|login|register)/i) || file.content.match(/app\.(post|get)\(['"]\/(login|register|auth|api)/i)) {
            hasAuthRoutes = true;
        }
    }

    if (hasAuthRoutes && !hasExpressRateLimit) {
        issues.push({
            category: "Security",
            severity: "Critical",
            file: "Global",
            line: 1,
            description: "Auth routes detected but no rate limiting middleware ('express-rate-limit', 'throttler', etc.) appears to be used.",
            fix: "Install and configure a rate limiter to prevent brute-force attacks on your authentication endpoints."
        });
    }

    // Check for unhandled DB calls in async functions (basic heuristic)
    // Looking for `await db.xxx` or `await Prisma.xxx` without a try/catch block
    for (const file of files) {
        if (!file.path.match(/\.(js|ts)$/)) continue;

        const lines = file.content.split('\n');
        let inTryBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.match(/\btry\s*\{/)) {
                inTryBlock = true;
            }
            if (line.match(/\bcatch\s*\(/)) {
                // Catches both `catch (err)` and `catch(err)` styles
                inTryBlock = false;
            }

            // Heuristic for DB call
            if (line.match(/await\s+(prisma\.|mongoose\.|[a-zA-Z]*db\.|User\.|Post\.)(find|create|update|delete|query|insert|select)/i)) {
                if (!inTryBlock && !file.content.includes('express-async-errors') && !file.content.includes('express-async-handler')) {
                     // Sometimes they handle it via a wrapper. This is a heuristic.
                     issues.push({
                         category: "Code Quality",
                         severity: "Warning",
                         file: file.path,
                         line: i + 1,
                         description: "Database call made without explicit try/catch error handling.",
                         fix: "Wrap database operations in a try/catch block or use a global async error handler to prevent unhandled promise rejections crashing the server."
                     });
                }
            }
        }
    }

    // Module system conflicts — check per file, not globally.
    // Checking globally causes false positives on full-stack projects
    // where frontend (ESM) and backend (CJS) coexist legitimately.
    for (const file of files) {
        if (!file.path.endsWith('.js') && !file.path.endsWith('.ts')) continue;
        const hasRequire = file.content.match(/require\(['"']/);
        const hasImport  = file.content.match(/^import .* from ['"]/m);
        if (hasRequire && hasImport) {
            issues.push({
                category: "Code Quality",
                severity: "Warning",
                file: file.path,
                line: 1,
                description: `Mixed module systems in ${file.path}: uses both require() (CommonJS) and import (ESM).`,
                fix: "Standardize on either CommonJS (require) or ESM (import/export) within this file to avoid runtime errors."
            });
        }
    }

    return issues;
}

module.exports = {
    detectVibeIssues
};
