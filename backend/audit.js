/**
 * Dependency Vulnerability Audit using the OSV API
 */

async function auditDependencies(files) {
    const issues = [];
    
    const packageJsonFile = files.find(f => f.path === 'package.json' || f.path.endsWith('/package.json'));
    if (!packageJsonFile) return issues;

    let dependencies = {};
    try {
        const pkg = JSON.parse(packageJsonFile.content);
        dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch (e) {
        return issues;
    }

    const queries = Object.entries(dependencies).map(([pkgName, version]) => {
        // Strip range operators, then take only the first segment.
        // Handles ">=1.2.3 <2.0.0" → "1.2.3" correctly.
        const cleanVersion = version.replace(/[\^~><= ]/g, '').split(/\s+/)[0].trim();
        return {
            package: { name: pkgName, ecosystem: "npm" },
            version: cleanVersion
        };
    });

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
                        file: packageJsonFile.path,
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

module.exports = {
    auditDependencies
};
