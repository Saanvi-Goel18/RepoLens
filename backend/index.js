require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// Import our core modules
const { fetchRepoTree, fetchFileContent } = require('./githubService');
const { prioritizeFiles } = require('./prioritizer');
const { runLinter } = require('./linter');
const { detectSecrets } = require('./detectors/secrets');
const { detectVibeIssues } = require('./detectors/vibe');
const { auditDependencies } = require('./audit');
const { analyzeWithLLM } = require('./llmService');
const { computeFinalScores } = require('./scorer');
const { saveScan, getRepoHistory, getRecentScans } = require('./db');
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

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', jobs: jobs.size });
});

app.post('/analyze', analyzeLimiter, authMiddleware, (req, res) => {
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
        userToken: req.userToken,
        status: 'queued',
        result: null,
        error: null,
        createdAt: new Date().toISOString()
    });

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
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
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
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax'
    });
    res.json({ success: true });
});

app.get('/result/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Report not found. It may have expired (1 hour TTL) or never existed.' });
    }

    // Strip out the userToken from the result so we don't leak it
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

    const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

    try {
        await Promise.race([
            runPipeline(job),
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

async function runPipeline(job) {
    const jobId = job.id;

    job.status = 'fetching';

    // 1. Fetch File Tree
    const allFiles = await fetchRepoTree(job.owner, job.repo, job.userToken);

    // 2. Prioritize and fetch contents
    // Groq free tier TPM limit is 12,000 tokens/min per request.
    // Budget: 7k file content + ~600 system prompt + ~200 user prefix + ~2k response = ~9.8k total.
    const { selectedFiles, totalTokens } = await prioritizeFiles(allFiles, 7000, async (path) => {
        return await fetchFileContent(job.owner, job.repo, path, job.userToken);
    });

    console.log(`[${jobId}] Fetched ${selectedFiles.length} files (${totalTokens} tokens)`);

    // Expose stats so the frontend can display "N files scanned"
    job.stats = { filesAnalyzed: selectedFiles.length, totalTokens };

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
    
    try {
        await saveScan(jobId, job.owner, job.repo, finalReport.overallScore, finalReport.categoryScores);
    } catch (err) {
        console.error(`[${jobId}] Failed to save scan to history:`, err.message);
    }

    console.log(`[${jobId}] Done. Overall score: ${finalReport.overallScore}`);
}

app.listen(PORT, () => {
    console.log(`RepoLens Backend running on port ${PORT}`);
});
