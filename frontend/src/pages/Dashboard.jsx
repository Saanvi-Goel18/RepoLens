import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldAlert, AlertTriangle, Info, ChevronDown, ChevronRight, Activity, ArrowLeft, Copy, Check, ExternalLink } from 'lucide-react';
import './Dashboard.css';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export default function Dashboard() {
    const { jobId } = useParams();
    const [job, setJob] = useState(null);
    const [error, setError] = useState(null);
    const [expandedIssues, setExpandedIssues] = useState(new Set());
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let intervalId;

        const pollStatus = async () => {
            try {
                const res = await fetch(`${BACKEND}/result/${jobId}`);
                if (!res.ok) throw new Error('Report not found or expired.');
                const data = await res.json();
                setJob(data);
                if (data.status === 'done' || data.status === 'error') {
                    clearInterval(intervalId);
                }
            } catch (err) {
                setError(err.message);
                clearInterval(intervalId);
            }
        };

        pollStatus();
        intervalId = setInterval(pollStatus, 3000);
        return () => clearInterval(intervalId);
    }, [jobId]);

    const toggleIssue = (index) => {
        const newSet = new Set(expandedIssues);
        newSet.has(index) ? newSet.delete(index) : newSet.add(index);
        setExpandedIssues(newSet);
    };

    const copyShareLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // ─── Error state ───────────────────────────────────────────────────────────
    if (error) {
        return (
            <div className="dashboard-container centered">
                <div className="state-card glass-panel">
                    <ShieldAlert size={40} className="state-icon text-danger" />
                    <h2>Failed to load report</h2>
                    <p>{error}</p>
                    <Link to="/" className="btn-primary"><ArrowLeft size={16}/> Back to Home</Link>
                </div>
            </div>
        );
    }

    // ─── Loading state ─────────────────────────────────────────────────────────
    if (!job || (job.status !== 'done' && job.status !== 'error')) {
        const statusMessages = {
            queued: { text: 'Queued for analysis...', sub: 'Starting up the pipeline.' },
            fetching: { text: 'Fetching repository...', sub: 'Pulling file tree and source files from GitHub.' },
            analyzing: { text: 'Running analysis engines...', sub: 'Static detectors and LLM are working in parallel.' },
        };
        const msg = statusMessages[job?.status] || { text: 'Preparing...', sub: 'Hang tight.' };

        return (
            <div className="dashboard-container centered">
                <div className="state-card glass-panel">
                    <div className="spinner-ring" />
                    <h2>{msg.text}</h2>
                    <p>{msg.sub}</p>
                    <p className="muted-hint">Usually takes 15–45 seconds depending on repo size.</p>
                </div>
            </div>
        );
    }

    // ─── Job-level error ───────────────────────────────────────────────────────
    if (job.status === 'error') {
        return (
            <div className="dashboard-container centered">
                <div className="state-card glass-panel">
                    <AlertTriangle size={40} className="state-icon text-warn" />
                    <h2>Analysis failed</h2>
                    <p>{job.error}</p>
                    <Link to="/" className="btn-primary"><ArrowLeft size={16}/> Try another repo</Link>
                </div>
            </div>
        );
    }

    const { overallScore, categoryScores, issues } = job.result;

    const getScoreColor = (s) => s >= 75 ? 'var(--must)' : s >= 50 ? 'var(--warn)' : 'var(--danger)';
    const getScoreLabel = (s) => s >= 85 ? 'Excellent' : s >= 75 ? 'Good' : s >= 50 ? 'Needs Attention' : 'Critical Issues';

    const categoryMeta = {
        security: { label: 'Security', emoji: '🔐' },
        scalability: { label: 'Scalability', emoji: '⚡' },
        quality: { label: 'Code Quality', emoji: '✨' },
        production: { label: 'Production', emoji: '🚢' },
        maintainability: { label: 'Maintainability', emoji: '🧹' },
    };

    const severityCounts = { Critical: 0, Warning: 0, Info: 0 };
    issues.forEach(i => { if (severityCounts[i.severity] !== undefined) severityCounts[i.severity]++; });

    return (
        <div className="dashboard-container animate-fade-in">

            {/* ── Header ── */}
            <div className="dashboard-header">
                <div>
                    <div className="repo-breadcrumb">
                        <a
                            href={job.repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="repo-link"
                        >
                            {job.repoUrl.replace('https://github.com/', '')}
                            <ExternalLink size={14} />
                        </a>
                    </div>
                    <p className="report-meta">
                        Report · {new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>
                <div className="header-actions">
                    <button className="btn-secondary" onClick={copyShareLink}>
                        {copied ? <><Check size={15}/> Copied!</> : <><Copy size={15}/> Share</>}
                    </button>
                    <Link to="/" className="btn-secondary">New Scan</Link>
                </div>
            </div>

            {/* ── Score Panel ── */}
            <div className="score-overview glass-panel">
                <div className="overall-score-section">
                    <div className="score-circle" style={{ '--score-color': getScoreColor(overallScore) }}>
                        <span className="score-number">{overallScore}</span>
                        <span className="score-max">/100</span>
                    </div>
                    <div className="score-verdict" style={{ color: getScoreColor(overallScore) }}>
                        {getScoreLabel(overallScore)}
                    </div>
                    <div className="severity-pills">
                        {severityCounts.Critical > 0 && <span className="pill pill-critical">{severityCounts.Critical} Critical</span>}
                        {severityCounts.Warning > 0 && <span className="pill pill-warning">{severityCounts.Warning} Warning</span>}
                        {severityCounts.Info > 0 && <span className="pill pill-info">{severityCounts.Info} Info</span>}
                    </div>
                </div>

                <div className="category-scores">
                    {Object.entries(categoryScores).map(([key, score]) => {
                        const meta = categoryMeta[key] || { label: key, emoji: '' };
                        return (
                            <div className="score-row" key={key}>
                                <div className="score-name">
                                    <span className="score-emoji">{meta.emoji}</span>
                                    {meta.label}
                                </div>
                                <div className="score-bar-track">
                                    <div
                                        className="score-bar-fill"
                                        style={{ width: `${score}%`, backgroundColor: getScoreColor(score) }}
                                    />
                                </div>
                                <div className="score-val" style={{ color: getScoreColor(score) }}>{score}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Issues List ── */}
            <div className="issues-section">
                <h2 className="section-title">
                    Detected Issues
                    <span className="issue-count">{issues.length}</span>
                </h2>

                <div className="issues-list glass-panel">
                    {issues.length === 0 ? (
                        <div className="no-issues">
                            <Check size={32} style={{ color: 'var(--must)', marginBottom: 12 }} />
                            <p>No issues detected. This repo looks solid.</p>
                        </div>
                    ) : (
                        issues.map((issue, idx) => {
                            const isExpanded = expandedIssues.has(idx);
                            const iconMap = {
                                Critical: <ShieldAlert size={16} className="text-danger" />,
                                Warning: <AlertTriangle size={16} className="text-warn" />,
                                Info: <Info size={16} className="text-info" />,
                            };
                            return (
                                <div className={`issue-item${isExpanded ? ' expanded' : ''}`} key={idx}>
                                    <div className="issue-header" onClick={() => toggleIssue(idx)}>
                                        <div className="issue-icon">{iconMap[issue.severity]}</div>
                                        <div className="issue-content">
                                            <div className="issue-meta">
                                                <span className={`chip chip-${issue.severity.toLowerCase()}`}>{issue.category}</span>
                                                <span className="issue-file">{issue.file}:{issue.line}</span>
                                            </div>
                                            <div className="issue-desc">{issue.description}</div>
                                        </div>
                                        <div className="issue-toggle">
                                            {isExpanded ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div className="issue-details">
                                            <div className="fix-label">Suggested Fix</div>
                                            <div className="fix-content">{issue.fix}</div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
