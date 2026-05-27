import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, ShieldCheck, Zap, Activity } from 'lucide-react';
import './Home.css';

export default function Home() {
    const [repoUrl, setRepoUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!repoUrl) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const response = await fetch('http://localhost:3001/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repoUrl })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                navigate(`/r/${data.jobId}`);
            } else {
                setError(data.error || 'Failed to start analysis');
            }
        } catch (err) {
            setError('Failed to connect to the backend server. Is it running?');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="home-container animate-fade-in">
            <div className="hero-section">
                <div className="hero-badge">No Setup Required</div>
                <h1 className="hero-title">
                    Instant Health Report for your <span className="gradient-text">GitHub Repo</span>
                </h1>
                <p className="hero-subtitle">
                    Paste a repository URL and get a structured analysis of security, scalability, and code quality in seconds. 
                    Powered by Static Analysis + AI.
                </p>

                <form onSubmit={handleSubmit} className="search-form glass-panel">
                    <Search className="search-icon" size={20} />
                    <input 
                        type="url" 
                        className="search-input"
                        placeholder="https://github.com/username/repository" 
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        required
                        disabled={isLoading}
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
            </div>

            <div className="features-grid">
                <div className="feature-card glass-panel">
                    <div className="feature-icon"><ShieldCheck size={24} /></div>
                    <h3>Security First</h3>
                    <p>Detects hardcoded secrets, missing rate limits, and vulnerable OSV dependencies instantly.</p>
                </div>
                <div className="feature-card glass-panel">
                    <div className="feature-icon"><Zap size={24} /></div>
                    <h3>Static + AI</h3>
                    <p>Combines deterministic AST/Regex scanning with deep contextual LLM architectural review.</p>
                </div>
                <div className="feature-card glass-panel">
                    <div className="feature-icon"><Activity size={24} /></div>
                    <h3>Production Ready</h3>
                    <p>Scores repos across 5 key metrics so you know exactly what breaks before you ship.</p>
                </div>
            </div>
        </div>
    );
}
