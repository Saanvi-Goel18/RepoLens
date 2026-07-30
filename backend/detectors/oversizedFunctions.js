/**
 * Detects oversized functions (>80 lines) using a brace-counting heuristic.
 * Works for regular functions and arrow functions in JS/TS.
 */
function detectOversizedFunctions(files) {
    const issues = [];

    // Matches the start of a function declaration or arrow function assigned to a variable
    const funcStartRegex = /(?:function\s+(\w+)\s*\(|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function)/;

    const MAX_LINES = 80;

    for (const file of files) {
        if (!file.path.match(/\.(js|ts|jsx|tsx)$/)) continue;

        const lines = file.content.split('\n');
        let braceDepth = 0;
        let funcStartLine = -1;
        let funcName = '';
        let inFunction = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (!inFunction) {
                const match = funcStartRegex.exec(line);
                if (match && line.includes('{')) {
                    funcName = match[1] || match[2] || match[3] || 'anonymous';
                    funcStartLine = i;
                    inFunction = true;
                    braceDepth = 0;
                }
            }

            if (inFunction) {
                for (const char of line) {
                    if (char === '{') braceDepth++;
                    if (char === '}') braceDepth--;
                }

                if (braceDepth <= 0 && inFunction && funcStartLine >= 0) {
                    const funcLength = i - funcStartLine + 1;
                    if (funcLength > MAX_LINES) {
                        issues.push({
                            category: 'Maintainability',
                            severity: 'Info',
                            file: file.path,
                            line: funcStartLine + 1,
                            description: `Function '${funcName}' is ${funcLength} lines long (starts at line ${funcStartLine + 1}). Functions over ${MAX_LINES} lines are hard to test and review.`,
                            fix: `Break '${funcName}' into smaller, single-responsibility helper functions.`
                        });
                    }
                    inFunction = false;
                    funcStartLine = -1;
                    funcName = '';
                    braceDepth = 0;
                }
            }
        }
    }

    return issues;
}

const metadata = {"name":"Function Size","tier":"universal","languages":null,"func":"detectOversizedFunctions"};
module.exports = { detectOversizedFunctions, metadata };
