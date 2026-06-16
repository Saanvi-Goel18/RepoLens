import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Zap, Activity, GitBranch } from 'lucide-react';
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
    const navigate = useNavigate();

    useEffect(() => { setMounted(true); }, []);

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
            const response = await fetch(`${BACKEND}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

            {/* Grid overlay */}
            <div className="grid-overlay" aria-hidden="true" />

            {/* Floating orbs */}
            <div className="orb orb-1" aria-hidden="true" />
            <div className="orb orb-2" aria-hidden="true" />
            <div className="orb orb-3" aria-hidden="true" />

            <div className="home-content">

                {/* ── Hero ── */}
                <section className="hero">
                    <div className="hero-pill">
                        <span className="pill-dot" />
                        Hybrid Static + AI Analysis
                    </div>

                    <h1 className="hero-title">
                        Instant code health<br />
                        for any <span className="gradient-text">GitHub repo</span>
                    </h1>

                    <p className="hero-sub">
                        Paste a public GitHub URL and get a structured security, scalability,
                        and code quality report — powered by static analysis + Llama 3.3.
                    </p>

                    {/* Search bar */}
                    <form onSubmit={handleSubmit} className={`search-wrap${error ? ' error' : ''}`}>
                        <div className="search-bar glass-panel">
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
                                {isLoading
                                    ? <span className="btn-loader" />
                                    : <><span>Analyze</span><ArrowRight size={16} /></>
                                }
                            </button>
                        </div>
                        {error && <p className="search-error">{error}</p>}
                    </form>

                    {/* Example links */}
                    <div className="examples">
                        <span className="examples-label">Try:</span>
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

                {/* ── Stats bar ── */}
                <div className="stats-bar">
                    {[
                        { val: '5', label: 'Analysis dimensions' },
                        { val: '4', label: 'Static detectors' },
                        { val: 'OSV', label: 'Vulnerability DB' },
                        { val: 'LLM', label: 'Llama 3.3 70B' },
                    ].map(s => (
                        <div className="stat-item" key={s.label}>
                            <span className="stat-val gradient-text">{s.val}</span>
                            <span className="stat-label">{s.label}</span>
                        </div>
                    ))}
                </div>

                {/* ── Feature cards ── */}
                <div className="features">
                    {[
                        {
                            icon: <ShieldCheck size={22} />,
                            title: 'Security First',
                            desc: 'Detects hardcoded secrets, vulnerable dependencies via OSV, and missing security middleware.',
                            accent: '#7c3aed',
                        },
                        {
                            icon: <Zap size={22} />,
                            title: 'Static + AI',
                            desc: 'Combines deterministic ESLint/regex scanning with contextual Llama 3.3 architectural review.',
                            accent: '#2563eb',
                        },
                        {
                            icon: <Activity size={22} />,
                            title: 'Weighted Scoring',
                            desc: 'A 5-category rubric — Security 30%, Scalability 20%, Quality 20%, Production 20%, Maintainability 10%.',
                            accent: '#0891b2',
                        },
                    ].map(f => (
                        <div className="feature-card glass-panel" key={f.title} style={{ '--card-accent': f.accent }}>
                            <div className="feature-icon">{f.icon}</div>
                            <h3 className="feature-title">{f.title}</h3>
                            <p className="feature-desc">{f.desc}</p>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
