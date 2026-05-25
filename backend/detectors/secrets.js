/**
 * Scans files for hardcoded secrets and environment variable issues.
 */
function detectSecrets(files) {
    const issues = [];
    
    const secretRegexes = [
        // AWS Access Key ID
        { regex: /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, type: "AWS Access Key" },
        // Generic API Key assignments (e.g., const apiKey = "sk-...")
        { regex: /(?:api_key|apikey|secret|token|password)[\s]*[:=][\s]*["']([^"']+)["']/gi, type: "Hardcoded Secret/Password" },
        // Bearer token (JWTs)
        { regex: /Bearer\s+(ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*)/g, type: "Hardcoded JWT Token" }
    ];

    let hasEnvExample = false;
    let hasEnv = false;

    for (const file of files) {
        if (file.path === '.env.example' || file.path.endsWith('/.env.example')) hasEnvExample = true;
        if (file.path === '.env' || file.path.endsWith('/.env')) hasEnv = true;

        // Skip non-source files or obviously safe files for secret scanning
        if (file.path.match(/(package\.json|package-lock\.json|\.md|\.svg|\.png|\.gitignore)$/)) continue;

        // Scan line by line for better reporting
        const lines = file.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip if it looks like a process.env reference
            if (line.includes('process.env.')) continue;

            for (const { regex, type } of secretRegexes) {
                // Reset regex state
                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(line)) !== null) {
                    
                    // Filter out false positives like dummy values
                    const matchedValue = match[1] || match[0];
                    const dummyValues = ['password', 'secret', 'token', 'your_api_key', '123456', 'test', 'dummy', 'xxxxxx', '<password>'];
                    if (dummyValues.includes(matchedValue.toLowerCase())) continue;
                    if (matchedValue.includes('${')) continue; // Template string var

                    issues.push({
                        category: "Security",
                        severity: "Critical",
                        file: file.path,
                        line: i + 1,
                        description: `Potential hardcoded ${type} found.`,
                        fix: `Move sensitive credentials to environment variables and reference them via process.env.`
                    });
                }
            }
        }
    }

    // Report if .env is committed or .env.example is missing
    if (hasEnv) {
         issues.push({
             category: "Security",
             severity: "Critical",
             file: ".env",
             line: 1,
             description: ".env file appears to be committed to version control.",
             fix: "Remove .env from the repository, add it to .gitignore, and rotate any secrets it contained."
         });
    } else if (!hasEnvExample) {
         issues.push({
             category: "Production Readiness",
             severity: "Info",
             file: "Root directory",
             line: 1,
             description: "No .env.example file found.",
             fix: "Create a .env.example file to document required environment variables without exposing actual secrets."
         });
    }

    return issues;
}

module.exports = {
    detectSecrets
};
