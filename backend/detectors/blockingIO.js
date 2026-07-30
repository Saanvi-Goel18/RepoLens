/**
 * Detects blocking I/O calls (readFileSync, execSync, writeFileSync)
 * inside files that also define an Express route handler.
 */
function detectBlockingIO(files) {
    const issues = [];

    const routeRegex = /app\.(get|post|put|delete|patch|use)\s*\(/;
    const blockingCalls = [
        { regex: /\breadFileSync\s*\(/, name: 'readFileSync' },
        { regex: /\bwriteFileSync\s*\(/, name: 'writeFileSync' },
        { regex: /\bexecSync\s*\(/, name: 'execSync' },
    ];

    for (const file of files) {
        if (!file.path.match(/\.(js|ts)$/)) continue;

        const hasRoutes = routeRegex.test(file.content);
        if (!hasRoutes) continue;

        const lines = file.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const { regex, name } of blockingCalls) {
                if (regex.test(line)) {
                    issues.push({
                        category: 'Scalability',
                        severity: 'Warning',
                        file: file.path,
                        line: i + 1,
                        description: `Blocking I/O call '${name}' used in a file that contains Express route handlers. This blocks the Node.js event loop and will degrade performance under concurrent requests.`,
                        fix: `Replace '${name}' with its async counterpart (e.g., fs.promises.readFile, fs.promises.writeFile, or child_process.exec with a callback/promisify).`
                    });
                }
            }
        }
    }

    return issues;
}

const metadata = {"name":"Blocking I/O","tier":"language-specific","languages":["js","ts"],"func":"detectBlockingIO"};
module.exports = { detectBlockingIO, metadata };
