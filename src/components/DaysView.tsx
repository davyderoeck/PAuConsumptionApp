import { useState } from 'react';
import type { NonLicensedTenantAnalysis, RawApiRow } from '../types';

interface DaysViewProps {
  analysis: NonLicensedTenantAnalysis;
  rawRows: RawApiRow[];
}

interface DayEnvCaller {
  callerId: string;
  callerType: string;
  requests: number;
}

interface DayEnv {
  envId: string;
  envName: string;
  totalRequests: number;
  callers: DayEnvCaller[];
}

function buildDayDetail(rows: RawApiRow[], date: string): DayEnv[] {
  // Group by env then caller for the given date
  const envMap = new Map<string, { envName: string; callers: Map<string, { callerType: string; requests: number }> }>();
  for (const r of rows) {
    if (r.usageDate !== date) continue;
    const envId = r.environmentId;
    const envName = r.environmentName || r.environmentId;
    if (!envMap.has(envId)) envMap.set(envId, { envName, callers: new Map() });
    const envEntry = envMap.get(envId)!;
    const key = r.callerId || '(system)';
    const existing = envEntry.callers.get(key);
    if (existing) {
      existing.requests += r.powerAutomateRequests;
    } else {
      envEntry.callers.set(key, { callerType: r.callerType ?? 'System', requests: r.powerAutomateRequests });
    }
  }
  return Array.from(envMap.entries())
    .map(([envId, { envName, callers }]) => ({
      envId,
      envName,
      totalRequests: Array.from(callers.values()).reduce((s, c) => s + c.requests, 0),
      callers: Array.from(callers.entries())
        .map(([callerId, { callerType, requests }]) => ({ callerId, callerType, requests }))
        .sort((a, b) => b.requests - a.requests),
    }))
    .sort((a, b) => b.totalRequests - a.totalRequests);
}

export default function DaysView({ analysis: nl, rawRows }: DaysViewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedEnvs, setExpandedEnvs] = useState<Set<string>>(new Set());

  const fmtNum = (n: number) => n.toLocaleString();
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const sortedDays = [...nl.dailyTotals].sort((a, b) => a.date.localeCompare(b.date));
  const maxDay = Math.max(...sortedDays.map(d => d.requests));

  const statusColor = (requests: number) => {
    if (nl.tenantPool === 0) return 'var(--text-muted)';
    const pct = requests / nl.tenantPool;
    if (pct > 1.0) return 'var(--red)';
    if (pct > 0.8) return 'var(--amber)';
    return 'var(--green)';
  };
  const statusClass = (requests: number) => {
    if (nl.tenantPool === 0) return '';
    const pct = requests / nl.tenantPool;
    if (pct > 1.0) return 'row-non-compliant';
    if (pct > 0.8) return 'row-warning';
    return '';
  };

  const dayDetail = selectedDate ? buildDayDetail(rawRows, selectedDate) : [];
  const dayTotal = selectedDate ? (nl.dailyTotals.find(d => d.date === selectedDate)?.requests ?? 0) : 0;

  const toggleEnv = (envId: string) => {
    setExpandedEnvs(prev => {
      const next = new Set(prev);
      if (next.has(envId)) next.delete(envId); else next.add(envId);
      return next;
    });
  };

  return (
    <div className="days-view">
      {selectedDate ? (
        /* ── Day drill-down ── */
        <div>
          <div className="dd-header" style={{ marginBottom: 16 }}>
            <button className="dd-back" onClick={() => { setSelectedDate(null); setExpandedEnvs(new Set()); }}>
              ← Back to Days
            </button>
            <h2 style={{ margin: 0 }}>📅 {selectedDate}</h2>
            <div className="dd-stats" style={{ marginTop: 8, gap: 16, flexWrap: 'wrap' }}>
              <div className="dd-stat">
                <span className="dd-stat-val" style={{ color: statusColor(dayTotal) }}>{fmtNum(dayTotal)}</span>
                <span className="dd-stat-lbl">Total req this day</span>
              </div>
              {nl.tenantPool > 0 && (
                <div className="dd-stat">
                  <span className="dd-stat-val" style={{ color: statusColor(dayTotal) }}>
                    {fmtPct(dayTotal / nl.tenantPool)}
                  </span>
                  <span className="dd-stat-lbl">% of pool ({fmtNum(nl.tenantPool)})</span>
                </div>
              )}
              {dayTotal > nl.tenantPool && nl.tenantPool > 0 && (
                <div className="dd-stat">
                  <span className="dd-stat-val" style={{ color: 'var(--red)' }}>+{fmtNum(dayTotal - nl.tenantPool)}</span>
                  <span className="dd-stat-lbl">Overrun</span>
                </div>
              )}
              <div className="dd-stat">
                <span className="dd-stat-val">{dayDetail.length}</span>
                <span className="dd-stat-lbl">Environments</span>
              </div>
              <div className="dd-stat">
                <span className="dd-stat-val">{dayDetail.reduce((s, e) => s + e.callers.length, 0)}</span>
                <span className="dd-stat-lbl">Callers</span>
              </div>
            </div>
          </div>

          {/* Per-environment accordion */}
          {dayDetail.map(env => {
            const isOpen = expandedEnvs.has(env.envId);
            const envPct = nl.tenantPool > 0 ? env.totalRequests / nl.tenantPool : 0;
            return (
              <div key={env.envId} className="days-env-card">
                <div
                  className="days-env-header"
                  onClick={() => toggleEnv(env.envId)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="days-env-toggle">{isOpen ? '▾' : '▸'}</span>
                  <span className="days-env-name" title={env.envId}>{env.envName}</span>
                  <span className="days-env-callers">{env.callers.length} caller{env.callers.length !== 1 ? 's' : ''}</span>
                  <div className="days-env-bar-wrap">
                    <div className="days-env-bar-track">
                      <div
                        className="days-env-bar-fill"
                        style={{
                          width: `${Math.min((env.totalRequests / Math.max(dayTotal, 1)) * 100, 100)}%`,
                          background: statusColor(dayTotal > 0 ? (env.totalRequests / dayTotal) * nl.tenantPool || env.totalRequests : env.totalRequests),
                        }}
                      />
                    </div>
                  </div>
                  <span className="days-env-total" style={{ color: 'var(--text-muted)', minWidth: 100, textAlign: 'right' }}>
                    {fmtNum(env.totalRequests)}
                    {nl.tenantPool > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8em', marginLeft: 6 }}>
                        ({fmtPct(envPct)})
                      </span>
                    )}
                  </span>
                </div>

                {isOpen && (
                  <div className="breakdown-scroll" style={{ marginTop: 6 }}>
                    <table className="breakdown-table">
                      <thead>
                        <tr>
                          <th>Caller ID</th>
                          <th>Type</th>
                          <th className="num">Requests</th>
                          <th className="num">% of Day Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {env.callers.map(c => (
                          <tr key={c.callerId}>
                            <td className="caller-cell" title={c.callerId}>{c.callerId}</td>
                            <td style={{ fontSize: '0.82em', color: 'var(--text-muted)' }}>{c.callerType}</td>
                            <td className="num">{fmtNum(c.requests)}</td>
                            <td className="num">{dayTotal > 0 ? fmtPct(c.requests / dayTotal) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Day list ── */
        <div>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 4px' }}>📅 Daily Consumption</h2>
            <p style={{ margin: 0, fontSize: '0.85em', color: 'var(--text-muted)' }}>
              {sortedDays.length} days · Pool: {fmtNum(nl.tenantPool)} req/day  ·  Click a row to see callers by environment
            </p>
          </div>

          <div className="breakdown-scroll">
            <table className="breakdown-table days-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Consumption vs Pool</th>
                  <th className="num">Total Requests</th>
                  {nl.tenantPool > 0 && <th className="num">% of Pool</th>}
                  {nl.tenantPool > 0 && <th className="num">Overrun</th>}
                  <th className="num">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedDays.map(day => {
                  const pct = nl.tenantPool > 0 ? day.requests / nl.tenantPool : 0;
                  const overrun = Math.max(0, day.requests - nl.tenantPool);
                  const barW = Math.min((day.requests / Math.max(maxDay, 1)) * 100, 100);
                  const poolMarkPct = nl.tenantPool > 0 ? Math.min((nl.tenantPool / Math.max(maxDay, 1)) * 100, 100) : 100;
                  const color = statusColor(day.requests);
                  const isOverDay = overrun > 0;
                  const isPeak = day.date === nl.peakTenantDay;
                  return (
                    <tr
                      key={day.date}
                      className={`breakdown-clickable ${statusClass(day.requests)}`}
                      onClick={() => { setSelectedDate(day.date); setExpandedEnvs(new Set()); }}
                      title="Click to see callers by environment for this day"
                    >
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {day.date}
                        {isPeak && <span className="days-peak-badge"> ↑ peak</span>}
                      </td>
                      <td style={{ minWidth: 200, paddingRight: 8 }}>
                        <div className="days-bar-wrap">
                          {/* Pool cap marker */}
                          {nl.tenantPool > 0 && (
                            <div
                              className="days-pool-marker"
                              style={{ left: `${poolMarkPct}%` }}
                              title={`Pool cap: ${fmtNum(nl.tenantPool)}`}
                            />
                          )}
                          {/* Usage bar */}
                          <div
                            className="days-bar-fill"
                            style={{
                              width: `${barW}%`,
                              background: isOverDay
                                ? `linear-gradient(to right, #3fb950 ${poolMarkPct}%, #da3633 ${poolMarkPct}%)`
                                : color,
                            }}
                          />
                        </div>
                      </td>
                      <td className="num">{fmtNum(day.requests)}</td>
                      {nl.tenantPool > 0 && (
                        <td className="num" style={{ color }}>{fmtPct(pct)}</td>
                      )}
                      {nl.tenantPool > 0 && (
                        <td className="num" style={{ color: isOverDay ? 'var(--red)' : 'var(--text-muted)' }}>
                          {isOverDay ? `+${fmtNum(overrun)}` : '—'}
                        </td>
                      )}
                      <td className="num">
                        {isOverDay
                          ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>⚠ Over</span>
                          : pct > 0.8
                          ? <span style={{ color: 'var(--amber)' }}>~ High</span>
                          : <span style={{ color: 'var(--green)' }}>✓ OK</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
