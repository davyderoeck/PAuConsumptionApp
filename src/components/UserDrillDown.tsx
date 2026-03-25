import { useEffect, useRef } from 'react';
import type { UserDrillDownData, FileType } from '../types';
import { STANDARD_CAPACITY, PREMIUM_CAPACITY, PROCESS_CAPACITY_UNIT } from '../types';

interface UserDrillDownProps {
  data: UserDrillDownData;
  onClose: () => void;
  fileType: FileType;
}

const fmt = (n: number) => n >= 1_000_000
  ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000
  ? `${(n / 1_000).toFixed(0)}k`
  : String(n);

/** Color a cell based on daily request count and user's entitlement */
function cellColor(requests: number, entitlement: number, isPerFlow = false): string {
  if (requests === 0) return 'var(--matrix-empty)';
  if (isPerFlow) {
    if (requests <= PREMIUM_CAPACITY) return 'var(--matrix-downgrade)';  // blue — could use premium
    if (requests <= PROCESS_CAPACITY_UNIT) return 'var(--matrix-ok)';   // green — within entitlement
    return 'var(--matrix-process)';                                      // red — over entitlement
  }
  if (entitlement === 0) return 'var(--matrix-no-license)';
  if (requests <= entitlement) return 'var(--matrix-ok)';
  if (entitlement < PREMIUM_CAPACITY && requests <= PREMIUM_CAPACITY) return 'var(--matrix-premium)';
  return 'var(--matrix-process)';
}

/** Render an SVG line chart for daily totals with entitlement-aware coloring */
function TrendChart({ data, width = 640, height = 160, fileType }: {
  data: UserDrillDownData;
  width?: number;
  height?: number;
  fileType: FileType;
}) {
  const { dailyTotal, classified } = data;
  if (dailyTotal.length === 0) return null;

  const isPerFlow = fileType === 'per-flow';
  const entitlement = isPerFlow ? PROCESS_CAPACITY_UNIT : classified.maxEntitledQuantity;
  const hasPremium = entitlement >= PREMIUM_CAPACITY;

  const padL = 52, padR = 12, padT = 12, padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const maxVal = Math.max(...dailyTotal.map(d => d.requests), PREMIUM_CAPACITY * 1.1, (entitlement || STANDARD_CAPACITY) * 1.1);
  const scaleY = (v: number) => padT + chartH - (v / maxVal) * chartH;
  const scaleX = (i: number) => padL + (i / Math.max(dailyTotal.length - 1, 1)) * chartW;

  const points = dailyTotal.map((d, i) => `${scaleX(i)},${scaleY(d.requests)}`).join(' ');

  // X axis labels (show first, mid, last)
  const labelIdxs = dailyTotal.length <= 7
    ? dailyTotal.map((_, i) => i)
    : [0, Math.floor((dailyTotal.length - 1) / 2), dailyTotal.length - 1];

  /** Color a data point based on entitlement */
  const dotColor = (requests: number): string => {
    if (isPerFlow) {
      if (requests <= PREMIUM_CAPACITY) return '#58a6ff'; // blue = downgrade candidate
      if (requests <= entitlement) return '#3fb950';       // green = compliant
      return '#da3633';                                    // red = over entitlement
    }
    if (entitlement === 0) return '#8b949e';
    if (requests <= entitlement) return '#3fb950';
    if (!hasPremium && requests <= PREMIUM_CAPACITY) return '#d29922';
    return '#da3633';
  };

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="trend-svg" preserveAspectRatio="none">
      {/* Entitlement background band (light green) */}
      {entitlement > 0 && (
        <rect
          x={padL} y={scaleY(entitlement)}
          width={chartW} height={padT + chartH - scaleY(entitlement)}
          fill="rgba(63,185,80,0.07)"
        />
      )}

      {/* Grid lines */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="var(--border)" strokeWidth={1} />
      <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke="var(--border)" strokeWidth={1} />

      {/* Entitlement threshold (green) */}
      {entitlement > 0 && (
        <>
          <line x1={padL} y1={scaleY(entitlement)} x2={padL + chartW} y2={scaleY(entitlement)}
            stroke="#3fb950" strokeWidth={1.5} strokeDasharray="6 3" />
          <text x={padL - 4} y={scaleY(entitlement) + 4} textAnchor="end" fontSize="9" fill="#3fb950">
            {fmt(entitlement)}
          </text>
        </>
      )}

      {/* 8k reference line — only when user has no premium and entitlement differs from 8k */}
      {!isPerFlow && !hasPremium && entitlement !== STANDARD_CAPACITY && (
        <>
          <line x1={padL} y1={scaleY(STANDARD_CAPACITY)} x2={padL + chartW} y2={scaleY(STANDARD_CAPACITY)}
            stroke="#d29922" strokeWidth={1} strokeDasharray="4 3" opacity={entitlement > 0 ? 0.4 : 0.7} />
          <text x={padL - 4} y={scaleY(STANDARD_CAPACITY) + 4} textAnchor="end" fontSize="9"
            fill="#d29922" opacity={entitlement > 0 ? 0.4 : 0.7}>8k</text>
        </>
      )}

      {/* 40k reference line — only when user doesn't already have premium */}
      {!isPerFlow && !hasPremium && (
        <>
          <line x1={padL} y1={scaleY(PREMIUM_CAPACITY)} x2={padL + chartW} y2={scaleY(PREMIUM_CAPACITY)}
            stroke="#da3633" strokeWidth={1} strokeDasharray="4 3" />
          <text x={padL - 4} y={scaleY(PREMIUM_CAPACITY) + 4} textAnchor="end" fontSize="9" fill="#da3633">40k</text>
        </>
      )}

      {/* Per-flow: 40k downgrade reference line (blue) */}
      {isPerFlow && (
        <>
          <line x1={padL} y1={scaleY(PREMIUM_CAPACITY)} x2={padL + chartW} y2={scaleY(PREMIUM_CAPACITY)}
            stroke="#58a6ff" strokeWidth={1.5} strokeDasharray="5 3" />
          <text x={padL - 4} y={scaleY(PREMIUM_CAPACITY) + 4} textAnchor="end" fontSize="9" fill="#58a6ff">40k</text>
        </>
      )}

      {/* Fill area under line */}
      <polygon
        points={`${padL},${padT + chartH} ${points} ${scaleX(dailyTotal.length - 1)},${padT + chartH}`}
        fill="rgba(47,129,247,0.15)"
      />

      {/* Line */}
      <polyline points={points} fill="none" stroke="#2f81f7" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Data points */}
      {dailyTotal.map((d, i) => (
        <circle key={i} cx={scaleX(i)} cy={scaleY(d.requests)} r={3}
          fill={dotColor(d.requests)}
          stroke="var(--panel)" strokeWidth={1}>
          <title>{d.date}: {d.requests.toLocaleString()} requests</title>
        </circle>
      ))}

      {/* X labels */}
      {labelIdxs.map(i => (
        <text key={i} x={scaleX(i)} y={height - 6} textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          {dailyTotal[i].date.slice(5)}
        </text>
      ))}
    </svg>
  );
}

export default function UserDrillDown({ data, onClose, fileType }: UserDrillDownProps) {
  const { classified: u, allDates, allEnvs, matrix } = data;
  const isPerFlow = fileType === 'per-flow';
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Resize handle drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !panelRef.current) return;
      const delta = startX.current - e.clientX;
      const newW = Math.max(480, Math.min(startWidth.current + delta, window.innerWidth * 0.95));
      panelRef.current.style.width = `${newW}px`;
    };
    const onMouseUp = () => { isResizing.current = false; document.body.style.cursor = ''; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = panelRef.current?.offsetWidth ?? 820;
    document.body.style.cursor = 'ew-resize';
    e.preventDefault();
  };

  const recClass = u.recommendation === 'Process' ? 'badge-process'
    : u.recommendation === 'Premium' ? 'badge-premium'
    : u.recommendation === 'Downgrade to Premium' ? 'badge-downgrade'
    : 'badge-covered';
  const hasPremium = u.maxEntitledQuantity >= PREMIUM_CAPACITY;
  const hasNoLicense = u.maxEntitledQuantity === 0;

  return (
    <div className="dd-overlay" ref={overlayRef} onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="dd-panel" ref={panelRef}>
        {/* Resize handle */}
        <div className="dd-resize-handle" onMouseDown={startResize} title="Drag to resize" />
        {/* Header */}
        <div className="dd-header">
          <div>
            <div className="dd-title">
              <span className="dd-caller">{u.callerId}</span>
              <span className={`badge ${recClass}`}>{u.recommendation}</span>
              <span className={`badge ${u.compliant ? 'badge-covered' : 'badge-process'}`}>
                {u.compliant ? 'Compliant' : 'Non-Compliant'}
              </span>
              {hasNoLicense && <span className="badge badge-no-license">No License</span>}
            </div>
            <div className="dd-meta">
              {u.environmentCount} environment{u.environmentCount !== 1 ? 's' : ''} &nbsp;·&nbsp;
              Peak: <strong>{u.peakDailyRequests.toLocaleString()}</strong> req on {u.peakDate} &nbsp;·&nbsp;
              Total: <strong>{u.totalRequests.toLocaleString()}</strong> req
            </div>
          </div>
          <button className="dd-close" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Stats row */}
        <div className="dd-stats">
          <div className="dd-stat">
            <span className="dd-stat-val">{fmt(u.peakDailyRequests)}</span>
            <span className="dd-stat-lbl">Peak Daily</span>
          </div>
          <div className="dd-stat">
            <span className="dd-stat-val">{fmt(u.maxEntitledQuantity)}</span>
            <span className="dd-stat-lbl">Entitlement</span>
          </div>
          <div className="dd-stat">
            <span className="dd-stat-val" style={{ color: u.capacityGapRequests > 0 ? '#da3633' : '#3fb950' }}>
              {u.capacityGapRequests > 0 ? `+${fmt(u.capacityGapRequests)}` : '0'}
            </span>
            <span className="dd-stat-lbl">Capacity Gap</span>
          </div>
          <div className="dd-stat">
            <span className="dd-stat-val">{u.totalProcessLicensesRequired || '—'}</span>
            <span className="dd-stat-lbl">Process Lic.</span>
          </div>
          <div className="dd-stat">
            <span className="dd-stat-val">{u.incrementalProcessLicensesNeeded || '—'}</span>
            <span className="dd-stat-lbl">Incremental Proc.</span>
          </div>
          <div className="dd-stat">
            <span className="dd-stat-val">{u.additionalPremiumRequired || '—'}</span>
            <span className="dd-stat-lbl">Premium Lic.</span>
          </div>
        </div>

        {/* Frequency insight */}
        {(() => {
          if (isPerFlow) {
            // Per-flow frequency insight: threshold is 250K
            const daysOverEntitlement = u.daysOverPremium; // reused field for >250k days
            const canDowngrade = u.peakDailyRequests <= PREMIUM_CAPACITY;
            const freqOver = u.totalDays > 0 ? (daysOverEntitlement / u.totalDays) * 100 : 0;

            if (canDowngrade && daysOverEntitlement === 0 && u.compliant) {
              return (
                <div className="dd-insight dd-insight-downgrade">
                  <div className="dd-insight-icon">⬇️</div>
                  <div>
                    <strong>Downgrade Opportunity</strong>
                    <p>This flow's peak daily usage ({u.peakDailyRequests.toLocaleString()} req) never exceeds <strong>40k/day</strong>. A <strong>Premium license</strong> (40k/day capacity) would cover this flow at lower cost than the current Per Flow Process license (250k/day).</p>
                  </div>
                </div>
              );
            }

            if (daysOverEntitlement === 0 && u.compliant) return null;

            return (
              <div className="dd-insight">
                <div className="dd-insight-icon">💡</div>
                <div>
                  <strong>Frequency Analysis</strong>
                  {daysOverEntitlement > 0 && (
                    <p>Exceeded 250k/day on <strong>{daysOverEntitlement}</strong> of <strong>{u.totalDays}</strong> days ({freqOver.toFixed(0)}%).
                      {freqOver < 10 && ' Occasional spike — review before adding Process licenses.'}
                      {freqOver >= 10 && freqOver < 40 && ' Moderate pattern — additional Process license may be needed.'}
                      {freqOver >= 40 && ' Recurring — additional Process licenses recommended.'}
                    </p>
                  )}
                  {!u.compliant && (
                    <p className="dd-insight-nuance">⚠️ <em>This flow exceeds its 250k/day Per Flow entitlement. Additional Process licenses are needed.</em></p>
                  )}
                </div>
              </div>
            );
          }

          // Per-user frequency insight (original logic)
          const hasPremiumEntitlement = u.maxEntitledQuantity >= PREMIUM_CAPACITY;
          const noLicense = u.maxEntitledQuantity === 0;
          const freqPrem = u.totalDays > 0 ? (u.daysOverPremium / u.totalDays) * 100 : 0;
          const freqStd = u.totalDays > 0 ? (u.daysOverStandard / u.totalDays) * 100 : 0;
          const isOccasionalPremium = u.recommendation === 'Premium' && u.daysOverStandard <= 2;
          const isOccasionalProcess = u.recommendation === 'Process' && u.daysOverPremium <= 2;

          if (!noLicense && u.daysOverPremium === 0 && (hasPremiumEntitlement || u.daysOverStandard === 0)) return null;

          return (
            <div className="dd-insight">
              <div className="dd-insight-icon">💡</div>
              <div>
                <strong>Frequency Analysis</strong>
                {noLicense && (
                  <p className="dd-insight-nuance">⚠️ This user has <strong>no entitlement</strong> (0 licensed capacity). All usage is unlicensed — assign an M365, Power Apps, Power Automate, or Dynamics 365 license.</p>
                )}
                {!hasPremiumEntitlement && u.daysOverStandard > 0 && (
                  <p>Exceeded 8k/day on <strong>{u.daysOverStandard}</strong> of <strong>{u.totalDays}</strong> days ({freqStd.toFixed(0)}%).
                    {freqStd < 10 && ' Occasional spike — consider monitoring before upgrading.'}
                    {freqStd >= 10 && freqStd < 40 && ' Moderate pattern.'}
                    {freqStd >= 40 && ' Recurring pattern — Premium upgrade recommended.'}
                  </p>
                )}
                {u.daysOverPremium > 0 && (
                  <p>Exceeded 40k/day on <strong>{u.daysOverPremium}</strong> of <strong>{u.totalDays}</strong> days ({freqPrem.toFixed(0)}%).
                    {freqPrem < 10 && ' Occasional spike — review business context before requiring Process licenses.'}
                    {freqPrem >= 10 && freqPrem < 40 && ' Moderate pattern.'}
                    {freqPrem >= 40 && ' Process license usage is recurring.'}
                  </p>
                )}
                {(isOccasionalPremium || isOccasionalProcess) && (
                  <p className="dd-insight-nuance">⚠️ <em>Recommendation is based on peak day only. Low frequency suggests this may be a one-off event, not a structural need.</em></p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Trend chart */}
        <div className="dd-section">
          <h3 className="dd-section-title">Daily Request Trend</h3>
          <div className="dd-legend">
            {isPerFlow ? (
              <>
                <span className="legend-item" style={{ color: '#58a6ff' }}>■ Downgrade candidate (≤40k)</span>
                <span className="legend-item legend-ok">■ Compliant (40k–250k)</span>
                <span className="legend-item legend-proc">■ Needs Process (&gt;250k)</span>
                <span className="legend-item" style={{ color: '#58a6ff' }}>┄ 40k Premium threshold</span>
              </>
            ) : hasNoLicense ? (
              <>
                <span className="legend-item legend-no-license">■ No License (all usage)</span>
                <span className="legend-item" style={{ color: '#d29922', opacity: 0.7 }}>┄ 8k reference</span>
                <span className="legend-item" style={{ color: '#da3633' }}>┄ 40k reference</span>
              </>
            ) : (
              <>
                <span className="legend-item legend-ok">■ Compliant (≤{fmt(u.maxEntitledQuantity)})</span>
                {!hasPremium && (
                  <span className="legend-item legend-prem">■ Needs Premium ({fmt(u.maxEntitledQuantity)}–40k)</span>
                )}
                <span className="legend-item legend-proc">■ Needs Process (&gt;{hasPremium ? fmt(u.maxEntitledQuantity) : '40k'})</span>
              </>
            )}
          </div>
          <div className="trend-chart-wrap">
            <TrendChart data={data} fileType={fileType} />
          </div>
        </div>

        {/* Heat matrix: dates as rows, environments as columns */}
        <div className="dd-section">
          <h3 className="dd-section-title">Consumption Matrix — Date × Environment</h3>

          {/* Legend: environment codes */}
          <div className="matrix-legend">
            {allEnvs.map((env, i) => (
              <div key={i} className="matrix-legend-item">
                <span className="matrix-legend-code">E{i + 1}</span>
                <span className="matrix-legend-name" title={env}>{env}</span>
              </div>
            ))}
          </div>

          <p className="dd-section-sub">
            {isPerFlow
              ? <>Color: � ≤40k (downgrade candidate) &nbsp; 🟢 40k–250k (compliant) &nbsp; 🔴 &gt;250k (needs additional process). Hover for exact count.</>
              : hasNoLicense
              ? <>Color: ⚪ All usage unlicensed. Hover for exact count.</>
              : hasPremium
                ? <>Color: 🟢 ≤{fmt(u.maxEntitledQuantity)} (compliant) &nbsp; 🔴 &gt;{fmt(u.maxEntitledQuantity)} (needs process). Hover for exact count.</>
                : <>Color: 🟢 ≤{fmt(u.maxEntitledQuantity)} &nbsp; 🟡 {fmt(u.maxEntitledQuantity)}–40k &nbsp; 🔴 &gt;40k. Hover for exact count.</>
            }
          </p>

          <div className="matrix-scroll">
            <table className="heat-matrix">
              <thead>
                <tr>
                  <th className="matrix-date-row-header">Date</th>
                  <th className="matrix-date-row-header num">Total</th>
                  {allEnvs.map((env, i) => (
                    <th key={i} className="matrix-env-col-header" title={env}>E{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allDates.map(date => {
                  const total = data.dailyTotal.find(d => d.date === date)?.requests ?? 0;
                  return (
                    <tr key={date}>
                      <td className="matrix-date-label">{date.slice(5)}</td>
                      <td className="num" style={{
                        background: cellColor(total, u.maxEntitledQuantity, isPerFlow),
                        color: 'rgba(255,255,255,0.9)',
                        fontWeight: 600,
                        padding: '4px 8px'
                      }}>{fmt(total)}</td>
                      {allEnvs.map((env, i) => {
                        const req = matrix[env]?.[date] ?? 0;
                        return (
                          <td
                            key={i}
                            className="matrix-cell"
                            style={{ background: cellColor(req, u.maxEntitledQuantity, isPerFlow) }}
                            title={`${env} / ${date}: ${req.toLocaleString()} requests`}
                          >
                            {req > 0 ? fmt(req) : ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
