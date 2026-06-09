const { ESLint } = require("eslint");

// Create one ESLint instance at module load time (not per-job).
// Pinned to ESLint v8 API: useEslintrc + overrideConfig object.
const eslint = new ESLint({
    useEslintrc: false,
    overrideConfig: {
        env: { node: true, es2021: true, browser: true },
        parserOptions: { ecmaVersion: "latest", sourceType: "module" },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "warn",
            "no-unreachable": "warn"
        }
    }
});

async function runLinter(files) {
    const lintableFiles = files.filter(f => f.path.match(/\.(js|jsx|ts|tsx)$/));
    if (lintableFiles.length === 0) return [];

    const issues = [];

    for (const file of lintableFiles) {
        try {
            // ESLint programmatic API: lintText
            const results = await eslint.lintText(file.content, { filePath: file.path });
            
            for (const result of results) {
                for (const msg of result.messages) {
                    issues.push({
                        category: "Code Quality",
                        severity: msg.severity === 2 ? "Warning" : "Info", // 2 is error in ESLint, but for our scale, we treat all as Warning/Info
                        file: file.path,
                        line: msg.line,
                        description: `ESLint: ${msg.message} (${msg.ruleId || 'syntax error'})`,
                        fix: "Review the code block and address the ESLint warning/error."
                    });
                }
            }
        } catch (error) {
            console.error(`Linter failed for ${file.path}:`, error.message);
        }
    }

    return issues;
}

module.exports = {
    runLinter
};
