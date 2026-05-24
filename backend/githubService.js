const { Octokit } = require("octokit");

// Initialize Octokit with token from environment if available
const authOpt = process.env.GITHUB_TOKEN ? { auth: process.env.GITHUB_TOKEN } : {};
const octokit = new Octokit(authOpt);

/**
 * Fetches the complete file tree of a repository
 */
async function fetchRepoTree(owner, repo) {
    try {
        // First get the default branch (usually main or master)
        const { data: repoInfo } = await octokit.rest.repos.get({
            owner,
            repo,
        });
        const defaultBranch = repoInfo.default_branch;

        // Get the tree recursively
        const { data: treeData } = await octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: defaultBranch,
            recursive: 'true'
        });

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
async function fetchFileContent(owner, repo, path) {
    try {
        const { data } = await octokit.rest.repos.getContent({
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
