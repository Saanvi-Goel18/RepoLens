require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// Import our core modules
const { fetchRepoTree, fetchFileContent, checkRepoAccess } = require('./githubService');
const { prioritizeFiles } = require('./prioritizer');
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
const { computeFinalScores } = require('./scorer');
const { saveScan, getRepoHistory, getRecentScans, createJob, updateJob, getJob } = require('./db');
const { webhookMiddleware } = require('./webhookHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────
// Restrict CORS to the configured frontend origin.
// Defaults to localhost:5173 for local dev; set FRONTEND_URL in production.
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173'
].filter(Boolean);

// Restrict CORS to the configured frontend origin(s).
app.use(cors({ 
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }, 
    credentials: true 
}));

// GitHub Webhooks need the raw body, so we use the middleware BEFORE express.json()
app.use(webhookMiddleware);

app.use(express.json());
app.use(cookieParser());

// Rate limiter: max 5 analysis requests per IP per 15 minutes
const analyzeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — you have reached the limit of 5 scans per 15 minutes. Please wait and try again.' }
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

// ─── OAuth State Store ────────────────────────────────────────────────────────
const oauthStates = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [id, stateObj] of oauthStates.entries()) {
        if (now - stateObj.createdAt > 30 * 60 * 1000) {
            oauthStates.delete(id);
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

// ─── Auth Middleware ──────────────────────────────────────────────────────────
// Hard auth: used for routes that always require login.
function authMiddleware(req, res, next) {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userToken = decoded.githubToken;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired session' });
    }
}

// Soft auth: extracts the GitHub token from the JWT cookie if present and valid,
// but never blocks the request. Used for endpoints that are public by default
// but can leverage a user token if available (e.g. scanning private repos).
function optionalAuth(req, res, next) {
    req.userToken = null;
    const token = req.cookies.auth_token;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.userToken = decoded.githubToken;
        } catch {
            // Expired/invalid cookie — treat as unauthenticated, don't block
        }
    }
    next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', jobs: jobs.size });
});

app.post('/analyze', analyzeLimiter, optionalAuth, async (req, res) => {
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

    // ── Visibility gate ────────────────────────────────────────────────────────
    // Check repo accessibility *before* creating a job so we can give
    // instant, synchronous feedback instead of a deferred job failure.
    // checkRepoAccess uses an unauthenticated client when req.userToken is null,
    // so a private repo correctly returns 404 to unauthenticated callers.
    try {
        const { isPrivate } = await checkRepoAccess(parsed.owner, parsed.repo, req.userToken);
        if (isPrivate && !req.userToken) {
            // Authenticated users can reach private repos they have access to;
            // unauthenticated users never can.
            return res.status(403).json({
                error: 'This is a private repository. Please sign in with GitHub to scan it.',
                code: 'PRIVATE_REPO'
            });
        }
    } catch (err) {
        if (err.status === 404) {
            // GitHub returns 404 for both truly missing repos AND private repos
            // that the caller has no access to. Since we have no token here
            // we can't distinguish them — surface the privacy possibility.
            const hint = req.userToken
                ? 'Repository not found. Make sure the URL is correct and you have access.'
                : 'Repository not found. If this is a private repository, please sign in with GitHub to scan it.';
            return res.status(404).json({ error: hint, code: req.userToken ? 'NOT_FOUND' : 'PRIVATE_REPO' });
        }
        // Any other transient GitHub API error (rate limit on the check, network blip, etc.):
        // fail closed — do not create a job. Private repos must not slip through
        // just because GitHub's API hiccupped at the wrong moment.
        console.warn(`[/analyze] checkRepoAccess failed for ${parsed.owner}/${parsed.repo}:`, err.message);
        return res.status(503).json({
            error: "Couldn't verify repository access right now — please try again in a moment.",
            code: 'ACCESS_CHECK_FAILED'
        });
    }

    const jobId = crypto.randomUUID();

    jobs.set(jobId, {
        id: jobId,
        repoUrl: repoUrl.trim(),
        owner: parsed.owner,
        repo: parsed.repo,
        userToken: req.userToken,
        status: 'queued',
        result: null,
        error: null,
        createdAt: new Date().toISOString()
    });

    // Persist initial row to DB (non-blocking — a DB hiccup must not
    // block the 202 response or kill the in-flight job).
    createJob(jobId, parsed.owner, parsed.repo, repoUrl.trim())
        .catch(err => console.error(`[${jobId}] Failed to persist job to DB:`, err.message));

    // Start background processing
    processJob(jobId).catch(err => console.error(`Job ${jobId} failed completely:`, err));

    res.status(202).json({ jobId, status: 'queued' });
});

// ─── OAuth Routes ─────────────────────────────────────────────────────────────
app.get('/auth/github', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { createdAt: Date.now() });
    
    const clientId = process.env.GITHUB_CLIENT_ID;
    const redirectUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo&state=${state}`;
    res.redirect(redirectUrl);
});

app.get('/auth/github/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code or state');

    if (!oauthStates.has(state)) {
        return res.status(403).send('Invalid or expired CSRF state');
    }
    oauthStates.delete(state);

    try {
        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code: code
            })
        });
        
        const data = await response.json();
        if (data.error) {
            return res.status(400).send(data.error_description);
        }

        const tokenPayload = { githubToken: data.access_token };
        const jwtToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.cookie('auth_token', jwtToken, {
            httpOnly: true,
            secure: true, // Required for cross-origin cookies
            sameSite: 'None', // Required for cross-origin cookies between Vercel and Render
            maxAge: 24 * 60 * 60 * 1000
        });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(frontendUrl);
    } catch (err) {
        console.error('OAuth Error:', err);
        res.status(500).send('OAuth Error');
    }
});

app.get('/auth/status', (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) return res.json({ isAuthenticated: false });
    try {
        jwt.verify(token, process.env.JWT_SECRET);
        res.json({ isAuthenticated: true });
    } catch {
        res.json({ isAuthenticated: false });
    }
});

app.post('/auth/logout', (req, res) => {
    res.clearCookie('auth_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'None'
    });
    res.json({ success: true });
});

app.get('/result/:jobId', async (req, res) => {
    const { jobId } = req.params;
    let job = jobs.get(jobId);

    if (!job) {
        // Not in memory — the server may have restarted since the job ran.
        // Fall back to the DB, which holds the persisted result.
        try {
            job = await getJob(jobId);
        } catch (err) {
            console.error(`[${jobId}] DB fallback failed:`, err.message);
        }
    }

    if (!job) {
        return res.status(404).json({ error: 'Report not found. It may have expired or never existed.' });
    }

    // Strip out the userToken from the result so we don't leak it.
    // (userToken is never in the DB row, but may be on the in-memory object.)
    const safeJob = { ...job };
    delete safeJob.userToken;

    res.json(safeJob);
});

app.get('/trends/:owner/:repo', async (req, res) => {
    const { owner, repo } = req.params;
    try {
        const history = await getRepoHistory(owner, repo);
        res.json(history);
    } catch (err) {
        console.error('Error fetching trends:', err);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
});

app.get('/recent-scans', async (req, res) => {
    try {
        const scans = await getRecentScans(10);
        const anonymizedScans = scans.map(s => ({
            repoId: crypto.createHash('sha256').update(`${s.owner}/${s.repo}`).digest('hex').substring(0, 7),
            overall_score: s.overall_score
        }));
        res.json(anonymizedScans);
    } catch (err) {
        console.error('Error fetching recent scans:', err);
        res.status(500).json({ error: 'Failed to fetch recent scans' });
    }
});

// ─── Analysis Pipeline ────────────────────────────────────────────────────────
async function processJob(jobId) {
    const job = jobs.get(jobId);

    const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

    try {
        await Promise.race([
            runPipeline(job),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Analysis timed out after 15 minutes. The repository may be too large.')), TIMEOUT_MS)
            )
        ]);
    } catch (error) {
        job.status = 'error';
        job.error = error.message;
        console.error(`[${jobId}] Error:`, error.message);
        // Persist error state to DB so the result survives a restart.
        updateJob(jobId, { status: 'error', error: error.message, completedAt: new Date().toISOString() })
            .catch(err => console.error(`[${jobId}] Failed to update job error in DB:`, err.message));
    }
}

async function runPipeline(job) {
    const jobId = job.id;

    job.status = 'fetching';

    // 1. Fetch File Tree
    const allFiles = await fetchRepoTree(job.owner, job.repo, job.userToken);

    // 2. Prioritize and fetch contents
    // Groq free tier TPM limit is 12,000 tokens/min per request.
    // Fetch a large budget (40k tokens) and we will chunk it for the LLM.
    const { selectedFiles, totalTokens } = await prioritizeFiles(allFiles, 40000, async (path) => {
        return await fetchFileContent(job.owner, job.repo, path, job.userToken);
    });

    console.log(`[${jobId}] Fetched ${selectedFiles.length} files (${totalTokens} tokens)`);

    // Expose stats so the frontend can display "N files scanned"
    job.stats = { filesAnalyzed: selectedFiles.length, totalTokens };

    job.status = 'analyzing';

    // 3. Static Analysis Layer (3-Tier Architecture)
    const allDetectors = [
        { run: runLinter, meta: linterMeta },
        { run: detectSecrets, meta: secretsMeta },
        { run: detectVibeIssues, meta: vibeMeta },
        { run: detectSQLInjection, meta: sqlMeta },
        { run: detectBlockingIO, meta: blockingIOMeta },
        { run: detectDebugStatements, meta: debugMeta },
        { run: detectMissingErrorHandler, meta: errorHandlerMeta },
        { run: detectOversizedFunctions, meta: oversizedMeta },
        { run: detectCICD, meta: cicdMeta },
        { run: auditDependencies, meta: auditMeta }
    ];

    // Detect repo languages from selected files
    const repoLangs = new Set();
    for (const file of selectedFiles) {
        if (file.path.endsWith('.js')) repoLangs.add('js');
        if (file.path.endsWith('.ts')) repoLangs.add('ts');
        if (file.path.endsWith('.py')) repoLangs.add('py');
        if (file.path.endsWith('.go')) repoLangs.add('go');
    }

    const universalChecksRun = [];
    const languageSpecificChecksRun = [];
    const languageSpecificChecksSkipped = [];
    
    const activeDetectors = [];
    
    for (const detector of allDetectors) {
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
        activeDetectors.map(d => Promise.resolve(d.run(selectedFiles)))
    );

    const staticIssues = issueArrays.flat();
    console.log(`[${jobId}] Static analysis found ${staticIssues.length} issues`);

    // Update job.stats with transparency breakdown
    job.stats = {
        filesAnalyzed: selectedFiles.length,
        totalTokens,
        universalChecksRun,
        languageSpecificChecksRun,
        languageSpecificChecksSkipped,
        llmReviewRan: true
    };

    // 4. LLM Analysis Layer (Chunked)
    const CHUNK_SIZE = 6000;
    const chunks = [];
    let currentChunk = [];
    let currentChunkTokens = 0;

    for (const file of selectedFiles) {
        if (currentChunkTokens + file.tokens > CHUNK_SIZE && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentChunkTokens = 0;
        }
        currentChunk.push(file);
        currentChunkTokens += file.tokens;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    console.log(`[${jobId}] Split files into ${chunks.length} chunks for LLM analysis`);

    let mergedIssues = [];
    let collectedScores = {
        security: [], scalability: [], quality: [], production: [], maintainability: []
    };
    
    job.stats.chunksAnalyzed = 0;
    job.stats.totalChunks = chunks.length;
    job.stats.partialAnalysis = false;
    job.stats.skippedFiles = [];
    job.stats.chunkDetails = chunks.map(c => c.map(f => f.path));
    job.stats.chunkScores = [];

    for (let i = 0; i < chunks.length; i++) {
        try {
            console.log(`[${jobId}] Analyzing chunk ${i + 1} of ${chunks.length}...`);
            const chunkReport = await analyzeWithLLM(chunks[i], i === 0 ? staticIssues : []); 
            
            mergedIssues = mergedIssues.concat(chunkReport.issues);
            job.stats.chunkScores.push(chunkReport.categoryScores);
            
            for (const key of Object.keys(collectedScores)) {
                if (chunkReport.categoryScores[key] !== null && chunkReport.categoryScores[key] !== undefined) {
                    collectedScores[key].push(chunkReport.categoryScores[key]);
                }
            }
            job.stats.chunksAnalyzed++;
        } catch (err) {
            console.error(`[${jobId}] Error analyzing chunk ${i + 1}:`, err.message);
            job.stats.chunkScores.push(null);
            job.stats.partialAnalysis = true;
            job.stats.skippedFiles = job.stats.skippedFiles.concat(chunks[i].map(f => f.path));
        }

        if (i < chunks.length - 1) {
            console.log(`[${jobId}] Delaying 60s for rate limit...`);
            await new Promise(r => setTimeout(r, 60000));
        }
    }

    // Merge strategy: Weakest link (minimum score) for each category
    const mergedCategoryScores = {};
    for (const key of Object.keys(collectedScores)) {
        if (collectedScores[key].length > 0) {
            mergedCategoryScores[key] = Math.min(...collectedScores[key]);
        } else {
            mergedCategoryScores[key] = 50; // Fallback if all chunks were null/failed
        }
    }

    const llmReport = {
        categoryScores: mergedCategoryScores,
        issues: mergedIssues
    };

    // 5. Score Merger
    const finalReport = computeFinalScores(llmReport, staticIssues);

    job.status = 'done';
    job.result = finalReport;
    job.completedAt = new Date().toISOString();
    
    try {
        await saveScan(jobId, job.owner, job.repo, finalReport.overallScore, finalReport.categoryScores);
    } catch (err) {
        console.error(`[${jobId}] Failed to save scan to history:`, err.message);
    }

    // Persist full result to DB so the report survives a restart.
    // stats is already populated on job by this point (set in step 2 above).
    try {
        await updateJob(jobId, {
            status:      'done',
            result:      finalReport,
            stats:       job.stats,
            completedAt: job.completedAt,
        });
    } catch (err) {
        console.error(`[${jobId}] Failed to update job result in DB:`, err.message);
    }

    console.log(`[${jobId}] Done. Overall score: ${finalReport.overallScore}`);
}

app.listen(PORT, () => {
    console.log(`RepoLens Backend running on port ${PORT}`);
});
