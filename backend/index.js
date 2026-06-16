require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

// Import our core modules
const { fetchRepoTree, fetchFileContent } = require('./githubService');
const { prioritizeFiles } = require('./prioritizer');
const { runLinter } = require('./linter');
const { detectSecrets } = require('./detectors/secrets');
const { detectVibeIssues } = require('./detectors/vibe');
const { auditDependencies } = require('./audit');
const { analyzeWithLLM } = require('./llmService');
const { computeFinalScores } = require('./scorer');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────
// Restrict CORS to the configured frontend origin.
// Defaults to localhost:5173 for local dev; set FRONTEND_URL in production.
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// Rate limiter: max 5 analysis requests per IP per 15 minutes
const analyzeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many analysis requests. Please wait 15 minutes before trying again.' }
});

// ─── Job Store ────────────────────────────────────────────────────────────────
const jobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

// Clean up expired jobs every 30 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs.entries()) {
        if (now - new Date(job.createdAt).getTime() > JOB_TTL_MS) {
            jobs.delete(id);
        }
    }
}, 30 * 60 * 1000);

// ─── Input Validation ─────────────────────────────────────────────────────────
function parseGitHubUrl(rawUrl) {
    // Accept: https://github.com/owner/repo or github.com/owner/repo
    let url = rawUrl.trim().replace(/\.git$/, '').replace(/\/$/, '');
    if (!url.startsWith('http')) url = `https://${url}`;

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }

    if (parsed.hostname !== 'github.com') return null;

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    return { owner: parts[0], repo: parts[1] };
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', jobs: jobs.size });
});

app.post('/analyze', analyzeLimiter, (req, res) => {
    const { repoUrl } = req.body;

    if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
        return res.status(400).json({
            error: 'Invalid URL. Please provide a valid public GitHub repository URL (e.g. https://github.com/owner/repo).'
        });
    }

    const jobId = crypto.randomUUID();

    jobs.set(jobId, {
        id: jobId,
        repoUrl: repoUrl.trim(),
        owner: parsed.owner,
        repo: parsed.repo,
        status: 'queued',
        result: null,
        error: null,
        createdAt: new Date().toISOString()
    });

    processJob(jobId, parsed.owner, parsed.repo).catch(err => {
        console.error(`Job ${jobId} failed:`, err);
    });

    res.status(202).json({ jobId, status: 'queued' });
});

app.get('/result/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Report not found. It may have expired (1 hour TTL) or never existed.' });
    }

    res.json(job);
});

// ─── Analysis Pipeline ────────────────────────────────────────────────────────
async function processJob(jobId, owner, repo) {
    const job = jobs.get(jobId);

    const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

    try {
        await Promise.race([
            runPipeline(job, owner, repo),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Analysis timed out after 3 minutes. The repository may be too large.')), TIMEOUT_MS)
            )
        ]);
    } catch (error) {
        job.status = 'error';
        job.error = error.message;
        console.error(`[${jobId}] Error:`, error.message);
    }
}

async function runPipeline(job, owner, repo) {
    const jobId = job.id;

    job.status = 'fetching';

    // 1. Fetch File Tree
    const allFiles = await fetchRepoTree(owner, repo);

    // 2. Prioritize and fetch contents
    // Groq free tier TPM limit is 12,000 tokens/min per request.
    // Budget: 7k file content + ~600 system prompt + ~200 user prefix + ~2k response = ~9.8k total.
    const { selectedFiles, totalTokens } = await prioritizeFiles(allFiles, 7000, async (path) => {
        return await fetchFileContent(owner, repo, path);
    });

    console.log(`[${jobId}] Fetched ${selectedFiles.length} files (${totalTokens} tokens)`);

    job.status = 'analyzing';

    // 3. Static Analysis Layer (Run in parallel)
    const [linterIssues, secretIssues, vibeIssues, depIssues] = await Promise.all([
        runLinter(selectedFiles),
        detectSecrets(selectedFiles),
        detectVibeIssues(selectedFiles),
        auditDependencies(selectedFiles)
    ]);

    const staticIssues = [...linterIssues, ...secretIssues, ...vibeIssues, ...depIssues];
    console.log(`[${jobId}] Static analysis found ${staticIssues.length} issues`);

    // 4. LLM Analysis Layer
    const llmReport = await analyzeWithLLM(selectedFiles, staticIssues);

    // 5. Score Merger
    const finalReport = computeFinalScores(llmReport, staticIssues);

    job.status = 'done';
    job.result = finalReport;
    job.completedAt = new Date().toISOString();

    console.log(`[${jobId}] Done. Overall score: ${finalReport.overallScore}`);
}

app.listen(PORT, () => {
    console.log(`RepoLens Backend running on port ${PORT}`);
});
