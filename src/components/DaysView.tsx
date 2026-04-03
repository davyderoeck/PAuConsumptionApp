import { useState } from 'react';
import type { NonLicensedTenantAnalysis, RawApiRow } from '../types';
import { D365_POOL_CAP, PROCESS_CAPACITY_UNIT, REQUEST_ADDON_CAPACITY } from '../types';

interface DaysViewProps {
  analysis: NonLicensedTenantAnalysis;
  rawRows: RawApiRow[];
  addonPrice: number;      // $/month per PP Request add-on (50k req/day)
  processPrice: number;   // $/month per Process license (250k req/day)
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

export default function DaysView({ analysis: nl, rawRows, addonPrice, processPrice }: DaysViewProps) {
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

  // Per-day 10M-aware cost calculations (drill-down)
  const dayOverrunForAddons = Math.max(0, Math.min(dayTotal, D365_POOL_CAP) - nl.tenantPool);
  const dayAddonsNeeded = dayOverrunForAddons > 0 ? Math.min(Math.ceil(dayOverrunForAddons / REQUEST_ADDON_CAPACITY), nl.addonsAvailable) : 0;
  const dayAddonCost = addonPrice > 0 && dayAddonsNeeded > 0 ? dayAddonsNeeded * addonPrice : null;
  const dayExcessAbove10M = Math.max(0, dayTotal - D365_POOL_CAP);
  const dayProcessLicNeeded = dayExcessAbove10M > 0 ? Math.ceil(dayExcessAbove10M / PROCESS_CAPACITY_UNIT) : 0;
  const dayProcessCost = processPrice > 0 && dayProcessLicNeeded > 0 ? dayProcessLicNeeded * processPrice : null;
  // Show the 10M marker line in bars only when relevant
  const anyDayAbove10M = nl.addonsCapped;

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
                <span className="days-day-kpi-lbl">Overrun vs pool</span>
              </div>
            )}
            {dayAddonsNeeded > 0 && (
              <div className="days-day-kpi">
                <span className="days-day-kpi-val" style={{ color: 'var(--amber)' }}>{dayAddonsNeeded}</span>
                <span className="days-day-kpi-lbl">Add-ons needed{dayExcessAbove10M > 0 ? ' (max)' : ''}</span>
              </div>
            )}
            {dayAddonCost !== null && (
              <div className="days-day-kpi">
                <span className="days-day-kpi-val" style={{ color: 'var(--accent)' }}>{fmtCur(dayAddonCost)}/mo</span>
                <span className="days-day-kpi-lbl">Add-on cost</span>
              </div>
            )}
            {dayExcessAbove10M > 0 && (
              <div className="days-day-kpi">
                <span className="days-day-kpi-val" style={{ color: 'var(--red)' }}>+{fmtNum(dayExcessAbove10M)}</span>
                <span className="days-day-kpi-lbl">Above 10M cap</span>
              </div>
            )}
            {dayProcessLicNeeded > 0 && (
              <div className="days-day-kpi">
                <span className="days-day-kpi-val" style={{ color: 'var(--red)' }}>{dayProcessLicNeeded}</span>
                <span className="days-day-kpi-lbl">Process lic. needed</span>
              </div>
            )}
            {dayProcessCost !== null && (
              <div className="days-day-kpi">
                <span className="days-day-kpi-val" style={{ color: 'var(--red)' }}>{fmtCur(dayProcessCost)}/mo</span>
                <span className="days-day-kpi-lbl">Process lic. cost</span>
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
                  <th>
                    Consumption vs Pool
                    {anyDayAbove10M && (
                      <span style={{ display: 'inline-flex', gap: 8, marginLeft: 10, fontSize: '0.78em', fontWeight: 400 }}>
                        <span style={{ color: 'var(--green)' }}>■ pool</span>
                        <span style={{ color: '#c18e00' }}>■ add-on zone</span>
                        <span style={{ color: 'var(--red)' }}>■ process zone</span>
                      </span>
                    )}
                  </th>
                  <th className="num">Total Requests</th>
                  {nl.tenantPool > 0 && <th className="num">% of Pool</th>}
                  {nl.tenantPool > 0 && <th className="num">Overrun</th>}
                  {nl.tenantPool > 0 && addonPrice > 0 && <th className="num">Add-on Cost/mo</th>}
                  {nl.addonsCapped && <th className="num" style={{ color: 'var(--red)' }}>Process Cost/mo</th>}
                  <th className="num">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedDays.map(day => {
                  const pct = nl.tenantPool > 0 ? day.requests / nl.tenantPool : 0;
                  const overrun = Math.max(0, day.requests - nl.tenantPool);
                  const barW = Math.min((day.requests / maxDay) * 100, 100);
                  const poolMarkPct = nl.tenantPool > 0 ? Math.min((nl.tenantPool / maxDay) * 100, 100) : 100;
                  const capMarkPct = Math.min((D365_POOL_CAP / maxDay) * 100, 100);
                  const isOverDay = overrun > 0;
                  const isAboveCap = day.requests > D365_POOL_CAP;
                  const isPeak = day.date === nl.peakTenantDay;

                  // Unified color for data cells (% of pool, overrun) — green if within pool
                  const rowStatusColor = isAboveCap ? 'var(--red)'
                    : isOverDay ? '#c18e00'
                    : 'var(--green)';

                  // Add-on cost: only for overrun between pool and 10M cap
                  const dayOverrunForAddons = Math.max(0, Math.min(day.requests, D365_POOL_CAP) - nl.tenantPool);
                  const dayAddonsNeededRow = dayOverrunForAddons > 0 ? Math.min(Math.ceil(dayOverrunForAddons / REQUEST_ADDON_CAPACITY), nl.addonsAvailable) : 0;
                  const dayAddonCostRow = dayAddonsNeededRow * addonPrice;

                  // Process cost: only for overrun above 10M cap
                  const dayExcess10M = Math.max(0, day.requests - D365_POOL_CAP);
                  const dayProcLicRow = dayExcess10M > 0 ? Math.ceil(dayExcess10M / PROCESS_CAPACITY_UNIT) : 0;
                  const dayProcCostRow = dayProcLicRow * processPrice;

                  // 3-zone gradient for overrun bars
                  const poolFracInFill = barW > 0 && day.requests > nl.tenantPool
                    ? Math.min((nl.tenantPool / day.requests) * 100, 100) : 100;
                  const capFracInFill = barW > 0 && day.requests > D365_POOL_CAP
                    ? Math.min((D365_POOL_CAP / day.requests) * 100, 100) : 100;

                  let barBackground: string;
                  if (!isOverDay) {
                    barBackground = statusColor(pct);
                  } else if (isAboveCap) {
                    barBackground = `linear-gradient(to right, #3fb950 ${poolFracInFill}%, #c18e00 ${poolFracInFill}%, #c18e00 ${capFracInFill}%, #da3633 ${capFracInFill}%)`;
                  } else {
                    barBackground = `linear-gradient(to right, #3fb950 ${poolFracInFill}%, #c18e00 ${poolFracInFill}%)`;
                  }

                  return (
                    <tr
                      key={day.date}
                      className={`breakdown-clickable ${isAboveCap ? 'row-non-compliant' : statusClass(pct)}`}
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
                          {anyDayAbove10M && capMarkPct < 100 && (
                            <div className="days-pool-marker days-cap-marker" style={{ left: `${capMarkPct}%` }} title={`10M platform cap: ${fmtNum(D365_POOL_CAP)}`} />
                          )}
                          <div className="days-bar-fill" style={{ width: `${barW}%`, background: barBackground }} />
                        </div>
                      </td>
                      <td className="num">{fmtNum(day.requests)}</td>
                      {nl.tenantPool > 0 && (
                        <td className="num" style={{ color: rowStatusColor }}>{fmtPct(pct)}</td>
                      )}
                      {nl.tenantPool > 0 && (
                        <td className="num" style={{ color: isOverDay ? rowStatusColor : 'var(--text-muted)' }}>
                          {isOverDay ? `+${fmtNum(overrun)}` : '—'}
                        </td>
                      )}
                      {nl.tenantPool > 0 && addonPrice > 0 && (
                        <td className="num" style={{ color: dayAddonCostRow > 0 ? '#c18e00' : 'var(--text-muted)' }}>
                          {dayAddonCostRow > 0 ? fmtCur(dayAddonCostRow) : '—'}
                        </td>
                      )}
                      {nl.addonsCapped && (
                        <td className="num" style={{ color: dayProcCostRow > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                          {dayProcCostRow > 0
                            ? <strong>{fmtCur(dayProcCostRow)}</strong>
                            : dayExcess10M > 0 && processPrice === 0
                            ? <em style={{ color: 'var(--text-muted)' }}>Set price ⚙️</em>
                            : '—'}
                        </td>
                      )}
                      <td className="num">
                        {isAboveCap
                          ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>⚠ &gt;10M</span>
                          : isOverDay
                          ? <span style={{ color: '#c18e00', fontWeight: 600 }}>⚠ Over</span>
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
