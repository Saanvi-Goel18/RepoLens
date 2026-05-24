require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory queue/store for jobs
const jobs = new Map();

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Endpoint to start analysis
app.post('/analyze', (req, res) => {
    const { repoUrl } = req.body;
    
    if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
    }

    // Generate a unique job ID
    const jobId = require('crypto').randomUUID();
    
    // Initialize job state
    jobs.set(jobId, {
        id: jobId,
        repoUrl,
        status: 'queued', // queued -> fetching -> analyzing -> done -> error
        result: null,
        error: null,
        createdAt: new Date().toISOString()
    });

    // Fire and forget the background process (for now, we'll just mock a delay)
    processJob(jobId, repoUrl).catch(err => {
        console.error(`Job ${jobId} failed:`, err);
    });

    // Return the job ID immediately
    res.status(202).json({ jobId, status: 'queued' });
});

// Endpoint to poll for job status
app.get('/result/:jobId', (req, res) => {
    const { jobId } = req.params;
    
    const job = jobs.get(jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
});

// Mock processing function (will be replaced with actual pipeline later)
async function processJob(jobId, repoUrl) {
    const job = jobs.get(jobId);
    
    try {
        job.status = 'fetching';
        // Mock delay for fetching
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        job.status = 'analyzing';
        // Mock delay for analyzing
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        job.status = 'done';
        job.result = {
            overallScore: 85,
            categories: {
                security: 80,
                scalability: 90,
                quality: 85,
                production: 75,
                maintainability: 95
            },
            issues: [
                {
                    category: 'Security',
                    severity: 'Warning',
                    file: 'config/db.js',
                    line: 12,
                    description: 'No password set for database connection in development',
                    fix: 'Use environment variables for database credentials even in development'
                }
            ]
        };
    } catch (error) {
        job.status = 'error';
        job.error = error.message;
    }
}

app.listen(PORT, () => {
    console.log(`RepoLens Backend running on port ${PORT}`);
});
