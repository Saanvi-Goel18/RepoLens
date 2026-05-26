require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

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

app.use(cors());
app.use(express.json());

// In-memory queue/store for jobs
const jobs = new Map();

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/analyze', (req, res) => {
    const { repoUrl } = req.body;
    
    if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
    }

    const jobId = crypto.randomUUID();
    
    jobs.set(jobId, {
        id: jobId,
        repoUrl,
        status: 'queued', 
        result: null,
        error: null,
        createdAt: new Date().toISOString()
    });

    processJob(jobId, repoUrl).catch(err => {
        console.error(`Job ${jobId} failed:`, err);
    });

    res.status(202).json({ jobId, status: 'queued' });
});

app.get('/result/:jobId', (req, res) => {
    const { jobId } = req.params;
    
    const job = jobs.get(jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
});

// The actual analysis pipeline
async function processJob(jobId, repoUrl) {
    const job = jobs.get(jobId);
    
    try {
        // Parse owner and repo from URL
        let cleanUrl = repoUrl.replace(/\.git$/, '');
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        const parts = cleanUrl.split('/');
        const repo = parts.pop();
        const owner = parts.pop();

        if (!owner || !repo) {
            throw new Error("Invalid GitHub URL format");
        }

        job.status = 'fetching';
        
        // 1. Fetch File Tree
        const allFiles = await fetchRepoTree(owner, repo);
        
        // 2. Prioritize and fetch contents (max 80k tokens)
        const { selectedFiles } = await prioritizeFiles(allFiles, 80000, async (path) => {
            return await fetchFileContent(owner, repo, path);
        });

        job.status = 'analyzing';
        
        // 3. Static Analysis Layer (Run in parallel)
        const [linterIssues, secretIssues, vibeIssues, depIssues] = await Promise.all([
            runLinter(selectedFiles),
            detectSecrets(selectedFiles),
            detectVibeIssues(selectedFiles),
            auditDependencies(selectedFiles)
        ]);

        const staticIssues = [...linterIssues, ...secretIssues, ...vibeIssues, ...depIssues];

        // 4. LLM Analysis Layer
        const llmReport = await analyzeWithLLM(selectedFiles, staticIssues);

        // 5. Score Merger
        const finalReport = computeFinalScores(llmReport, staticIssues);

        job.status = 'done';
        job.result = finalReport;

    } catch (error) {
        job.status = 'error';
        job.error = error.message;
        console.error(`Error processing job ${jobId}:`, error);
    }
}

app.listen(PORT, () => {
    console.log(`RepoLens Backend running on port ${PORT}`);
});
