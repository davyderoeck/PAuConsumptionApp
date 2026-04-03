import { useState } from 'react';
import type { NonLicensedTenantAnalysis, RawApiRow } from '../types';

interface DaysViewProps {
  analysis: NonLicensedTenantAnalysis;
  rawRows: RawApiRow[];
  addonPrice: number;   // $/month per add-on (from settings)
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
  /** pool coverage determined by bottom-up cumulative allocation */
  coverage: 'covered' | 'warning' | 'overrun';
}

function buildDayDetail(rows: RawApiRow[], date: string, tenantPool: number): DayEnv[] {
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

  // Sort envs by total desc, then assign coverage bottom-up (smallest first)
  const envList = Array.from(envMap.entries())
    .map(([envId, { envName, callers }]) => ({
      envId,
      envName,
      totalRequests: Array.from(callers.values()).reduce((s, c) => s + c.requests, 0),
      callers: Array.from(callers.entries())
        .map(([callerId, { callerType, requests }]) => ({ callerId, callerType, requests }))
        .sort((a, b) => b.requests - a.requests),
    }))
    .sort((a, b) => b.totalRequests - a.totalRequests);

  // Bottom-up allocation (smallest first)
  const asc = [...envList].sort((a, b) => a.totalRequests - b.totalRequests);
  let cumulative = 0;
  const coverageMap = new Map<string, DayEnv['coverage']>();
  for (const e of asc) {
    cumulative += e.totalRequests;
    const pct = tenantPool > 0 ? cumulative / tenantPool : 0;
    coverageMap.set(e.envId, pct <= 1.0 ? 'covered' : pct <= 1.1 ? 'warning' : 'overrun');
  }

  return envList.map(e => ({ ...e, coverage: coverageMap.get(e.envId) ?? 'covered' }));
}

export default function DaysView({ analysis: nl, rawRows, addonPrice }: DaysViewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedEnvId, setExpandedEnvId] = useState<string | null>(null);

  const fmtNum = (n: number) => n.toLocaleString();
  const fmtPct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
  const fmtCur = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const sortedDays = [...nl.dailyTotals].sort((a, b) => a.date.localeCompare(b.date));
  const maxDay = Math.max(...sortedDays.map(d => d.requests), 1);
  const dateList = sortedDays.map(d => d.date);

  const selectedIdx = selectedDate ? dateList.indexOf(selectedDate) : -1;
  const prevDate = selectedIdx > 0 ? dateList[selectedIdx - 1] : null;
  const nextDate = selectedIdx >= 0 && selectedIdx < dateList.length - 1 ? dateList[selectedIdx + 1] : null;

  const navigate = (date: string) => { setSelectedDate(date); setExpandedEnvId(null); };

  const statusColor = (pct: number) => {
    if (pct > 1.0) return 'var(--red)';
    if (pct > 0.8) return 'var(--amber)';
    return 'var(--green)';
  };
  const coverageColor = (c: DayEnv['coverage']) =>
    c === 'overrun' ? 'var(--red)' : c === 'warning' ? 'var(--amber)' : 'var(--green)';

  const statusClass = (pct: number) =>
    pct > 1.0 ? 'row-non-compliant' : pct > 0.8 ? 'row-warning' : '';

  const dayDetail = selectedDate ? buildDayDetail(rawRows, selectedDate, nl.tenantPool) : [];
  const dayTotal = selectedDate ? (nl.dailyTotals.find(d => d.date === selectedDate)?.requests ?? 0) : 0;
  const dayPct = nl.tenantPool > 0 ? dayTotal / nl.tenantPool : 0;
  const dayOverrun = Math.max(0, dayTotal - nl.tenantPool);

  // PPR opportunity for this day's overrun
  const REQUEST_ADDON_CAPACITY = 50_000;
  const dayAddonsNeeded = dayOverrun > 0 ? Math.ceil(dayOverrun / REQUEST_ADDON_CAPACITY) : 0;
  const dayAddonCost = addonPrice > 0 ? dayAddonsNeeded * addonPrice : null;

  return (
    <div className="days-view">
      {selectedDate ? (
        /* ── Day drill-down ── */
        <div>
          {/* Navigation header */}
          <div className="days-nav-bar">
            <button className="days-nav-btn days-back-btn" onClick={() => { setSelectedDate(null); setExpandedEnvId(null); }}>
              ← All Days
            </button>
            <div className="days-nav-center">
              <button className="days-nav-arrow" onClick={() => prevDate && navigate(prevDate)} disabled={!prevDate} title={prevDate ? `← ${prevDate}` : 'No previous day'}>
                ‹
              </button>
              <h2 className="days-nav-date">📅 {selectedDate}</h2>
              <button className="days-nav-arrow" onClick={() => nextDate && navigate(nextDate)} disabled={!nextDate} title={nextDate ? `${nextDate} →` : 'No next day'}>
                ›
              </button>
            </div>
            <div className="days-nav-spacer" />
          </div>

          {/* Day KPI bar */}
          <div className="days-day-kpis">
            <div className="days-day-kpi">
              <span className="days-day-kpi-val" style={{ color: statusColor(dayPct) }}>{fmtNum(dayTotal)}</span>
              <span className="days-day-kpi-lbl">Total req this day</span>
            </div>
            {nl.tenantPool > 0 && (
              <div className="days-day-kpi">
                <span className="days-day-kpi-val" style={{ color: statusColor(dayPct) }}>{fmtPct(dayPct)}</span>
                <span className="days-day-kpi-lbl">% of pool ({fmtNum(nl.tenantPool)})</span>
              </div>
            )}
            {dayOverrun > 0 && (
              <div className="days-day-kpi">
                <span className="days-day-kpi-val" style={{ color: 'var(--red)' }}>+{fmtNum(dayOverrun)}</span>
                <span className="days-day-kpi-lbl">Overrun</span>
              </div>
            )}
            {dayOverrun > 0 && (
              <div className="days-day-kpi">
                <span className="days-day-kpi-val" style={{ color: 'var(--amber)' }}>{dayAddonsNeeded}</span>
                <span className="days-day-kpi-lbl">Add-ons needed</span>
              </div>
            )}
            {dayOverrun > 0 && dayAddonCost !== null && (
              <div className="days-day-kpi">
                <span className="days-day-kpi-val" style={{ color: 'var(--accent)' }}>{fmtCur(dayAddonCost)}/mo</span>
                <span className="days-day-kpi-lbl">PPR add-on cost</span>
              </div>
            )}
            <div className="days-day-kpi">
              <span className="days-day-kpi-val">{dayDetail.length}</span>
              <span className="days-day-kpi-lbl">Environments</span>
            </div>
            <div className="days-day-kpi">
              <span className="days-day-kpi-val">{dayDetail.reduce((s, e) => s + e.callers.length, 0)}</span>
              <span className="days-day-kpi-lbl">Callers</span>
            </div>
          </div>

          {/* Environment tiles grid */}
          <div className="days-env-tiles">
            {dayDetail.map(env => {
              const envPct = nl.tenantPool > 0 ? env.totalRequests / nl.tenantPool : 0;
              const barW = Math.min((env.totalRequests / Math.max(dayTotal, 1)) * 100, 100);
              const isOpen = expandedEnvId === env.envId;
              const clr = coverageColor(env.coverage);
              return (
                <div
                  key={env.envId}
                  className={`days-env-tile ${isOpen ? 'days-env-tile-open' : ''}`}
                  onClick={() => setExpandedEnvId(isOpen ? null : env.envId)}
                >
                  <div className="days-env-tile-header">
                    <div className="days-env-tile-status-dot" style={{ background: clr }} />
                    <span className="days-env-tile-name" title={env.envId}>{env.envName}</span>
                  </div>
                  <div className="days-env-tile-val" style={{ color: clr }}>
                    {fmtNum(env.totalRequests)}
                  </div>
                  <div className="days-env-tile-pct" style={{ color: 'var(--text-muted)' }}>
                    {nl.tenantPool > 0 ? `${fmtPct(envPct)} of pool` : `${fmtPct(env.totalRequests / Math.max(dayTotal, 1))} of day`}
                  </div>
                  {/* Mini bar */}
                  <div className="days-env-tile-bar-track">
                    <div className="days-env-tile-bar-fill" style={{ width: `${barW}%`, background: clr }} />
                  </div>
                  <div className="days-env-tile-callers">{env.callers.length} caller{env.callers.length !== 1 ? 's' : ''} · click to expand</div>

                  {/* Expanded caller table */}
                  {isOpen && (
                    <div className="days-env-tile-detail" onClick={e => e.stopPropagation()}>
                      <table className="breakdown-table" style={{ marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th>Caller ID</th>
                            <th>Type</th>
                            <th className="num">Requests</th>
                            <th className="num">% of Day</th>
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
        </div>
      ) : (
        /* ── Day list ── */
        <div>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 4px' }}>📅 Daily Consumption</h2>
            <p style={{ margin: 0, fontSize: '0.85em', color: 'var(--text-muted)' }}>
              {sortedDays.length} days · Pool: {fmtNum(nl.tenantPool)} req/day
              {addonPrice > 0 && ` · PPR add-on: ${fmtCur(addonPrice)}/mo per 50k`}
              {' · Click a row to see environments'}
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
                  {nl.tenantPool > 0 && addonPrice > 0 && <th className="num">PPR Cost/mo</th>}
                  <th className="num">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedDays.map(day => {
                  const pct = nl.tenantPool > 0 ? day.requests / nl.tenantPool : 0;
                  const overrun = Math.max(0, day.requests - nl.tenantPool);
                  const barW = Math.min((day.requests / maxDay) * 100, 100);
                  const poolMarkPct = nl.tenantPool > 0 ? Math.min((nl.tenantPool / maxDay) * 100, 100) : 100;
                  const isOverDay = overrun > 0;
                  const isPeak = day.date === nl.peakTenantDay;
                  const addonsNeeded = isOverDay ? Math.ceil(overrun / REQUEST_ADDON_CAPACITY) : 0;
                  const addonCost = addonsNeeded * addonPrice;
                  return (
                    <tr
                      key={day.date}
                      className={`breakdown-clickable ${statusClass(pct)}`}
                      onClick={() => navigate(day.date)}
                      title="Click to see environments for this day"
                    >
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {day.date}
                        {isPeak && <span className="days-peak-badge"> ↑ peak</span>}
                      </td>
                      <td style={{ minWidth: 200, paddingRight: 8 }}>
                        <div className="days-bar-wrap">
                          {nl.tenantPool > 0 && (
                            <div className="days-pool-marker" style={{ left: `${poolMarkPct}%` }} title={`Pool cap: ${fmtNum(nl.tenantPool)}`} />
                          )}
                          <div
                            className="days-bar-fill"
                            style={{
                              width: `${barW}%`,
                              background: isOverDay
                                ? `linear-gradient(to right, #3fb950 ${poolMarkPct}%, #da3633 ${poolMarkPct}%)`
                                : statusColor(pct),
                            }}
                          />
                        </div>
                      </td>
                      <td className="num">{fmtNum(day.requests)}</td>
                      {nl.tenantPool > 0 && (
                        <td className="num" style={{ color: statusColor(pct) }}>{fmtPct(pct)}</td>
                      )}
                      {nl.tenantPool > 0 && (
                        <td className="num" style={{ color: isOverDay ? 'var(--red)' : 'var(--text-muted)' }}>
                          {isOverDay ? `+${fmtNum(overrun)}` : '—'}
                        </td>
                      )}
                      {nl.tenantPool > 0 && addonPrice > 0 && (
                        <td className="num" style={{ color: isOverDay ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {isOverDay && addonCost > 0 ? fmtCur(addonCost) : '—'}
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
