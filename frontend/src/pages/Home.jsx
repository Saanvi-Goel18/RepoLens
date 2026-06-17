import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Zap, Activity, GitBranch, Bot, TrendingUp, Code2, Lock } from 'lucide-react';
import './Home.css';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const GITHUB_URL_REGEX = /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/;

const EXAMPLES = [
    'https://github.com/expressjs/express',
    'https://github.com/axios/axios',
    'https://github.com/Saanvi-Goel18/DevBoard',
];

export default function Home() {
    const [repoUrl, setRepoUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [mounted, setMounted] = useState(false);
    const [token, setToken] = useState(localStorage.getItem('github_token'));
    const navigate = useNavigate();

    useEffect(() => { 
        setMounted(true); 
        
        // Handle OAuth callback
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken) {
            localStorage.setItem('github_token', urlToken);
            setToken(urlToken);
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    const handleLogin = () => {
        const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
        if (!clientId) {
            setError('GitHub Client ID is not configured in the frontend .env file.');
            return;
        }
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo`;
    };

    const handleLogout = () => {
        localStorage.removeItem('github_token');
        setToken(null);
    };

    const validate = (url) => {
        if (!url.trim()) return 'Please enter a GitHub repository URL.';
        const clean = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
        if (!GITHUB_URL_REGEX.test(clean)) return 'Enter a valid public GitHub URL (e.g. https://github.com/owner/repo).';
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validationError = validate(repoUrl);
        if (validationError) { setError(validationError); return; }
        setIsLoading(true);
        setError(null);
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(`${BACKEND}/analyze`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ repoUrl: repoUrl.trim() })
            });
            const data = await response.json();
            if (response.status === 429) {
                setError(data.error || 'Rate limit reached. Please wait a few minutes.');
            } else if (response.ok) {
                navigate(`/r/${data.jobId}`);
            } else {
                setError(data.error || 'Failed to start analysis. Please try again.');
            }
        } catch {
            setError('Cannot connect to the backend. Make sure it is running.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={`home-root${mounted ? ' mounted' : ''}`}>
            <div className="home-content">
                {/* ── Hero ── */}
                <section className="hero">
                    <div style={{ alignSelf: 'flex-end', marginBottom: '16px' }}>
                        {token ? (
                            <button className="example-tag" onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <GitBranch size={14}/> Connected to GitHub (Logout)
                            </button>
                        ) : (
                            <button className="example-tag" onClick={handleLogin} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-1)' }}>
                                <GitBranch size={14}/> Sign in with GitHub (for Private Repos)
                            </button>
                        )}
                    </div>
                    
                    <h1 className="hero-title">
                        Audit your <span className="gradient-text">GitHub</span> repositories
                    </h1>

                    <p className="hero-sub">
                        Paste a public GitHub URL to run a hybrid static and LLM-powered 
                        security, scalability, and code quality analysis.
                    </p>

                    {/* Search bar */}
                    <form onSubmit={handleSubmit} className={`search-wrap${error ? ' error' : ''}`}>
                        <div className="search-bar">
                            <GitBranch size={18} className="search-gh-icon" />
                            <input
                                className="search-input"
                                type="text"
                                placeholder="https://github.com/owner/repository"
                                value={repoUrl}
                                onChange={e => { setRepoUrl(e.target.value); setError(null); }}
                                disabled={isLoading}
                                autoFocus
                                spellCheck={false}
                            />
                            <button type="submit" className="search-btn" disabled={isLoading}>
                                {isLoading ? (
                                    <span className="btn-loader" />
                                ) : (
                                    <span>Analyze</span>
                                )}
                            </button>
                        </div>
                        {error && <p className="search-error">{error}</p>}
                    </form>

                    {/* Example links */}
                    <div className="examples">
                        <span className="examples-label">Try an example:</span>
                        {EXAMPLES.map(url => (
                            <button
                                key={url}
                                className="example-tag"
                                onClick={() => { setRepoUrl(url); setError(null); }}
                            >
                                {url.replace('https://github.com/', '')}
                            </button>
                        ))}
                    </div>
                </section>

                {/* ── Features ── */}
                <div className="features">
                    {[
                        {
                            icon: <ShieldCheck size={20} />,
                            title: 'Security Scanning',
                            desc: 'Detects hardcoded secrets, vulnerable dependencies via OSV, and missing security headers.',
                        },
                        {
                            icon: <Zap size={20} />,
                            title: 'Static + AI Analysis',
                            desc: 'Combines deterministic AST scanning with contextual architectural review.',
                        },
                        {
                            icon: <Activity size={20} />,
                            title: 'Health Scoring',
                            desc: 'Rubric-based evaluation covering Security, Scalability, Quality, and Maintainability.',
                        },
                    ].map(f => (
                        <div className="feature-card glass-panel" key={f.title}>
                            <div className="feature-icon">{f.icon}</div>
                            <div>
                                <h3 className="feature-title">{f.title}</h3>
                                <p className="feature-desc">{f.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Roadmap (Future Features) ── */}
                <section className="roadmap-section">
                    <h2 className="roadmap-title">What Else Can RepoLens Do? <br/><span className="gradient-text text-sm">(Future Features)</span></h2>
                    <div className="roadmap-grid">
                        <div className="roadmap-card glass-panel">
                            <div className="roadmap-icon"><Bot size={24} /></div>
                            <h3>GitHub PR Bot Integration 🤖</h3>
                            <p>Automatically analyze only the changed files and leave inline comments on Pull Requests for missed vulnerabilities.</p>
                        </div>
                        <div className="roadmap-card glass-panel">
                            <div className="roadmap-icon"><TrendingUp size={24} /></div>
                            <h3>Historical Trending & Tracking 📈</h3>
                            <p>Save scans over time and show a dashboard graph of repo health to answer: "Are we getting better or worse?"</p>
                        </div>
                        <div className="roadmap-card glass-panel">
                            <div className="roadmap-icon"><Code2 size={24} /></div>
                            <h3>Language Expansion 🐍🦀</h3>
                            <p>Expanding the heuristic engines to fully support Python (bandit/flake8) and Go (golangci-lint).</p>
                        </div>
                        <div className="roadmap-card glass-panel">
                            <div className="roadmap-icon"><Lock size={24} /></div>
                            <h3>Private Repo Support 🔐</h3>
                            <p>Connect your GitHub account securely via OAuth to analyze your company's private codebases.</p>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
}
