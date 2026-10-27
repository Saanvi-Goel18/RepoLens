const { Webhooks, createNodeMiddleware } = require("@octokit/webhooks");
const { Octokit } = require("octokit");
const { fetchFileContent } = require('./githubService');
const { runStaticAnalysis, runChunkedLLMAnalysis } = require('./analysisPipeline');
const { computeFinalScores } = require('./scorer');

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

    console.log(`[Webhook] Processing PR #${pr.number} in ${owner}/${repo}`);

    // In a real GitHub App, you authenticate using the App's private key and installationId.
    // For simplicity in this local version, we use the server's own GITHUB_TOKEN — which
    // means this only works for repos that token already has comment access to, not for
    // arbitrary third-party repos installing this as a GitHub App.
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
            // Read the PR head's version of the file, not the default branch's —
            // otherwise added files 404 and modified files are reviewed pre-change.
            const content = await fetchFileContent(owner, repo, file.filename, process.env.GITHUB_TOKEN, pr.head.sha);
            if (content) {
                selectedFiles.push({
                    path: file.filename,
                    content: content
                });
            }
        }

        if (selectedFiles.length === 0) return;

        // 3. Run the same static + chunked-LLM pipeline the full-repo scan uses (see
        // analysisPipeline.js), so a PR review isn't a lighter, drifted copy of the real
        // analysis — same detector set (minus "CI/CD", which infers absence from silence
        // and would false-positive on every PR since workflow files are rarely in the diff)
        // and the same chunking/merge strategy, so large PRs don't blow the LLM token budget.
        console.log(`[Webhook] Running analysis on ${selectedFiles.length} files...`);
        const { staticIssues } = await runStaticAnalysis(selectedFiles, { excludeNames: ['CI/CD'] });
        const llmReport = await runChunkedLLMAnalysis(selectedFiles, staticIssues, { chunkSize: 4500 });
        const finalReport = computeFinalScores(llmReport, staticIssues);

        // 4. Post review
        if (finalReport.issues.length > 0) {
            await postReview(client, owner, repo, pr, finalReport.issues);
        } else {
            console.log(`[Webhook] No issues found for PR #${pr.number}`);
        }

    } catch (error) {
        console.error(`[Webhook] Failed to process PR #${pr.number}:`, error.message);
    }
}

// Post one batched review with each issue anchored inline to its file/line — real PR
// review comments instead of one flat comment dumping every issue.
//
// We deliberately do NOT wrap `issue.fix` in a GitHub ```suggestion block. A suggestion
// block lets a reviewer one-click-commit its contents as literal replacement code, but
// `fix` is LLM-written advice prose ("use parameterized queries instead"), not guaranteed
// -valid replacement code — auto-applying it could silently corrupt the file. Inline
// comments give the file/line anchor without that risk.
async function postReview(client, owner, repo, pr, issues) {
    const comments = issues
        .filter(i => i.file && i.line)
        .map(i => ({
            path: i.file,
            line: i.line,
            side: 'RIGHT',
            body: `**${i.severity} · ${i.category}**\n${i.description}\n\n*Fix:* ${i.fix}`
        }));

    const summaryBody = `### RepoLens Automated Review 🔍\n\nFound **${issues.length}** potential issue${issues.length === 1 ? '' : 's'} in this PR.`;

    try {
        await client.rest.pulls.createReview({
            owner,
            repo,
            pull_number: pr.number,
            event: 'COMMENT',
            body: summaryBody,
            comments
        });
        console.log(`[Webhook] Posted inline review with ${comments.length} comment(s) on PR #${pr.number}`);
    } catch (err) {
        // Any comment anchored outside this diff's hunks (or any other review-API
        // rejection) fails the whole batched review atomically — fall back to one flat
        // comment so the findings still reach the PR instead of silently disappearing.
        console.warn(`[Webhook] Inline review failed (${err.message}), falling back to a flat comment`);
        const body = summaryBody + "\n\n" +
            issues.map(i => `- **${i.severity}** in \`${i.file}\`: ${i.description}\n  *Fix:* ${i.fix}`).join("\n");
        await client.rest.issues.createComment({ owner, repo, issue_number: pr.number, body });
    }
}

const webhookMiddleware = createNodeMiddleware(webhooks, { path: "/webhook/github" });

module.exports = {
    webhookMiddleware
};
