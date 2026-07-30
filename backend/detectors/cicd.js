/**
 * Detects whether common CI/CD configuration files are present in the repository.
 * Universal check.
 */
function detectCICD(files) {
    const issues = [];
    
    let hasCICD = false;
    
    for (const file of files) {
        const path = file.path.toLowerCase();
        if (
            path.includes('.github/workflows/') ||
            path === '.travis.yml' ||
            path === '.gitlab-ci.yml' ||
            path.includes('.circleci/config.yml') ||
            path === 'azure-pipelines.yml'
        ) {
            hasCICD = true;
            break;
        }
    }
    
    if (!hasCICD) {
        issues.push({
            category: 'Production Readiness',
            severity: 'Info',
            file: 'Root directory',
            line: 1,
            description: 'No common CI/CD configuration found (e.g. GitHub Actions, Travis, GitLab CI, CircleCI, Azure Pipelines).',
            fix: 'Set up an automated CI/CD pipeline to run tests, linters, and deployments automatically on each push.'
        });
    }
    
    return issues;
}

const metadata = { name: 'CI/CD', tier: 'universal', languages: null };

module.exports = { detectCICD, metadata };
