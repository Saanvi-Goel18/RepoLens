const { Webhooks, createNodeMiddleware } = require("@octokit/webhooks");
const { Octokit } = require("octokit");
const { fetchFileContent } = require('./githubService');
const { runLinter } = require('./linter');
const { detectSecrets } = require('./detectors/secrets');
const { detectVibeIssues } = require('./detectors/vibe');
const { analyzeWithLLM } = require('./llmService');

// Requires a WEBHOOK_SECRET in .env
const webhooks = new Webhooks({
    secret: process.env.GITHUB_WEBHOOK_SECRET || "default_secret_for_local_testing",
});

webhooks.on("pull_request.opened", handlePullRequest);
webhooks.on("pull_request.synchronize", handlePullRequest);

async function handlePullRequest({ id, name, payload }) {
    const pr = payload.pull_request;
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const installationId = payload.installation?.id;

    console.log(`[Webhook] Processing PR #${pr.number} in ${owner}/${repo}`);

    // In a real GitHub App, you authenticate using the App's private key and installationId.
    // For simplicity in this local version, we use the user's GITHUB_TOKEN if available,
    // or an App-specific token if provided.
    const client = new Octokit({
        auth: process.env.GITHUB_TOKEN
    });

    try {
        // 1. Fetch PR Diff to find changed files
        const { data: filesData } = await client.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: pr.number,
            per_page: 100 // up to 100 files
        });

        // We only care about added or modified files (blobs)
        const changedFiles = filesData.filter(f => f.status !== 'removed');
        
        if (changedFiles.length === 0) {
            console.log(`[Webhook] No active file changes in PR #${pr.number}`);
            return;
        }

        // 2. Fetch content for changed files
        const selectedFiles = [];
        for (const file of changedFiles) {
            const content = await fetchFileContent(owner, repo, file.filename, process.env.GITHUB_TOKEN);
            if (content) {
                selectedFiles.push({
                    path: file.filename,
                    content: content
                });
            }
        }

        if (selectedFiles.length === 0) return;

        // 3. Run localized analysis
        console.log(`[Webhook] Running analysis on ${selectedFiles.length} files...`);
        const [linterIssues, secretIssues, vibeIssues] = await Promise.all([
            runLinter(selectedFiles),
            detectSecrets(selectedFiles),
            detectVibeIssues(selectedFiles)
        ]);

        const staticIssues = [...linterIssues, ...secretIssues, ...vibeIssues];
        const llmReport = await analyzeWithLLM(selectedFiles, staticIssues);

        // Combine issues
        const allIssues = [...staticIssues];
        if (llmReport && llmReport.issues) {
            allIssues.push(...llmReport.issues);
        }

        // 4. Post review comment
        if (allIssues.length > 0) {
            const body = `### RepoLens Automated Review 🔍\n\nI found **${allIssues.length}** potential issues in this PR:\n\n` + 
                         allIssues.map(i => `- **${i.severity}** in \`${i.file}\`: ${i.description}\n  *Fix:* ${i.fix}`).join("\n");
                         
            await client.rest.issues.createComment({
                owner,
                repo,
                issue_number: pr.number,
                body: body
            });
            console.log(`[Webhook] Posted comment to PR #${pr.number}`);
        } else {
            console.log(`[Webhook] No issues found for PR #${pr.number}`);
        }

    } catch (error) {
        console.error(`[Webhook] Failed to process PR #${pr.number}:`, error.message);
    }
}

const webhookMiddleware = createNodeMiddleware(webhooks, { path: "/webhook/github" });

module.exports = {
    webhookMiddleware
};
