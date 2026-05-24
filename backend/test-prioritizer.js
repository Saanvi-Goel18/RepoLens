require('dotenv').config();
const { fetchRepoTree, fetchFileContent } = require('./githubService');
const { prioritizeFiles } = require('./prioritizer');

async function test() {
    const owner = 'expressjs';
    const repo = 'express';
    
    console.log(`Fetching tree for ${owner}/${repo}...`);
    try {
        const files = await fetchRepoTree(owner, repo);
        console.log(`Found ${files.length} files.`);
        
        console.log(`Prioritizing files...`);
        const { selectedFiles, totalTokens } = await prioritizeFiles(files, 80000, async (path) => {
            return await fetchFileContent(owner, repo, path);
        });
        
        console.log(`\nSelected ${selectedFiles.length} files. Total tokens: ${totalTokens}`);
        console.log('\nTop 5 prioritized files:');
        selectedFiles.slice(0, 5).forEach(f => {
            console.log(`- [Weight: ${f.weight}] ${f.path} (${f.tokens} tokens)`);
        });
        
    } catch (err) {
        console.error("Test failed:", err);
    }
}

test();
