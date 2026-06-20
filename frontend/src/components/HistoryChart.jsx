import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export default function HistoryChart({ owner, repo }) {
    const [history, setHistory] = useState([]);

    useEffect(() => {
        fetch(`${BACKEND}/trends/${owner}/${repo}`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    // Format dates for the chart
                    const formatted = data.map(item => ({
                        ...item,
                        date: new Date(item.created_at).toLocaleDateString(),
                        time: new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                    }));
                    setHistory(formatted);
                }
            })
            .catch(err => console.error("Failed to fetch history:", err));
    }, [owner, repo]);

    if (history.length <= 1) {
        return null; // Don't show chart if there's no meaningful history
    }

    return (
        <div className="glass-panel" style={{ padding: '24px', marginTop: '16px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600, color: 'var(--text-1)' }}>
                Historical Trend
            </h3>
            <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                    <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis 
                            dataKey="date" 
                            stroke="var(--text-3)" 
                            fontSize={12} 
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis 
                            domain={[0, 100]} 
                            stroke="var(--text-3)" 
                            fontSize={12} 
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)', borderRadius: '8px', color: 'var(--text-1)' }}
                            labelStyle={{ color: 'var(--text-2)', marginBottom: '4px' }}
                            formatter={(value) => [`${value}/100`, 'Overall Score']}
                            labelFormatter={(label, payload) => payload?.[0]?.payload?.time ? `${label} ${payload[0].payload.time}` : label}
                        />
                        <Line 
                            type="monotone" 
                            dataKey="overall_score" 
                            stroke="var(--a1)" 
                            strokeWidth={3}
                            dot={{ fill: 'var(--a1)', strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
