import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, ShieldCheck, Zap, Activity } from 'lucide-react';
import './Home.css';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const GITHUB_URL_REGEX = /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/;

export default function Home() {
    const [repoUrl, setRepoUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    const validate = (url) => {
        if (!url.trim()) return 'Please enter a GitHub repository URL.';
        const clean = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
        if (!GITHUB_URL_REGEX.test(clean)) return 'Please enter a valid public GitHub URL (e.g. https://github.com/owner/repo).';
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const validationError = validate(repoUrl);
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`${BACKEND}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repoUrl: repoUrl.trim() })
            });

            const data = await response.json();

            if (response.status === 429) {
                setError(data.error || 'Rate limit reached. Please wait a few minutes before trying again.');
            } else if (response.ok) {
                navigate(`/r/${data.jobId}`);
            } else {
                setError(data.error || 'Failed to start analysis. Please try again.');
            }
        } catch (err) {
            setError('Cannot connect to the backend. Make sure it is running on port 3001.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="home-container animate-fade-in">
            <div className="hero-section">
                <div className="hero-badge">Hybrid Static + AI Analysis</div>
                <h1 className="hero-title">
                    Instant Health Report for your <span className="gradient-text">GitHub Repo</span>
                </h1>
                <p className="hero-subtitle">
                    Paste a public repository URL and get a structured security, scalability, and code quality report in seconds.
                </p>

                <form onSubmit={handleSubmit} className={`search-form glass-panel${error ? ' has-error' : ''}`}>
                    <Search className="search-icon" size={20} />
                    <input
                        type="text"
                        className="search-input"
                        placeholder="https://github.com/owner/repository"
                        value={repoUrl}
                        onChange={(e) => { setRepoUrl(e.target.value); setError(null); }}
                        disabled={isLoading}
                        autoFocus
                    />
                    <button type="submit" className="search-button" disabled={isLoading}>
                        {isLoading ? (
                            <span className="loading-dots">Analyzing<span>.</span><span>.</span><span>.</span></span>
                        ) : (
                            <>Analyze <ArrowRight size={18} /></>
                        )}
                    </button>
                </form>

                {error && <div className="error-message">{error}</div>}

                <p className="example-link-hint">
                    Try it: <button className="example-btn" onClick={() => setRepoUrl('https://github.com/expressjs/express')}>expressjs/express</button>
                </p>
            </div>

            <div className="features-grid">
                <div className="feature-card glass-panel">
                    <div className="feature-icon"><ShieldCheck size={24} /></div>
                    <h3>Security First</h3>
                    <p>Detects hardcoded secrets, vulnerable dependencies via OSV, and missing security middleware.</p>
                </div>
                <div className="feature-card glass-panel">
                    <div className="feature-icon"><Zap size={24} /></div>
                    <h3>Static + AI</h3>
                    <p>Combines deterministic ESLint/Regex scanning with contextual GPT-4o-mini architectural review.</p>
                </div>
                <div className="feature-card glass-panel">
                    <div className="feature-icon"><Activity size={24} /></div>
                    <h3>Weighted Scoring</h3>
                    <p>A 5-category rubric (Security 30%, Scalability 20%, Quality 20%, Production 20%, Maintainability 10%).</p>
                </div>
            </div>
        </div>
    );
}
