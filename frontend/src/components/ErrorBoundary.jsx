import { Component } from 'react';
import { ShieldAlert } from 'lucide-react';

/**
 * ErrorBoundary — catches render errors in child components (e.g. Dashboard)
 * and shows a clean fallback instead of a blank screen.
 *
 * Must be a class component — React hooks cannot catch render errors.
 */
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, message: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, message: error?.message || 'Unknown error' };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg, #0a0a0a)',
                    padding: '24px',
                }}>
                    <div style={{
                        maxWidth: '480px',
                        width: '100%',
                        background: 'var(--bg-surface, #111)',
                        border: '1px solid var(--border, #222)',
                        borderRadius: '12px',
                        padding: '40px',
                        textAlign: 'center',
                    }}>
                        <ShieldAlert
                            size={40}
                            style={{ color: 'var(--red, #e05252)', margin: '0 auto 16px' }}
                        />
                        <h2 style={{
                            fontSize: '20px',
                            fontWeight: 600,
                            color: 'var(--text-1, #fff)',
                            marginBottom: '8px',
                        }}>
                            Something went wrong
                        </h2>
                        <p style={{
                            fontSize: '14px',
                            color: 'var(--text-3, #888)',
                            marginBottom: '28px',
                            lineHeight: 1.6,
                        }}>
                            An unexpected error occurred while rendering the report.
                            This has been logged for investigation.
                        </p>
                        {this.state.message && (
                            <pre style={{
                                fontSize: '12px',
                                color: 'var(--red, #e05252)',
                                background: 'rgba(224,82,82,0.08)',
                                border: '1px solid rgba(224,82,82,0.2)',
                                borderRadius: '6px',
                                padding: '12px',
                                textAlign: 'left',
                                overflowX: 'auto',
                                marginBottom: '28px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}>
                                {this.state.message}
                            </pre>
                        )}
                        <a
                            href="/"
                            style={{
                                display: 'inline-block',
                                padding: '10px 24px',
                                background: 'var(--a1, #6366f1)',
                                color: '#fff',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: 500,
                                textDecoration: 'none',
                                transition: 'opacity 0.2s',
                            }}
                            onMouseEnter={e => e.target.style.opacity = '0.85'}
                            onMouseLeave={e => e.target.style.opacity = '1'}
                        >
                            ← Go Home
                        </a>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
