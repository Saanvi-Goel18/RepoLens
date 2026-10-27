/**
 * Shared static-analysis + chunked-LLM pipeline.
 *
 * Used by both the full-repo scan (index.js) and the PR webhook
 * (webhookHandler.js) so the two entry points can't silently drift into
 * running different detectors or a different chunking/merge strategy.
 */

const { runLinter, metadata: linterMeta } = require('./linter');
const { detectSecrets, metadata: secretsMeta } = require('./detectors/secrets');
const { detectVibeIssues, metadata: vibeMeta } = require('./detectors/vibe');
const { detectSQLInjection, metadata: sqlMeta } = require('./detectors/sqlInjection');
const { detectBlockingIO, metadata: blockingIOMeta } = require('./detectors/blockingIO');
const { detectDebugStatements, metadata: debugMeta } = require('./detectors/debugStatements');
const { detectMissingErrorHandler, metadata: errorHandlerMeta } = require('./detectors/missingErrorHandler');
const { detectOversizedFunctions, metadata: oversizedMeta } = require('./detectors/oversizedFunctions');
const { detectCICD, metadata: cicdMeta } = require('./detectors/cicd');
const { auditDependencies, metadata: auditMeta } = require('./audit');
const { analyzeWithLLM } = require('./llmService');

const ALL_DETECTORS = [
    { run: runLinter, meta: linterMeta },
    { run: detectSecrets, meta: secretsMeta },
    { run: detectVibeIssues, meta: vibeMeta },
    { run: detectSQLInjection, meta: sqlMeta },
    { run: detectBlockingIO, meta: blockingIOMeta },
    { run: detectDebugStatements, meta: debugMeta },
    { run: detectMissingErrorHandler, meta: errorHandlerMeta },
    { run: detectOversizedFunctions, meta: oversizedMeta },
    { run: detectCICD, meta: cicdMeta },
    { run: auditDependencies, meta: auditMeta },
];

function detectRepoLangs(files) {
    const repoLangs = new Set();
    for (const file of files) {
        if (file.path.endsWith('.js')) repoLangs.add('js');
        if (file.path.endsWith('.ts')) repoLangs.add('ts');
        if (file.path.endsWith('.py')) repoLangs.add('py');
        if (file.path.endsWith('.go')) repoLangs.add('go');
    }
    return repoLangs;
}

/**
 * Runs the gated 3-tier detector set against a file list.
 * @param {Array<{path: string, content: string}>} files
 * @param {{ excludeNames?: string[] }} [opts] - excludeNames skips detectors that only
 *   make sense against a *complete* repo tree (e.g. "CI/CD", which infers absence from
 *   silence — on a partial file list like a PR diff that always looks "missing").
 */
async function runStaticAnalysis(files, { excludeNames = [] } = {}) {
    const repoLangs = detectRepoLangs(files);

    const universalChecksRun = [];
    const languageSpecificChecksRun = [];
    const languageSpecificChecksSkipped = [];
    const activeDetectors = [];

    for (const detector of ALL_DETECTORS) {
        if (excludeNames.includes(detector.meta.name)) continue;

        if (detector.meta.tier === 'universal') {
            universalChecksRun.push(detector.meta.name);
            activeDetectors.push(detector);
        } else if (detector.meta.tier === 'language-specific') {
            const hasLang = detector.meta.languages.some(lang => repoLangs.has(lang));
            if (hasLang) {
                languageSpecificChecksRun.push(detector.meta.name);
                activeDetectors.push(detector);
            } else {
                languageSpecificChecksSkipped.push({
                    name: detector.meta.name,
                    reason: `No ${detector.meta.languages.join('/')} detected`
                });
            }
        }
    }

    const issueArrays = await Promise.all(
        activeDetectors.map(d => Promise.resolve(d.run(files)))
    );

    return {
        staticIssues: issueArrays.flat(),
        universalChecksRun,
        languageSpecificChecksRun,
        languageSpecificChecksSkipped
    };
}

/**
 * Splits files into token-budgeted chunks, runs each chunk through the LLM
 * (every chunk sees the full static-issue set + repo file list for cross-file
 * context), and merges per-category scores via weakest-link (min).
 */
async function runChunkedLLMAnalysis(selectedFiles, staticIssues, { chunkSize = 4500 } = {}) {
    const repoPaths = selectedFiles.map(f => f.path);
    const chunks = [];
    let currentChunk = [];
    let currentChunkTokens = 0;

    for (const file of selectedFiles) {
        const tokens = file.tokens ?? Math.ceil((file.content || '').length / 4);
        if (currentChunkTokens + tokens > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentChunkTokens = 0;
        }
        currentChunk.push(file);
        currentChunkTokens += tokens;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    let mergedIssues = [];
    const collectedScores = {
        security: [], scalability: [], quality: [], production: [], maintainability: []
    };
    const chunkScores = [];
    const skippedFiles = [];
    let chunksAnalyzed = 0;
    let partialAnalysis = false;

    for (let i = 0; i < chunks.length; i++) {
        try {
            const chunkReport = await analyzeWithLLM(chunks[i], staticIssues, repoPaths);
            mergedIssues = mergedIssues.concat(chunkReport.issues);
            chunkScores.push(chunkReport.categoryScores);
            for (const key of Object.keys(collectedScores)) {
                if (chunkReport.categoryScores[key] !== null && chunkReport.categoryScores[key] !== undefined) {
                    collectedScores[key].push(chunkReport.categoryScores[key]);
                }
            }
            chunksAnalyzed++;
        } catch (err) {
            console.error(`Error analyzing chunk ${i + 1}/${chunks.length}:`, err.message);
            chunkScores.push(null);
            partialAnalysis = true;
            skippedFiles.push(...chunks[i].map(f => f.path));
        }
    }

    const mergedCategoryScores = {};
    for (const key of Object.keys(collectedScores)) {
        mergedCategoryScores[key] = collectedScores[key].length > 0
            ? Math.min(...collectedScores[key])
            : 50; // Fallback if all chunks were null/failed
    }

    return {
        categoryScores: mergedCategoryScores,
        issues: mergedIssues,
        chunksAnalyzed,
        totalChunks: chunks.length,
        partialAnalysis,
        skippedFiles,
        chunkScores,
        chunkDetails: chunks.map(c => c.map(f => f.path))
    };
}

module.exports = {
    runStaticAnalysis,
    runChunkedLLMAnalysis,
    detectRepoLangs
};
