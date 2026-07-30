/**
 * Dependency Vulnerability Audit using the OSV API
 */

async function auditDependencies(files) {
    const issues = [];
    
    let queries = [];

    // --- NPM (package.json) ---
    const packageJsonFile = files.find(f => f.path === 'package.json' || f.path.endsWith('/package.json'));
    if (packageJsonFile) {
        try {
            const pkg = JSON.parse(packageJsonFile.content);
            const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
            Object.entries(dependencies).forEach(([pkgName, version]) => {
                const cleanVersion = version.replace(/[\^~><= ]/g, '').split(/\s+/)[0].trim();
                if (cleanVersion && cleanVersion !== '*' && cleanVersion !== 'latest') {
                    queries.push({
                        package: { name: pkgName, ecosystem: "npm" },
                        version: cleanVersion,
                        _file: packageJsonFile.path
                    });
                }
            });
        } catch (e) {
            console.warn("Failed to parse package.json");
        }
    }

    // --- Python (requirements.txt) ---
    const reqFile = files.find(f => f.path === 'requirements.txt' || f.path.endsWith('/requirements.txt'));
    if (reqFile) {
        const lines = reqFile.content.split('\n');
        lines.forEach(line => {
            const match = line.match(/^([a-zA-Z0-9_\-]+)==([0-9\.]+)$/);
            if (match) {
                queries.push({
                    package: { name: match[1], ecosystem: "PyPI" },
                    version: match[2],
                    _file: reqFile.path
                });
            }
        });
    }

    // --- Go (go.mod) ---
    const goModFile = files.find(f => f.path === 'go.mod' || f.path.endsWith('/go.mod'));
    if (goModFile) {
        const lines = goModFile.content.split('\n');
        lines.forEach(line => {
            // go.mod typically has: require github.com/foo/bar v1.2.3
            // or inside a require block: github.com/foo/bar v1.2.3
            const match = line.match(/^\s*(?:require\s+)?([a-zA-Z0-9_\-\.\/]+)\s+v([0-9\.]+.*)$/);
            if (match) {
                queries.push({
                    package: { name: match[1], ecosystem: "Go" },
                    version: match[2], // strip 'v'
                    _file: goModFile.path
                });
            }
        });
    }



    if (queries.length === 0) return issues;

    try {
        // OSV API allows max 1000 queries per batch
        const batch = { queries: queries.slice(0, 1000) };
        
        const response = await fetch('https://api.osv.dev/v1/querybatch', {
            method: 'POST',
            body: JSON.stringify(batch),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            console.error("OSV API error:", response.statusText);
            return issues;
        }

        const data = await response.json();
        
        // Results map 1:1 to queries
        if (data.results) {
            data.results.forEach((res, index) => {
                if (res.vulns && res.vulns.length > 0) {
                    const q = queries[index];
                    // Just take the first vulnerability for simplicity
                    const vuln = res.vulns[0];
                    issues.push({
                        category: "Security",
                        severity: "Critical",
                        file: q._file || "package.json",
                        line: 1,
                        description: `Vulnerable dependency detected: ${q.package.name}@${q.version}. OSV ID: ${vuln.id}`,
                        fix: `Update ${q.package.name} to a secure version. Check OSV database for more details.`
                    });
                }
            });
        }

    } catch (error) {
         console.error("Dependency audit failed:", error.message);
    }

    return issues;
}

const metadata = { name: 'Dependencies', tier: 'universal', languages: null };
module.exports = {
    auditDependencies,
    metadata
};
