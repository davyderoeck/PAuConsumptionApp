import { useState } from 'react';
import type { EnvironmentSummary, FileType } from '../types';

interface EnvironmentViewProps {
  environments: EnvironmentSummary[];
  onSelectEnv: (env: EnvironmentSummary) => void;
  fileType: FileType;
}

// Shared mini trend chart for environment
function EnvTrendChart({ env }: { env: EnvironmentSummary }) {
  const { dailyTotal } = env;
  if (dailyTotal.length === 0) return null;

  const width = 200, height = 50;
  const padL = 4, padR = 4, padT = 4, padB = 4;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxVal = Math.max(...dailyTotal.map(d => d.requests), 1);
  const scaleY = (v: number) => padT + chartH - (v / maxVal) * chartH;
  const scaleX = (i: number) => padL + (i / Math.max(dailyTotal.length - 1, 1)) * chartW;
  const points = dailyTotal.map((d, i) => `${scaleX(i)},${scaleY(d.requests)}`).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polygon
        points={`${padL},${padT + chartH} ${points} ${scaleX(dailyTotal.length - 1)},${padT + chartH}`}
        fill="rgba(47,129,247,0.2)"
      />
      <polyline points={points} fill="none" stroke="#2f81f7" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export default function EnvironmentView({ environments, onSelectEnv, fileType }: EnvironmentViewProps) {
  const isPerFlow = fileType === 'per-flow';
  const entityLabel = isPerFlow ? 'Flows' : 'Users';
  const [search, setSearch] = useState('');

  const filtered = environments.filter(e =>
    e.environmentName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="env-view-section">
      <div className="env-view-header">
        <h2>🏢 Environment Overview</h2>
        <input
          type="text"
          placeholder="Filter environments..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
          style={{ maxWidth: 260 }}
        />
      </div>

      <div className="env-cards-grid">
        {filtered.map(env => {
          const nonCompliant = env.usersNeedingProcess;  // only truly non-compliant (>250K for flow, >40K for user)
          const pct = env.totalUsers > 0 ? ((env.usersCompliant / env.totalUsers) * 100) : 100;

          let statusColor: string;
          if (isPerFlow) {
            statusColor = env.usersNeedingProcess > 0 ? 'var(--red)'
              : env.flowsDowngradeable > 0 ? '#58a6ff'
              : 'var(--green)';
          } else {
            statusColor = env.usersNeedingProcess > 0 ? 'var(--red)'
              : env.usersMissingPremium > 0 ? 'var(--amber)'
              : 'var(--green)';
          }

          return (
            <div
              key={env.environmentName}
              className="env-card"
              onClick={() => onSelectEnv(env)}
              title="Click to drill into environment"
            >
              <div className="env-card-header">
                <span className="env-name" title={env.environmentName}>{env.environmentName}</span>
                <span className="env-status-dot" style={{ background: statusColor }} />
              </div>

              <div className="env-card-stats">
                <div className="env-stat">
                  <span className="env-stat-val">{env.totalUsers}</span>
                  <span className="env-stat-lbl">{entityLabel}</span>
                </div>
                {isPerFlow ? (
                  <>
                    <div className="env-stat">
                      <span className="env-stat-val" style={{ color: '#58a6ff' }}>{env.flowsDowngradeable}</span>
                      <span className="env-stat-lbl">Downgrade</span>
                    </div>
                    <div className="env-stat">
                      <span className="env-stat-val" style={{ color: nonCompliant > 0 ? 'var(--red)' : 'var(--green)' }}>{nonCompliant}</span>
                      <span className="env-stat-lbl">&gt;250k Peak</span>
                    </div>
                  </>
                ) : (
                  <div className="env-stat">
                    <span className="env-stat-val" style={{ color: statusColor }}>{nonCompliant + env.usersMissingPremium}</span>
                    <span className="env-stat-lbl">Non-Compliant</span>
                  </div>
                )}
                <div className="env-stat">
                  <span className="env-stat-val">{(env.totalRequests / 1000).toFixed(0)}k</span>
                  <span className="env-stat-lbl">Total Req</span>
                </div>
              </div>

              {/* Compliance bar */}
              <div className="env-compliance-bar-wrap">
                <div className="env-compliance-bar">
                  {isPerFlow ? (
                    <>
                      <div style={{ width: `${env.totalUsers > 0 ? ((env.flowsDowngradeable / env.totalUsers) * 100) : 0}%`, background: '#58a6ff', height: '100%', borderRadius: 3 }} />
                      <div style={{ width: `${env.totalUsers > 0 ? (((env.usersCompliant - env.flowsDowngradeable) / env.totalUsers) * 100) : 0}%`, background: 'var(--green)', height: '100%' }} />
                      <div style={{ width: `${env.totalUsers > 0 ? ((env.usersNeedingProcess / env.totalUsers) * 100) : 0}%`, background: 'var(--red)', height: '100%', borderRadius: '0 3px 3px 0' }} />
                    </>
                  ) : (
                    <>
                      <div style={{ width: `${pct}%`, background: 'var(--green)', height: '100%', borderRadius: 3 }} />
                      <div style={{ width: `${((env.usersMissingPremium / env.totalUsers) * 100)}%`, background: 'var(--amber)', height: '100%' }} />
                      <div style={{ width: `${((env.usersNeedingProcess / env.totalUsers) * 100)}%`, background: 'var(--red)', height: '100%', borderRadius: '0 3px 3px 0' }} />
                    </>
                  )}
                </div>
                <span className="env-compliance-pct">
                  {isPerFlow
                    ? `${pct.toFixed(0)}% compliant · ${env.flowsDowngradeable} downgrade candidate${env.flowsDowngradeable !== 1 ? 's' : ''}`
                    : `${pct.toFixed(0)}% compliant`
                  }
                </span>
              </div>

              {/* Mini trend */}
              <div className="env-mini-trend">
                <EnvTrendChart env={env} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
