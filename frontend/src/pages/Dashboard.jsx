import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldAlert, AlertTriangle, Info, ChevronDown, Activity, ArrowLeft, Copy, Check, ExternalLink, SlidersHorizontal, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Dashboard.css';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const ALL_CATEGORIES = ['Security', 'Scalability', 'Code Quality', 'Production Readiness', 'Maintainability'];
const ALL_SEVERITIES = ['Critical', 'Warning', 'Info'];

export default function Dashboard() {
    const { jobId } = useParams();
    const [job, setJob] = useState(null);
    const [error, setError] = useState(null);
    const [expandedIssues, setExpandedIssues] = useState(new Set());
    const [copied, setCopied] = useState(false);

    // ── Filter state ────────────────────────────────────────────────────────
    const [activeSeverities, setActiveSeverities] = useState(new Set(ALL_SEVERITIES));
    const [activeCategories, setActiveCategories] = useState(new Set(ALL_CATEGORIES));

    useEffect(() => {
        let intervalId;
        const pollStatus = async () => {
            try {
                const res = await fetch(`${BACKEND}/result/${jobId}`);
                if (res.status === 404) {
                    setError('Report not found or expired.');
                    clearInterval(intervalId);
                    return;
                }
                if (!res.ok) return; 
                const data = await res.json();
                setJob(data);
                if (data.status === 'done' || data.status === 'error') {
                    clearInterval(intervalId);
                }
            } catch (err) {
                console.warn('Poll failed, will retry:', err.message);
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

    const generatePDF = () => {
        if (!job) return;
        const doc = new jsPDF();
        const { overallScore, categoryScores } = job.result;
        const issuesList = job.result.issues || [];
        
        // Native GitHub colors for the PDF
        const primaryColor = [47, 129, 247]; // GitHub Blue
        const textColor = [40, 40, 40];

        doc.setFontSize(22);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text("RepoLens Audit Report", 14, 22);

        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.text(`Repository: ${job.repoUrl}`, 14, 30);
        doc.text(`Date: ${new Date(job.createdAt).toLocaleString()}`, 14, 36);
        doc.text(`Files Scanned: ${job.stats?.filesAnalyzed || '?'}`, 14, 42);

        doc.setFontSize(16);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text(`Overall Health Score: ${overallScore}/100`, 14, 54);

        doc.setFontSize(12);
        let startY = 62;
        Object.entries(categoryScores).forEach(([cat, score]) => {
            doc.text(`${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${score}/100`, 14, startY);
            startY += 6;
        });

        if (issuesList.length > 0) {
            const tableData = issuesList.map(issue => [
                issue.severity,
                issue.category,
                `${issue.file}:${issue.line}`,
                issue.description,
                issue.fix
            ]);

            autoTable(doc, {
                startY: startY + 8,
                head: [['Severity', 'Category', 'Location', 'Description', 'Fix']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: primaryColor },
                styles: { fontSize: 9, cellPadding: 3 },
                columnStyles: {
                    0: { cellWidth: 20 },
                    1: { cellWidth: 25 },
                    2: { cellWidth: 40 },
                    3: { cellWidth: 'auto' },
                    4: { cellWidth: 50 }
                },
                didParseCell: function(data) {
                    if (data.section === 'body' && data.column.index === 0) {
                        if (data.cell.raw === 'Critical') data.cell.styles.textColor = [218, 54, 51]; // GitHub Red
                        else if (data.cell.raw === 'Warning') data.cell.styles.textColor = [210, 153, 34]; // GitHub Yellow
                        else if (data.cell.raw === 'Info') data.cell.styles.textColor = [56, 139, 253]; // GitHub Blue
                    }
                }
            });
        }

        const repoName = job.repoUrl.split('/').pop() || 'repo';
        doc.save(`RepoLens_Report_${repoName}.pdf`);
    };

    const toggleSeverity = (sev) => {
        const next = new Set(activeSeverities);
        next.has(sev) ? next.delete(sev) : next.add(sev);
        setActiveSeverities(next);
        setExpandedIssues(new Set()); 
    };

    const toggleCategory = (cat) => {
        const next = new Set(activeCategories);
        next.has(cat) ? next.delete(cat) : next.add(cat);
        setActiveCategories(next);
        setExpandedIssues(new Set());
    };

    const clearFilters = () => {
        setActiveSeverities(new Set(ALL_SEVERITIES));
        setActiveCategories(new Set(ALL_CATEGORIES));
    };

    // ── useMemo MUST be here before early returns (Rules of Hooks) ────
    const issues = job?.result?.issues ?? [];
    const filteredIssues = useMemo(() => {
        return issues.filter(issue =>
            activeSeverities.has(issue.severity) &&
            ALL_CATEGORIES.some(cat =>
                issue.category.toLowerCase() === cat.toLowerCase() &&
                activeCategories.has(cat)
            )
        );
    }, [issues, activeSeverities, activeCategories]);
    const isFiltered = activeSeverities.size < ALL_SEVERITIES.length || activeCategories.size < ALL_CATEGORIES.length;

    // ── Loading / Error states ──────────────────────────────────────────────
    if (error) {
        return (
            <div className="dashboard-container centered animate-fade-in">
                <div className="state-card glass-panel">
                    <ShieldAlert size={40} className="state-icon text-danger" />
                    <h2>Failed to load report</h2>
                    <p>{error}</p>
                    <Link to="/" className="btn-primary"><ArrowLeft size={16}/> Back to Home</Link>
                </div>
            </div>
        );
    }

    if (!job || (job.status !== 'done' && job.status !== 'error')) {
        const statusMessages = {
            queued:    { text: 'Queued for analysis...', sub: 'Starting up the pipeline.' },
            fetching:  { text: 'Fetching repository...', sub: 'Pulling file tree and source files from GitHub.' },
            analyzing: { text: 'Running analysis...', sub: 'Static detectors and LLM are working in parallel.' },
        };
        const msg = statusMessages[job?.status] || { text: 'Preparing...', sub: 'Hang tight.' };
        return (
            <div className="dashboard-container centered animate-fade-in">
                <div className="state-card glass-panel">
                    <div className="spinner-ring" />
                    <h2>{msg.text}</h2>
                    <p>{msg.sub}</p>
                    <p className="muted-hint">Usually takes 15–45 seconds depending on repo size.</p>
                </div>
            </div>
        );
    }

    if (job.status === 'error') {
        return (
            <div className="dashboard-container centered animate-fade-in">
                <div className="state-card glass-panel">
                    <AlertTriangle size={40} className="state-icon text-warn" />
                    <h2>Analysis failed</h2>
                    <p>{job.error}</p>
                    <Link to="/" className="btn-primary"><ArrowLeft size={16}/> Try another repo</Link>
                </div>
            </div>
        );
    }

    const { overallScore, categoryScores } = job.result;

    const getScoreColor = (s) => s >= 75 ? 'var(--green)' : s >= 50 ? 'var(--yellow)' : 'var(--red)';
    const getScoreLabel = (s) => s >= 85 ? 'Excellent' : s >= 75 ? 'Good' : s >= 50 ? 'Needs Attention' : 'Critical Issues';

    const categoryMeta = {
        security:        { label: 'Security',        emoji: '🔐' },
        scalability:     { label: 'Scalability',     emoji: '⚡' },
        quality:         { label: 'Code Quality',    emoji: '✨' },
        production:      { label: 'Production',      emoji: '🚢' },
        maintainability: { label: 'Maintainability', emoji: '🧹' },
    };

    const severityCounts = { Critical: 0, Warning: 0, Info: 0 };
    issues.forEach(i => { if (severityCounts[i.severity] !== undefined) severityCounts[i.severity]++; });

    const iconMap = {
        Critical: <ShieldAlert size={16} className="text-danger" />,
        Warning:  <AlertTriangle size={16} className="text-warn" />,
        Info:     <Info size={16} className="text-info" />,
    };

    return (
        <div className="dashboard-container animate-fade-in">

            {/* ── Header ── */}
            <div className="dashboard-header animate-scale-in">
                <div>
                    <div className="repo-breadcrumb">
                        <a href={job.repoUrl} target="_blank" rel="noopener noreferrer" className="repo-link">
                            {job.repoUrl.replace('https://github.com/', '')}
                            <ExternalLink size={16} />
                        </a>
                    </div>
                    <p className="report-meta">
                        Analyzed on {new Date(job.createdAt).toLocaleString()} • {job.stats?.filesAnalyzed || '?'} files scanned
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary" onClick={generatePDF}>
                        <Download size={14}/> Download PDF
                    </button>
                    <button className={`btn-secondary ${copied ? 'copied' : ''}`} onClick={copyShareLink}>
                        {copied ? <><Check size={14}/> Copied</> : <><Copy size={14}/> Copy Link</>}
                    </button>
                </div>
            </div>

            {/* ── Scores Grid ── */}
            <div className="scores-grid animate-scale-in" style={{ animationDelay: '0.05s' }}>
                
                {/* Overall Score Circle */}
                <div className="glass-panel overall-card">
                    <div className="circle-wrap">
                        <svg className="circle-svg" viewBox="0 0 100 100">
                            <circle className="circle-bg" cx="50" cy="50" r="46" />
                            <circle 
                                className="circle-prog" 
                                cx="50" cy="50" r="46"
                                style={{
                                    strokeDasharray: `${(overallScore / 100) * 289} 289`,
                                    color: getScoreColor(overallScore)
                                }}
                            />
                        </svg>
                        <div className="circle-inner">
                            <span className="circle-score">{overallScore}</span>
                            <span className="circle-max">/100</span>
                        </div>
                    </div>
                    <h3 className="overall-label">{getScoreLabel(overallScore)}</h3>
                    <p className="report-meta">Overall Health Score</p>
                </div>

                {/* Category Breakdown */}
                <div className="glass-panel category-breakdown">
                    {Object.entries(categoryScores).map(([key, score]) => (
                        <div className="cat-item" key={key}>
                            <div className="cat-header">
                                <span className="cat-name">
                                    {categoryMeta[key]?.emoji} {categoryMeta[key]?.label || key}
                                </span>
                                <span className="cat-score">{score}/100</span>
                            </div>
                            <div className="bar-bg">
                                <div 
                                    className="bar-fill" 
                                    style={{ 
                                        width: `${score}%`,
                                        background: getScoreColor(score) 
                                    }} 
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Filters ── */}
            <div className="filters-bar animate-scale-in" style={{ animationDelay: '0.1s' }}>
                <div className="filter-label"><SlidersHorizontal size={14}/> Filters:</div>
                
                <div className="filters-group">
                    {ALL_SEVERITIES.map(sev => (
                        <button
                            key={sev}
                            className={`filter-btn ${activeSeverities.has(sev) ? 'active' : ''}`}
                            onClick={() => toggleSeverity(sev)}
                        >
                            {sev} <span className="filter-count">{severityCounts[sev]}</span>
                        </button>
                    ))}
                </div>
                
                <div className="filter-divider" />

                <div className="filters-group">
                    {ALL_CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            className={`filter-btn ${activeCategories.has(cat) ? 'active' : ''}`}
                            onClick={() => toggleCategory(cat)}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {isFiltered && (
                    <button className="filter-clear" onClick={clearFilters}>
                        Clear filters
                    </button>
                )}
            </div>

            {/* ── Issues List ── */}
            <div className="issues-list">
                {filteredIssues.length === 0 ? (
                    <div className="empty-state animate-fade-in" style={{ animationDelay: '0.15s' }}>
                        <Check size={32} className="state-icon" style={{ color: 'var(--green)' }}/>
                        <h3>No issues found</h3>
                        <p>No issues match the current filter criteria.</p>
                        {isFiltered && <button className="btn-primary" onClick={clearFilters}>Clear Filters</button>}
                    </div>
                ) : (
                    filteredIssues.map((issue, index) => {
                        const isExpanded = expandedIssues.has(index);
                        return (
                            <div 
                                key={index} 
                                className={`issue-card severity-${issue.severity} animate-fade-in`}
                                style={{ animationDelay: `${0.15 + (index * 0.02)}s` }}
                            >
                                <div className="issue-header" onClick={() => toggleIssue(index)}>
                                    <div className="issue-icon">{iconMap[issue.severity]}</div>
                                    <div className="issue-summary">
                                        <div className="issue-meta">
                                            <span className={`badge badge-${issue.severity}`}>{issue.severity}</span>
                                            <span className="badge badge-outline">{issue.category}</span>
                                            <span className="file-loc">{issue.file}:{issue.line}</span>
                                        </div>
                                        <h4 className="issue-desc">{issue.description}</h4>
                                    </div>
                                    <div className={`issue-expand ${isExpanded ? 'open' : ''}`}>
                                        <ChevronDown size={16} />
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="issue-body">
                                        <div className="fix-label">Recommended Fix</div>
                                        <p className="issue-fix">{issue.fix}</p>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
