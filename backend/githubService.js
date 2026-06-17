const { Octokit } = require("octokit");

// Initialize Octokit with token from environment if available
const authOpt = process.env.GITHUB_TOKEN ? { auth: process.env.GITHUB_TOKEN } : {};
const globalOctokit = new Octokit(authOpt);

function getOctokit(userToken) {
    if (userToken) {
        return new Octokit({ auth: userToken });
    }
    return globalOctokit;
}

/**
 * Fetches the complete file tree of a repository
 */
async function fetchRepoTree(owner, repo, userToken = null) {
    try {
        const client = getOctokit(userToken);
        // First get the default branch (usually main or master)
        const { data: repoInfo } = await client.rest.repos.get({
            owner,
            repo,
        });
        const defaultBranch = repoInfo.default_branch;

        // Get the tree recursively
        const { data: treeData } = await client.rest.git.getTree({
            owner,
            repo,
            tree_sha: defaultBranch,
            recursive: 'true'
        });

        // GitHub truncates the tree for repos with >100k files or >7MB payload.
        // Log a warning so the job result can reflect partial coverage.
        if (treeData.truncated) {
            console.warn(`[${owner}/${repo}] GitHub tree response was truncated. Analysis covers a partial file list.`);
        }

        // Filter for files only (blobs)
        const files = treeData.tree.filter(item => item.type === 'blob');
        return files.map(f => ({
            path: f.path,
            size: f.size,
            url: f.url
        }));
    } catch (error) {
        console.error("Error fetching repo tree:", error.message);
        throw error;
    }
}

/**
 * Fetches the content of a specific file
 */
async function fetchFileContent(owner, repo, path, userToken = null) {
    try {
        const client = getOctokit(userToken);
        const { data } = await client.rest.repos.getContent({
            owner,
            repo,
            path,
        });
        
        if (data.type === 'file') {
            return Buffer.from(data.content, 'base64').toString('utf8');
        }
        return null;
    } catch (error) {
        console.error(`Error fetching file content for ${path}:`, error.message);
        throw error;
    }
}

module.exports = {
    fetchRepoTree,
    fetchFileContent
};
