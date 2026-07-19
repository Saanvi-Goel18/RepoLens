import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const GITHUB_URL_REGEX = /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/;

export default function Home() {
    const [repoUrl, setRepoUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [theme, setTheme] = useState('dark');
    const [scannerLogs, setScannerLogs] = useState([]);
    const [isScrolled, setIsScrolled] = useState(false);
    const [activeSection, setActiveSection] = useState('dashboard');
    const navigate = useNavigate();
    
    // Refs for scroll and animation logic
    const headerRef = useRef(null);
    const viewportRef = useRef(null);
    const heroLeftRef = useRef(null);
    const heroRightRef = useRef(null);
    const ctaGroupRef = useRef(null);
    const revealTaglineRef = useRef(null);
    const revealSubtextRef = useRef(null);
    const ctaTextRef = useRef(null);

    // Check authentication status
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch(`${BACKEND}/auth/status`, { credentials: 'include' });
                const data = await res.json();
                setIsAuthenticated(data.isAuthenticated);
            } catch (err) {
                setIsAuthenticated(false);
            }
        };
        checkStatus();
    }, []);

    // Theme effect
    useEffect(() => {
        document.body.className = `${theme} font-body-base antialiased`;
    }, [theme]);

    // Scroll effect for header
    useEffect(() => {
        const handleScroll = () => {
            const scrollY = window.scrollY;
            setIsScrolled(scrollY > window.innerHeight * 0.8);
            
            const sections = ['dashboard', 'inventory', 'activity', 'documentation'];
            let current = 'dashboard';
            for (const section of sections) {
                const el = document.getElementById(section);
                if (el && scrollY >= el.offsetTop - 200) {
                    current = section;
                }
            }
            setActiveSection(current);
        };
        window.addEventListener('scroll', handleScroll);

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.1 });

        const revealElements = document.querySelectorAll('.reveal-card');
        revealElements.forEach(el => observer.observe(el));

        return () => {
            window.removeEventListener('scroll', handleScroll);
            revealElements.forEach(el => observer.unobserve(el));
        };
    }, []);

    useEffect(() => {
        let isMounted = true;
        let timeoutId;

        const initScanner = async () => {
            let codeLines = [];
            try {
                const res = await fetch(`${BACKEND}/recent-scans`);
                if (res.ok) {
                    const scans = await res.json();
                    if (scans.length > 0) {
                        codeLines = scans.flatMap(s => {
                            const lines = [
                                `fetching repository manifest for repo-${s.repoId}...`,
                                `indexing objects [100%]`,
                                `running static analysis + dependency audit...`
                            ];
                            
                            if (s.overall_score >= 85) lines.push(`SUCCESS: scan complete — Score: ${s.overall_score}/100`);
                            else if (s.overall_score >= 65) lines.push(`system_log: scan complete — Score: ${s.overall_score}/100`);
                            else if (s.overall_score >= 45) lines.push(`WARNING: scan complete — Score: ${s.overall_score}/100`);
                            else lines.push(`CRITICAL: scan complete — Score: ${s.overall_score}/100`);
                            
                            return lines;
                        });
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch recent scans for scanner animation", err);
            }

            if (codeLines.length === 0) {
                codeLines = [
                    "waiting for telemetry...",
                    "system ready for analysis"
                ];
            }

            if (!isMounted) return;

            let currentLine = 0;
            const addLog = () => {
                if (!isMounted) return;
                
                const timeStr = new Date().toLocaleTimeString();
                const rawText = codeLines[currentLine];
                
                // Format log based on text
                let colorClass = "text-primary";
                if (rawText.includes("CRITICAL")) colorClass = "text-error";
                else if (rawText.includes("WARNING")) colorClass = "text-yellow-500";
                else if (rawText.includes("SUCCESS")) colorClass = "text-green-400";
                
                const newLog = {
                    id: Date.now() + Math.random(),
                    time: timeStr,
                    text: rawText,
                    colorClass
                };

                setScannerLogs(prev => {
                    const nextLogs = [...prev, newLog];
                    if (nextLogs.length > 18) return nextLogs.slice(nextLogs.length - 18);
                    return nextLogs;
                });

                currentLine = (currentLine + 1) % codeLines.length;
                timeoutId = setTimeout(addLog, 1500 + Math.random() * 2000);
            };

            addLog();
        };

        initScanner();

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, []);

    // Typewriter effect
    useEffect(() => {
        const phrases = ["Secure your stack today.", "Zero Blind Spots.", "Surgical Precision Audit."];
        let phraseIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        let timeoutId;

        const type = () => {
            const currentPhrase = phrases[phraseIndex];
            const node = ctaTextRef.current;
            if (!node) return;

            if (isDeleting) {
                node.innerText = currentPhrase.substring(0, charIndex - 1);
                charIndex--;
            } else {
                node.innerText = currentPhrase.substring(0, charIndex + 1);
                charIndex++;
            }

            let typeSpeed = 100;
            if (isDeleting) typeSpeed /= 2;

            if (!isDeleting && charIndex === currentPhrase.length) {
                typeSpeed = 2000;
                isDeleting = true;
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                phraseIndex = (phraseIndex + 1) % phrases.length;
                typeSpeed = 500;
            }

            timeoutId = setTimeout(type, typeSpeed);
        };

        timeoutId = setTimeout(type, 1000);
        return () => clearTimeout(timeoutId);
    }, []);

    const handleLogin = () => {
        window.location.href = `${BACKEND}/auth/github`;
    };

    const handleLogout = async () => {
        try {
            await fetch(`${BACKEND}/auth/logout`, { method: 'POST', credentials: 'include' });
        } catch (err) {
            console.error('Logout failed', err);
        }
        setIsAuthenticated(false);
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
            const response = await fetch(`${BACKEND}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
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
        <div className={`selection:bg-primary selection:text-on-primary ${theme}`}>
            
            {/* ── Functional Scan Modal ── */}
            <div className={`modal-overlay ${isModalOpen ? 'open' : ''}`}>
                <div className="modal-content">
                    <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                    <h2 className="font-headline-md text-primary mb-4">Start Analysis</h2>
                    
                    {isAuthenticated ? (
                        <div className="mb-6 p-3 border border-outline-variant rounded flex justify-between items-center">
                            <div className="flex items-center gap-2 text-primary text-sm font-label-caps">
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                GitHub Connected
                            </div>
                            <button onClick={handleLogout} className="text-on-surface-variant hover:text-primary text-xs underline">Logout</button>
                        </div>
                    ) : (
                        <div className="mb-6 p-4 border border-outline-variant rounded bg-surface-container-low text-center">
                            <p className="text-sm text-on-surface-variant mb-3">Want to scan private repositories?</p>
                            <button onClick={handleLogin} className="w-full bg-surface-bright text-primary py-2 font-label-caps border border-outline-variant hover:border-primary transition-colors flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-[18px]">lock</span>
                                Sign in with GitHub
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block text-sm text-on-surface-variant mb-2 font-code-base">Repository URL</label>
                            <input 
                                type="text" 
                                className="w-full bg-surface-container-low border border-outline-variant text-primary p-3 font-code-base focus:outline-none focus:border-primary rounded transition-colors"
                                placeholder="https://github.com/owner/repo"
                                value={repoUrl}
                                onChange={e => { setRepoUrl(e.target.value); setError(null); }}
                                autoFocus={isModalOpen}
                            />
                        </div>
                        {error && <p className="text-error text-sm mb-4 font-code-base">{error}</p>}
                        
                        <button 
                            type="submit" 
                            disabled={isLoading}
                            className="w-full bg-primary text-on-primary py-3 font-label-caps flex justify-center items-center gap-2 disabled:opacity-50"
                        >
                            {isLoading ? (
                                <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[18px]">search</span>
                                    Analyze Codebase
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
            {/* Orion-Style Top Navigation Bar (with scroll theme toggle) */}
            <nav className={`w-full z-[100] backdrop-blur-md border-b flex justify-between items-center h-14 px-margin-desktop sticky top-0 transition-colors duration-300 ${isScrolled ? 'bg-white/90 text-black border-gray-300' : 'bg-background/80 text-primary border-outline-variant'}`} id="main-nav">
                {/* Logo */}
                <div className={`font-headline-md text-headline-md tracking-tighter ${isScrolled ? 'text-black' : 'text-primary'}`} id="nav-logo">
                    RepoLens
                </div>
                
                {/* Center Links */}
                <div className="hidden md:flex gap-10 items-center">
                    <a className={`font-label-caps text-label-caps transition-colors pb-1 ${activeSection === 'dashboard' ? (isScrolled ? 'border-b border-black text-black' : 'border-b border-primary text-primary') : (isScrolled ? 'text-gray-500 hover:text-black' : 'text-on-surface-variant hover:text-primary')}`} href="#dashboard">Dashboard</a>
                    <a className={`font-label-caps text-label-caps transition-colors pb-1 ${activeSection === 'inventory' ? (isScrolled ? 'border-b border-black text-black' : 'border-b border-primary text-primary') : (isScrolled ? 'text-gray-500 hover:text-black' : 'text-on-surface-variant hover:text-primary')}`} href="#inventory">Inventory</a>
                    <a className={`font-label-caps text-label-caps transition-colors pb-1 ${activeSection === 'activity' ? (isScrolled ? 'border-b border-black text-black' : 'border-b border-primary text-primary') : (isScrolled ? 'text-gray-500 hover:text-black' : 'text-on-surface-variant hover:text-primary')}`} href="#activity">Activity</a>
                    <a className={`font-label-caps text-label-caps transition-colors pb-1 ${activeSection === 'documentation' ? (isScrolled ? 'border-b border-black text-black' : 'border-b border-primary text-primary') : (isScrolled ? 'text-gray-500 hover:text-black' : 'text-on-surface-variant hover:text-primary')}`} href="#documentation">Documentation</a>
                </div>

                {/* Right Side */}
                <div className="flex items-center gap-6">
                    <button 
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        className={`transition-colors flex items-center justify-center ${isScrolled ? 'text-black hover:opacity-80' : 'text-primary hover:opacity-80'}`}
                    >
                        <span className="material-symbols-outlined text-[20px]">
                            {theme === 'dark' ? 'dark_mode' : 'light_mode'}
                        </span>
                    </button>
                    <span className={`material-symbols-outlined cursor-pointer transition-colors ${isScrolled ? 'text-black hover:opacity-80' : 'text-primary hover:opacity-80'}`} onClick={() => setIsModalOpen(true)}>account_circle</span>
                </div>
            </nav>

            <main>
                {/* Static Hero Section */}
                <section className="scroll-reveal-container" id="dashboard">
                    <div className="min-h-[85vh] flex items-center relative py-20">
                    <div className="container mx-auto px-margin-desktop grid grid-cols-1 lg:grid-cols-2 gap-16 items-center w-full z-10">
                        {/* Left Content: Typography */}
                        <div className="flex flex-col justify-center transition-all duration-700 ease-out" id="hero-text-container">
                            <div className="space-y-[-10px] mb-8" id="hero-title">
                                <h1 className="font-bold text-[140px] leading-[0.85] tracking-tighter text-primary block">Repo</h1>
                                <h1 className="font-bold text-[140px] leading-[0.85] tracking-tighter text-primary block">Lens</h1>
                            </div>
                            <div className="border-l-2 border-outline-variant pl-6 mt-4 transition-all" id="hero-subtitle-container">
                                <p className="font-label-caps text-[16px] text-primary mb-3 uppercase tracking-[0.2em] font-medium opacity-90">ZERO BLIND SPOTS.</p>
                                <p className="text-on-surface-variant max-w-sm font-body-base leading-relaxed text-lg" id="hero-desc">
                                    Scan your entire repository for secrets, vulnerabilities, and code quality. Know exactly what's wrong, instantly.
                                </p>
                            </div>
                            <div className="mt-12 flex flex-col sm:flex-row gap-4">
                                <button onClick={() => setIsModalOpen(true)} className="bg-primary text-background font-label-caps text-label-caps px-8 py-4 hover:opacity-90 transition-opacity">START SCAN</button>
                                <a href="#documentation" className="bg-transparent text-primary font-label-caps text-label-caps px-8 py-4 border border-outline-variant hover:border-primary transition-colors inline-block text-center">VIEW DOCS</a>
                            </div>
                        </div>

                        {/* Right Content: Scanner */}
                        <div className="relative h-[550px] w-full transition-all duration-1000 ease-in-out">
                            <div className="code-scanner w-full h-full p-8 text-code-base text-primary/60 border border-outline-variant/30 flex flex-col justify-end">
                                <div className="scan-line"></div>
                                <div className="whitespace-pre space-y-2 opacity-80 font-code-base text-[11px] lg:text-[13px] flex flex-col justify-end">
                                    {scannerLogs.map((log) => (
                                        <div key={log.id} className="mb-1 animate-fade-in flex gap-4">
                                            <span className="text-on-surface-variant/40 select-none">[{log.time}]</span>
                                            <span className={log.colorClass}>{log.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
                </section>
                {/* Marquee Strip */}
                <section className="py-4 bg-surface z-20 relative overflow-hidden border-y border-outline-variant/30">
                    <div className="marquee-container py-4">
                        <div className="marquee-content">
                            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">psychology</span> HYBRID ANALYSIS
                            </span>
                            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">security</span> SECURITY AUDITING
                            </span>
                            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">insights</span> DEEP INSIGHTS
                            </span>
                            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">hub</span> GITHUB NATIVE
                            </span>
                            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">architecture</span> DETERMINISTIC AST
                            </span>
                        </div>
                        <div aria-hidden="true" className="marquee-content">
                            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">psychology</span> HYBRID ANALYSIS
                            </span>
                            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">security</span> SECURITY AUDITING
                            </span>
                            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">insights</span> DEEP INSIGHTS
                            </span>
                            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">hub</span> GITHUB NATIVE
                            </span>
                            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">architecture</span> DETERMINISTIC AST
                            </span>
                        </div>
                    </div>
                </section>

                {/* Surgical Precision Section */}
                <section id="inventory" className="py-32 px-margin-desktop bg-surface border-b border-outline-variant">
                    <div className="max-w-container-max mx-auto">
                        <div className="mb-16 reveal-card">
                            <span className="font-label-caps text-label-caps text-on-surface-variant mb-2 block">SYSTEM CORE</span>
                            <h2 className="font-headline-lg text-headline-lg">Surgical Precision.<br />Total Visibility.</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
                            {/* Card 01 */}
                            <div className="terminal-block bg-surface-container reveal-card expand-card group relative p-6 flex flex-col gap-8 transition-all hover:border-primary">
                                <div className="flex justify-between items-start">
                                    <span className="font-label-caps text-label-caps text-on-surface-variant">01/</span>
                                    <span className="material-symbols-outlined text-primary">bolt</span>
                                </div>
                                <div>
                                    <h3 className="font-headline-md text-[20px] mb-4">Hybrid Analysis</h3>
                                    <p className="font-body-base text-body-base text-on-surface-variant">Deterministic AST parsing combined with semantic intelligence to find what ESLint misses.</p>
                                </div>
                                <div className="card-drawer pt-4 border-t border-outline-variant/30">
                                    <div className="text-[10px] text-surface-tint leading-relaxed space-y-1">
                                        <div className="flex items-center gap-2"><span className="text-primary">✓</span> AST detected: Circular dependency</div>
                                        <div className="flex items-center gap-2"><span className="text-secondary-fixed">i</span> AI Insight: Refactor suggest - use Composition pattern</div>
                                        <div className="opacity-40 italic">Scanning src/components/Auth... Done in 14ms</div>
                                        <div className="w-full bg-surface-container-high h-1 mt-2">
                                            <div className="bg-primary h-full w-[85%] transition-all duration-1000"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Card 02 */}
                            <div className="terminal-block bg-surface-container reveal-card expand-card group relative p-6 flex flex-col gap-8 transition-all hover:border-primary delay-75">
                                <div className="flex justify-between items-start">
                                    <span className="font-label-caps text-label-caps text-on-surface-variant">02/</span>
                                    <span className="material-symbols-outlined text-primary">shield</span>
                                </div>
                                <div className="flex flex-col items-center justify-center py-4">
                                    <div className="status-ring">
                                        <svg height="64" width="64">
                                            <circle className="stroke-error/30" cx="32" cy="32" r="30"></circle>
                                            <circle className="stroke-error" cx="32" cy="32" r="30"></circle>
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-[10px] font-bold text-error pulse-live">LIVE</span>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-headline-md text-[20px] mb-4">Security Auditing</h3>
                                    <p className="font-body-base text-body-base text-on-surface-variant">Real-time OSV scanning and secret detection before you ever hit merge.</p>
                                </div>
                                <div className="card-drawer pt-4 border-t border-outline-variant/30">
                                    <div className="text-[10px] text-error leading-relaxed space-y-1">
                                        <div>CRITICAL: CVE-2024-21503 in @nestjs/core</div>
                                        <div>HIGH: Unvalidated Redirect in auth.ts:102</div>
                                        <div className="text-on-surface-variant opacity-60">Database connections: ENCRYPTED</div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 03 */}
                            <div className="terminal-block reveal-card border-primary p-6 flex flex-col gap-8 transition-all hover:border-primary shadow-[0_0_15px_rgba(255,255,255,0.05)] delay-150">
                                <div className="flex justify-between items-start">
                                    <span className="font-label-caps text-label-caps text-on-surface-variant">03/</span>
                                    <span className="material-symbols-outlined text-primary">bar_chart</span>
                                </div>
                                <div className="space-y-2 py-4">
                                    <div className="h-1 bg-outline-variant w-full overflow-hidden">
                                        <div className="h-full bg-primary w-4/5 transition-all duration-700"></div>
                                    </div>
                                    <div className="h-1 bg-outline-variant w-full overflow-hidden">
                                        <div className="h-full bg-primary w-2/3 transition-all duration-700 delay-75"></div>
                                    </div>
                                    <div className="h-1 bg-outline-variant w-full overflow-hidden">
                                        <div className="h-full bg-primary w-1/2 transition-all duration-700 delay-150"></div>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-headline-md text-[20px] mb-4">Deep Insights</h3>
                                    <p className="font-body-base text-body-base text-on-surface-variant">0-100 health scores mapped across every module in your codebase with trend analysis.</p>
                                </div>
                                <div className="card-drawer pt-4 border-t border-outline-variant/30">
                                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                                        <div className="text-on-surface-variant">MAINTAINABILITY</div><div className="text-primary text-right">92/100</div>
                                        <div className="text-on-surface-variant">COMPLEXITY</div><div className="text-primary text-right">LOW</div>
                                        <div className="text-on-surface-variant">CHURN RATE</div><div className="text-primary text-right">↑ 4%</div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 04 */}
                            <div className="terminal-block bg-surface-container reveal-card expand-card group relative p-6 flex flex-col gap-8 transition-all hover:border-primary delay-200">
                                <div className="flex justify-between items-start">
                                    <span className="font-label-caps text-label-caps text-on-surface-variant">04/</span>
                                    <span className="material-symbols-outlined text-primary">hub</span>
                                </div>
                                <div className="flex justify-center py-4">
                                    <div className="w-16 h-12 border border-outline-variant rounded flex items-center justify-center group-hover:border-primary transition-colors">
                                        <span className="material-symbols-outlined text-[20px] text-primary">terminal</span>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-headline-md text-[20px] mb-4">GitHub Native</h3>
                                    <p className="font-body-base text-body-base text-on-surface-variant">Seamless PR bot integration. It's like having your senior dev on-call 24/7 in every pull request.</p>
                                </div>
                                <div className="card-drawer pt-4 border-t border-outline-variant/30">
                                    <div className="text-[10px] space-y-1">
                                        <div className="text-primary">@repolens-bot commented on PR #42:</div>
                                        <div className="text-on-surface-variant bg-surface-container-low p-1 rounded italic">"I found 2 potential memory leaks in this commit. Reverting to previous state is recommended."</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section id="activity" className="py-24 px-margin-desktop bg-surface text-center flex flex-col items-center reveal-card">
                    <h2 className="font-headline-lg text-headline-lg mb-12 h-20 typewriter" id="cta-text" ref={ctaTextRef}></h2>
                    <button onClick={() => setIsModalOpen(true)} className="bg-primary text-on-primary px-12 py-4 font-label-caps text-label-caps hover:scale-105 transition-transform">
                        JOIN THE REVOLUTION
                    </button>
                </section>
            </main>

            {/* Technical Metadata Footer */}
            <footer id="documentation" className="w-full border-t border-outline-variant bg-surface flex flex-col md:flex-row justify-between items-center py-gutter px-margin-desktop gap-4">
                <div className="font-label-caps text-label-caps text-primary">REPOLENS</div>
                <div className="font-code-base text-code-base text-on-surface-variant text-center md:text-left">
                    © {new Date().getFullYear()} REPOLENS TECHNICAL SYSTEMS [ 52.3676° N, 4.9041° E ]
                </div>
                <div className="flex gap-6">
                    <a className="font-code-base text-code-base text-on-surface-variant hover:text-primary transition-colors" href="#">Status: Optimal</a>
                    <a className="font-code-base text-code-base text-on-surface-variant hover:text-primary transition-colors" href="#">v4.0.2-stable</a>
                    <a className="font-code-base text-code-base text-on-surface-variant hover:text-primary transition-colors" href="#">Legal</a>
                    <a className="font-code-base text-code-base text-on-surface-variant hover:text-primary transition-colors" href="#">Access Logs</a>
                </div>
            </footer>
        </div>
    );
}
