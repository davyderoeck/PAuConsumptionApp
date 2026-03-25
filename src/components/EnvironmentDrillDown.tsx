import { useEffect, useRef } from 'react';
import type { EnvironmentSummary, FileType } from '../types';
import { STANDARD_CAPACITY, PREMIUM_CAPACITY, PROCESS_CAPACITY_UNIT } from '../types';

interface EnvironmentDrillDownProps {
  env: EnvironmentSummary;
  onClose: () => void;
  fileType: FileType;
}

const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : String(n);

function EnvTrendChart({ env, isPerFlow }: { env: EnvironmentSummary; isPerFlow: boolean }) {
  const { dailyTotal } = env;
  if (dailyTotal.length === 0) return null;

  const width = 640, height = 160;
  const padL = 52, padR = 12, padT = 12, padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const maxVal = Math.max(...dailyTotal.map(d => d.requests), isPerFlow ? PROCESS_CAPACITY_UNIT * 1.1 : PREMIUM_CAPACITY * 1.1);
  const scaleY = (v: number) => padT + chartH - (v / maxVal) * chartH;
  const scaleX = (i: number) => padL + (i / Math.max(dailyTotal.length - 1, 1)) * chartW;
  const points = dailyTotal.map((d, i) => `${scaleX(i)},${scaleY(d.requests)}`).join(' ');

  const yStd = scaleY(STANDARD_CAPACITY);
  const yPrem = scaleY(PREMIUM_CAPACITY);
  const yProcess = scaleY(PROCESS_CAPACITY_UNIT);

  const labelIdxs = dailyTotal.length <= 7
    ? dailyTotal.map((_, i) => i)
    : [0, Math.floor((dailyTotal.length - 1) / 2), dailyTotal.length - 1];

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="trend-svg" preserveAspectRatio="none">
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="var(--border)" strokeWidth={1} />
      <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke="var(--border)" strokeWidth={1} />

      {isPerFlow ? (
        <>
          {/* 250K entitlement line (green) */}
          <line x1={padL} y1={yProcess} x2={padL + chartW} y2={yProcess} stroke="#3fb950" strokeWidth={1.5} strokeDasharray="6 3" />
          <text x={padL - 4} y={yProcess + 4} textAnchor="end" fontSize="9" fill="#3fb950">250k</text>
          {/* 40K downgrade line (blue) */}
          <line x1={padL} y1={yPrem} x2={padL + chartW} y2={yPrem} stroke="#58a6ff" strokeWidth={1.5} strokeDasharray="5 3" />
          <text x={padL - 4} y={yPrem + 4} textAnchor="end" fontSize="9" fill="#58a6ff">40k</text>
        </>
      ) : (
        <>
          <line x1={padL} y1={yStd} x2={padL + chartW} y2={yStd} stroke="#d29922" strokeWidth={1} strokeDasharray="4 3" />
          <text x={padL - 4} y={yStd + 4} textAnchor="end" fontSize="9" fill="#d29922">8k</text>
          <line x1={padL} y1={yPrem} x2={padL + chartW} y2={yPrem} stroke="#da3633" strokeWidth={1} strokeDasharray="4 3" />
          <text x={padL - 4} y={yPrem + 4} textAnchor="end" fontSize="9" fill="#da3633">40k</text>
        </>
      )}

      <polygon points={`${padL},${padT + chartH} ${points} ${scaleX(dailyTotal.length - 1)},${padT + chartH}`} fill="rgba(47,129,247,0.15)" />
      <polyline points={points} fill="none" stroke="#2f81f7" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {dailyTotal.map((d, i) => {
        let dotFill: string;
        if (isPerFlow) {
          dotFill = d.requests > PROCESS_CAPACITY_UNIT ? '#da3633'
            : d.requests <= PREMIUM_CAPACITY ? '#58a6ff'
            : '#3fb950';
        } else {
          dotFill = d.requests > PREMIUM_CAPACITY ? '#da3633'
            : d.requests > STANDARD_CAPACITY ? '#d29922'
            : '#2f81f7';
        }
        return (
          <circle key={i} cx={scaleX(i)} cy={scaleY(d.requests)} r={3}
            fill={dotFill}
            stroke="var(--panel)" strokeWidth={1}>
            <title>{d.date}: {d.requests.toLocaleString()} requests ({d.usersActive} {isPerFlow ? 'flows' : 'users'})</title>
          </circle>
        );
      })}
      {labelIdxs.map(i => (
        <text key={i} x={scaleX(i)} y={height - 6} textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          {dailyTotal[i].date.slice(5)}
        </text>
      ))}
    </svg>
  );
}

export default function EnvironmentDrillDown({ env, onClose, fileType }: EnvironmentDrillDownProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const isPerFlow = fileType === 'per-flow';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const nonCompliant = env.usersNeedingProcess;
  const pct = env.totalUsers > 0 ? ((env.usersCompliant / env.totalUsers) * 100).toFixed(1) : '100';
  const entityLabel = isPerFlow ? 'flows' : 'users';

  return (
    <div className="dd-overlay" ref={overlayRef} onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="dd-panel">
        <div className="dd-header">
          <div>
            <div className="dd-title">
              <span style={{ fontWeight: 700, fontSize: '1em' }}>🏢 {env.environmentName}</span>
            </div>
            <div className="dd-meta">
              {env.totalUsers} {entityLabel} &nbsp;·&nbsp; {nonCompliant} exceeding entitlement &nbsp;·&nbsp;
              Peak: <strong>{env.peakDailyRequests.toLocaleString()}</strong> req on {env.peakDate}
            </div>
          </div>
          <button className="dd-close" onClick={onClose}>✕</button>
        </div>

        <div className="dd-stats">
          <div className="dd-stat">
            <span className="dd-stat-val">{env.totalUsers}</span>
            <span className="dd-stat-lbl">Total {isPerFlow ? 'Flows' : 'Users'}</span>
          </div>
          <div className="dd-stat">
            <span className="dd-stat-val" style={{ color: 'var(--green)' }}>{env.usersCompliant}</span>
            <span className="dd-stat-lbl">Compliant</span>
          </div>
          {isPerFlow ? (
            <>
              <div className="dd-stat">
                <span className="dd-stat-val" style={{ color: '#58a6ff' }}>{env.flowsDowngradeable}</span>
                <span className="dd-stat-lbl">Downgrade</span>
              </div>
              <div className="dd-stat">
                <span className="dd-stat-val" style={{ color: env.usersNeedingProcess > 0 ? 'var(--red)' : 'var(--green)' }}>{env.usersNeedingProcess}</span>
                <span className="dd-stat-lbl">&gt;250k Peak</span>
              </div>
            </>
          ) : (
            <>
              <div className="dd-stat">
                <span className="dd-stat-val" style={{ color: 'var(--amber)' }}>{env.usersMissingPremium}</span>
                <span className="dd-stat-lbl">Need Premium</span>
              </div>
              <div className="dd-stat">
                <span className="dd-stat-val" style={{ color: 'var(--red)' }}>{env.usersNeedingProcess}</span>
                <span className="dd-stat-lbl">Need Process</span>
              </div>
            </>
          )}
          <div className="dd-stat">
            <span className="dd-stat-val">{pct}%</span>
            <span className="dd-stat-lbl">Compliant</span>
          </div>
          <div className="dd-stat">
            <span className="dd-stat-val">{fmt(env.totalRequests)}</span>
            <span className="dd-stat-lbl">Total Req</span>
          </div>
        </div>

        <div className="dd-section">
          <h3 className="dd-section-title">Daily Request Trend (Environment Total)</h3>
          <div className="trend-chart-wrap">
            <EnvTrendChart env={env} isPerFlow={isPerFlow} />
          </div>
        </div>

        <div className="dd-section">
          <h3 className="dd-section-title">Daily Activity</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Total Requests</th>
                  <th className="num">Active {isPerFlow ? 'Flows' : 'Users'}</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {env.dailyTotal.map(d => {
                  let rowClass = '';
                  let badge: React.ReactNode;

                  if (isPerFlow) {
                    if (d.requests > PROCESS_CAPACITY_UNIT) {
                      rowClass = 'row-non-compliant';
                      badge = <span className="badge badge-process">Over 250k</span>;
                    } else if (d.requests <= PREMIUM_CAPACITY) {
                      rowClass = 'row-downgrade';
                      badge = <span className="badge badge-downgrade">≤40k Downgrade</span>;
                    } else {
                      badge = <span className="badge badge-covered">Compliant</span>;
                    }
                  } else {
                    if (d.requests > PREMIUM_CAPACITY) {
                      rowClass = 'row-non-compliant';
                      badge = <span className="badge badge-process">Process Threshold</span>;
                    } else if (d.requests > STANDARD_CAPACITY) {
                      rowClass = 'row-warning';
                      badge = <span className="badge badge-premium">Premium Threshold</span>;
                    } else {
                      badge = <span className="badge badge-covered">Normal</span>;
                    }
                  }

                  return (
                    <tr key={d.date} className={rowClass}>
                      <td>{d.date}</td>
                      <td className="num">{d.requests.toLocaleString()}</td>
                      <td className="num">{d.usersActive}</td>
                      <td>{badge}</td>
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
