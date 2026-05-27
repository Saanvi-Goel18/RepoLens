import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldAlert, AlertTriangle, Info, ChevronDown, ChevronRight, Activity, ArrowLeft } from 'lucide-react';
import './Dashboard.css';

export default function Dashboard() {
    const { jobId } = useParams();
    const [job, setJob] = useState(null);
    const [error, setError] = useState(null);
    const [expandedIssues, setExpandedIssues] = useState(new Set());

    useEffect(() => {
        let intervalId;

        const pollStatus = async () => {
            try {
                const res = await fetch(`http://localhost:3001/result/${jobId}`);
                if (!res.ok) {
                    throw new Error('Failed to fetch job status');
                }
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
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setExpandedIssues(newSet);
    };

    if (error) {
        return (
            <div className="dashboard-container error">
                <h2>Error loading report</h2>
                <p>{error}</p>
                <Link to="/" className="new-scan-btn" style={{marginTop: '20px', display: 'inline-block'}}><ArrowLeft size={16} style={{display: 'inline', verticalAlign: 'middle'}}/> Back to Home</Link>
            </div>
        );
    }

    if (!job || job.status !== 'done') {
        return (
            <div className="dashboard-container loading-state animate-pulse-slow">
                <Activity size={48} className="loading-icon" />
                <h2>
                    {job?.status === 'fetching' ? 'Fetching Repository...' : 
                     job?.status === 'analyzing' ? 'Running Analysis Engines...' : 
                     'Preparing...'}
                </h2>
                <p style={{color: 'var(--text-muted)', marginTop: '8px'}}>This usually takes 10-30 seconds depending on repo size.</p>
            </div>
        );
    }

    if (job.status === 'error') {
        return (
            <div className="dashboard-container error">
                <h2>Analysis Failed</h2>
                <p>{job.error}</p>
                <Link to="/" className="new-scan-btn" style={{marginTop: '20px', display: 'inline-block'}}><ArrowLeft size={16} style={{display: 'inline', verticalAlign: 'middle'}}/> Back to Home</Link>
            </div>
        );
    }

    const { overallScore, categoryScores, issues } = job.result;

    const getScoreColor = (score) => {
        if (score >= 75) return 'var(--must)'; // Green
        if (score >= 50) return 'var(--warn)'; // Amber
        return 'var(--danger)'; // Red
    };

    const getScoreLabel = (score) => {
        if (score >= 85) return 'EXCELLENT';
        if (score >= 75) return 'GOOD';
        if (score >= 50) return 'NEEDS ATTENTION';
        return 'CRITICAL ISSUES';
    };

    const getSeverityIcon = (severity) => {
        if (severity === 'Critical') return <ShieldAlert size={16} className="text-danger" />;
        if (severity === 'Warning') return <AlertTriangle size={16} className="text-warn" />;
        return <Info size={16} className="text-info" />;
    };

    return (
        <div className="dashboard-container animate-fade-in">
            <div className="dashboard-header">
                <div>
                    <h1 className="repo-title">{job.repoUrl.split('/').slice(-2).join('/')}</h1>
                    <p className="report-id">Report ID: {jobId}</p>
                </div>
                <Link to="/" className="new-scan-btn">New Scan</Link>
            </div>

            <div className="score-overview glass-panel">
                <div className="overall-score-section">
                    <div className="score-circle" style={{ borderColor: getScoreColor(overallScore), color: getScoreColor(overallScore) }}>
                        {overallScore}
                    </div>
                    <div className="score-label" style={{ color: getScoreColor(overallScore) }}>
                        OVERALL HEALTH — {getScoreLabel(overallScore)}
                    </div>
                </div>

                <div className="category-scores">
                    {Object.entries(categoryScores).map(([key, score]) => (
                        <div className="score-row" key={key}>
                            <div className="score-name">
                                {key.charAt(0).toUpperCase() + key.slice(1)}
                            </div>
                            <div className="score-bar-track">
                                <div 
                                    className="score-bar-fill" 
                                    style={{ width: `${score}%`, backgroundColor: getScoreColor(score) }}
                                ></div>
                            </div>
                            <div className="score-val">{score}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="issues-section">
                <h2 className="section-title">Detected Issues ({issues.length})</h2>
                <div className="issues-list glass-panel">
                    {issues.length === 0 ? (
                        <div className="no-issues">Amazing! No issues detected.</div>
                    ) : (
                        issues.map((issue, idx) => {
                            const isExpanded = expandedIssues.has(idx);
                            return (
                                <div className={`issue-item ${isExpanded ? 'expanded' : ''}`} key={idx}>
                                    <div className="issue-header" onClick={() => toggleIssue(idx)}>
                                        <div className="issue-icon">{getSeverityIcon(issue.severity)}</div>
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
                                            <div className="fix-label">Suggested Fix:</div>
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
