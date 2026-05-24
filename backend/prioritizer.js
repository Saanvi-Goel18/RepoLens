const { get_encoding } = require("tiktoken");

// Initialize tokenizer
let enc;
try {
    enc = get_encoding("cl100k_base"); // Common encoding for GPT models
} catch (e) {
    console.error("Failed to load tiktoken encoding:", e.message);
}

/**
 * Assigns a priority weight to a file based on its path/name.
 * Higher weight = more important.
 */
function getFileWeight(path) {
    path = path.toLowerCase();
    
    // Ignore common non-code directories/files
    if (path.match(/(node_modules|\.git|dist|build|public|assets|images|\.png|\.jpg|\.svg|\.ico|\.pdf|\.md)/)) {
        return 0;
    }

    // Entry points
    if (path.match(/^(index|app|server|main)\.(js|ts)$/)) return 10;
    
    // Auth, Middleware
    if (path.match(/(auth|login|register|middleware)/)) return 9;
    
    // Models, DB Config
    if (path.match(/(models?|schemas?|db|database|prisma|orm)/)) return 8;
    
    // Config files
    if (path.match(/(config|env|setup|\.json|\.yml|\.yaml)/)) return 7;
    
    // Routes, Controllers
    if (path.match(/(routes?|controllers?|handlers?)/)) return 6;
    
    // Default score for other source files
    if (path.match(/\.(js|ts|jsx|tsx|py|go|java|rb|php)$/)) return 3;
    
    return 1;
}

/**
 * Prioritizes a list of files and enforces a context budget.
 */
async function prioritizeFiles(files, maxTokens = 80000, fetchContentFn) {
    // 1. Assign weights
    const scoredFiles = files.map(f => ({
        ...f,
        weight: getFileWeight(f.path)
    })).filter(f => f.weight > 0);

    // 2. Sort by descending weight
    scoredFiles.sort((a, b) => b.weight - a.weight);

    // 3. Fetch contents and enforce token limit
    const selectedFiles = [];
    let currentTokens = 0;

    for (const file of scoredFiles) {
        try {
            const content = await fetchContentFn(file.path);
            if (!content) continue;
            
            // Estimate tokens (roughly)
            const tokens = enc ? enc.encode(content).length : Math.ceil(content.length / 4); // Fallback estimate
            
            if (currentTokens + tokens > maxTokens) {
                console.log(`Token budget reached. Skipping remaining files.`);
                break;
            }
            
            currentTokens += tokens;
            selectedFiles.push({
                path: file.path,
                content: content,
                tokens: tokens,
                weight: file.weight
            });
            
        } catch (err) {
            console.error(`Failed to process ${file.path}:`, err.message);
        }
    }

    return {
        selectedFiles,
        totalTokens: currentTokens
    };
}

module.exports = {
    getFileWeight,
    prioritizeFiles
};
