import type { ClassifiedUser, FileType, NonLicensedTenantAnalysis, SellerSummary } from '../types';
import { REQUEST_ADDON_CAPACITY } from '../types';
import { exportSummaryOverview } from '../utils/reportGenerator';

interface SummaryDashboardProps {
  summary: SellerSummary;
  users: ClassifiedUser[];
  patternFilter: string[];
  onSelectPattern: (pattern: string, multi: boolean) => void;
  fileType: FileType;
  premiumPrice: number;
  processPrice: number;
  currency: string;
  tenantEntitlement?: number;
  nonLicensedAnalysis?: NonLicensedTenantAnalysis | null;
}

type PatternKey = 'License recommended' | 'Moderate pattern' | 'Occasional spike' | 'Monitor first' | 'Compliant' | 'Downgrade candidate';

const PATTERN_ORDER: PatternKey[] = ['License recommended', 'Moderate pattern', 'Occasional spike', 'Monitor first', 'Downgrade candidate', 'Compliant'];
const PATTERN_LABEL: Record<PatternKey, string> = {
  'License recommended': '📋 License Recommended',
  'Moderate pattern':    '📊 Moderate Pattern',
  'Occasional spike':    '⚡ Occasional Spike',
  'Monitor first':       '👁 Monitor First',
  'Downgrade candidate': '⬇️ Downgrade Candidate',
  'Compliant':           '✅ Compliant',
};
const PATTERN_CLASS: Record<PatternKey, string> = {
  'License recommended': 'pat-high',
  'Moderate pattern':    'pat-medium',
  'Occasional spike':    'pat-low',
  'Monitor first':       'pat-low',
  'Downgrade candidate': 'pat-downgrade',
  'Compliant':           'pat-ok',
};

export default function SummaryDashboard({ summary: s, users, patternFilter, onSelectPattern, fileType, premiumPrice, processPrice, currency, nonLicensedAnalysis }: SummaryDashboardProps) {
  const isPerFlow = fileType === 'per-flow';
  const entityLabel = isPerFlow ? 'Flows' : fileType === 'non-licensed' ? 'Callers' : 'Users';
  const complianceRate = s.usersAnalyzed > 0
    ? ((s.compliantUsers / s.usersAnalyzed) * 100).toFixed(1)
    : '0';

  const pPrem = premiumPrice;
  const pProc = processPrice;
  const fmtCur = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtNum = (n: number) => n.toLocaleString();

  const nl = nonLicensedAnalysis;

  // ── Pool gauge data (non-licensed) ──────────────────────────────────────
  const poolRawPct    = nl && nl.tenantPool > 0 ? nl.peakTenantRequests / nl.tenantPool : 0;
  const isOverrunGauge = nl ? nl.overrun > 0 : false;
  const poolFillClr   = isOverrunGauge ? '#da3633' : poolRawPct > 0.8 ? '#d29922' : '#3fb950';
  const barGreenPct   = isOverrunGauge && nl ? (nl.tenantPool  / nl.peakTenantRequests) * 100 : Math.min(poolRawPct * 100, 100);
  const barRedPct     = isOverrunGauge && nl ? (nl.overrun     / nl.peakTenantRequests) * 100 : 0;

  // Build per-pattern breakdown
  const byPattern: Record<PatternKey, ClassifiedUser[]> = {
    'License recommended': [],
    'Moderate pattern':    [],
    'Occasional spike':    [],
    'Monitor first':       [],
    'Downgrade candidate': [],
    'Compliant':           [],
  };

  for (const u of users) {
    const key = (u.frequencyLabel as PatternKey) || 'Compliant';
    if (byPattern[key]) byPattern[key].push(u);
    else byPattern['Compliant'].push(u);
  }

  const rowData = PATTERN_ORDER.map(key => {
    const group = byPattern[key];
    const premLic = group.reduce((s, u) => s + u.additionalPremiumRequired, 0);
    const procLic = group.reduce((s, u) => s + u.totalProcessLicensesRequired, 0);
    const monthly = premLic * pPrem + procLic * pProc;
    return { key, group, premLic, procLic, monthly };
  }).filter(r => r.group.length > 0);

  const totPremLic = rowData.reduce((s, r) => s + r.premLic, 0);
  const totProcLic = rowData.reduce((s, r) => s + r.procLic, 0);
  const totMonthly = rowData.reduce((s, r) => s + r.monthly, 0);
  const liveAnnualOpp = totMonthly * 12;

  return (
    <div className="summary-dashboard">
      <div className="summary-top">
        <div>
          <h2>📊 Analysis Summary</h2>
          <p className="date-range">Period: {s.dateRange}</p>

        </div>
        <div className="summary-top-actions">
          <button className="btn-export-small"
            onClick={() => exportSummaryOverview(s, users, pPrem, pProc, currency)}
            title="Export summary overview to Excel">
            📥 Export Summary
          </button>
        </div>
        <div className="summary-kpis">
          <div className="kpi-pill">
            <span className="kpi-val">{s.usersAnalyzed.toLocaleString()}</span>
            <span className="kpi-lbl">{entityLabel}</span>
          </div>
          <div className="kpi-pill kpi-green">
            <span className="kpi-val">{complianceRate}%</span>
            <span className="kpi-lbl">Compliant</span>
          </div>
          <div className="kpi-pill kpi-amber">
            <span className="kpi-val">{isPerFlow
              ? users.filter(u => u.recommendation === 'Downgrade to Premium').length
              : s.usersMissingPremium
            }</span>
            <span className="kpi-lbl">{isPerFlow ? 'Can Downgrade' : 'Need Premium'}</span>
          </div>
          <div className="kpi-pill kpi-red">
            <span className="kpi-val">{s.usersNeedingProcessLicenses}</span>
            <span className="kpi-lbl">Need Process</span>
          </div>
          <div className="kpi-pill kpi-accent">
            <span className="kpi-val">{fmtCur(liveAnnualOpp)}</span>
            <span className="kpi-lbl">Annual Opp.</span>
          </div>
        </div>
      </div>

      {/* ── Tenant pool gauge banner ── */}
      {fileType === 'non-licensed' && nl && nl.tenantPool > 0 && (
        <div className={`pool-gauge-banner ${nl.overrun > 0 ? 'pool-gauge-overrun' : poolRawPct > 0.8 ? 'pool-gauge-warning' : 'pool-gauge-ok'}`}>
          {/* Big percentage */}
          <div className="pool-gauge-pct" style={{ color: poolFillClr }}>
            {`${(poolRawPct * 100).toFixed(1)}%`}
            <span className="pool-gauge-pct-lbl">of pool used</span>
          </div>

          <div className="pool-gauge-info">
            <div className="pool-gauge-title">🏢 Tenant Pool Health</div>
            <div className="pool-gauge-status" style={{ color: poolFillClr }}>
              {nl.overrun > 0
                ? `⚠️ Pool exceeded — overrun of ${fmtNum(nl.overrun)} req/day`
                : `✅ Compliant — peak usage within entitled pool`}
            </div>

            <div className="pool-gauge-numbers">
              <div className="pool-gauge-num">
                <span className="pool-gauge-big" style={{ color: poolFillClr }}>{fmtNum(nl.peakTenantRequests)}</span>
                <span className="pool-gauge-lbl">Peak req/day ({nl.peakTenantDay})</span>
              </div>
              <div className="pool-gauge-sep">vs</div>
              <div className="pool-gauge-num">
                <span className="pool-gauge-big">{fmtNum(nl.tenantPool)}</span>
                <span className="pool-gauge-lbl">Entitled req/day</span>
              </div>
            </div>

            {/* Horizontal bar */}
            <div className="pool-gauge-bar">
              <div className="pool-gauge-fill" style={{ width: `${barGreenPct}%`, background: '#3fb950', borderRadius: isOverrunGauge ? '4px 0 0 4px' : 4 }} />
              {isOverrunGauge && barRedPct > 0 && (
                <div className="pool-gauge-fill" style={{ width: `${barRedPct}%`, background: '#da3633', borderRadius: '0 4px 4px 0' }} />
              )}
            </div>
            <div className="pool-gauge-bar-labels">
              <span style={{ color: '#3fb950' }}>✓ Entitled: {fmtNum(nl.tenantPool)}</span>
              {nl.overrun === 0 && <span>Free: {fmtNum(nl.tenantPool - nl.peakTenantRequests)}</span>}
              {nl.overrun > 0 && <span style={{ color: '#da3633' }}>▲ Overrun: +{fmtNum(nl.overrun)}</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── Non-licensed tenant pool analysis ── */}
      {fileType === 'non-licensed' && nl && (
        <div className="breakdown-section" style={{ marginTop: 16 }}>
          <h3>🏢 Tenant Pool Analysis</h3>

          {/* KPI row */}
          <div className="summary-kpis" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="kpi-pill">
              <span className="kpi-val">{fmtNum(nl.tenantPool)}</span>
              <span className="kpi-lbl">Pool / day</span>
            </div>
            <div className={`kpi-pill ${nl.peakTenantRequests > nl.tenantPool ? 'kpi-red' : 'kpi-green'}`}>
              <span className="kpi-val">{fmtNum(nl.peakTenantRequests)}</span>
              <span className="kpi-lbl">Peak Day</span>
            </div>
            <div className={`kpi-pill ${nl.overrun > 0 ? 'kpi-red' : 'kpi-green'}`}>
              <span className="kpi-val">{nl.overrun > 0 ? `+${fmtNum(nl.overrun)}` : '✓ 0'}</span>
              <span className="kpi-lbl">Daily Overrun</span>
            </div>
            {nl.overrun > 0 && (
              <div className="kpi-pill kpi-amber">
                <span className="kpi-val">{nl.addonsNeeded}</span>
                <span className="kpi-lbl">Add-ons needed</span>
              </div>
            )}
            {nl.overrun > 0 && nl.addonCostMonthly > 0 && (
              <div className="kpi-pill kpi-accent">
                <span className="kpi-val">{fmtCur(nl.addonCostMonthly)}/mo</span>
                <span className="kpi-lbl">Add-on cost</span>
              </div>
            )}
          </div>

          {/* Pool utilisation bar */}
          {nl.tenantPool > 0 && (
            <div style={{ margin: '0 0 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78em', color: 'var(--text-muted)', marginBottom: 3 }}>
                <span>Peak day utilisation  —  {nl.peakTenantDay}</span>
                <span>{Math.round((nl.peakTenantRequests / nl.tenantPool) * 100)}% of pool</span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: 'var(--border)', overflow: 'visible', position: 'relative' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min((nl.peakTenantRequests / Math.max(nl.peakTenantRequests, nl.tenantPool)) * 100, 100)}%`,
                  background: nl.overrun > 0 ? 'var(--red)' : nl.peakTenantRequests / nl.tenantPool > 0.8 ? 'var(--amber)' : 'var(--green)',
                  borderRadius: 5,
                }} />
                {/* Pool cap marker */}
                {nl.overrun === 0 && (
                  <div style={{
                    position: 'absolute', top: -3, bottom: -3,
                    left: `${(nl.tenantPool / Math.max(nl.peakTenantRequests, nl.tenantPool)) * 100}%`,
                    width: 2, background: 'var(--text-muted)', borderRadius: 1,
                  }} />
                )}
              </div>
              {nl.overrun > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: '0.75em', color: 'var(--red)' }}>
                  <span>▲ Overrun: +{fmtNum(nl.overrun)} req/day above pool cap ({fmtNum(nl.tenantPool)})</span>
                </div>
              )}
            </div>
          )}

          {/* ── Overrun remediation options ── */}
          {nl.overrun > 0 && (
            <>
              <h4 style={{ margin: '4px 0 10px', fontSize: '0.85em', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Remediation Options
              </h4>
              <div className="breakdown-scroll">
                <table className="breakdown-table">
                  <thead>
                    <tr>
                      <th>Option</th>
                      <th className="num">Units</th>
                      <th className="num">Capacity</th>
                      <th className="num">Monthly cost</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>A — PP Request Add-ons</strong></td>
                      <td className="num">{nl.addonsNeeded}</td>
                      <td className="num">+{fmtNum(nl.addonsNeeded * REQUEST_ADDON_CAPACITY)} req/day</td>
                      <td className="num">
                        {nl.addonCostMonthly > 0
                          ? <strong>{fmtCur(nl.addonCostMonthly)}</strong>
                          : <em style={{ color: 'var(--text-muted)' }}>Set price in ⚙️</em>}
                      </td>
                      <td style={{ fontSize: '0.82em', color: 'var(--text-muted)' }}>
                        Expands shared tenant pool; benefits all non-licensed callers
                      </td>
                    </tr>
                    <tr>
                      <td><strong>B — Process Licenses</strong> (top callers)</td>
                      <td className="num">varies</td>
                      <td className="num">250k req/day each</td>
                      <td className="num"><em style={{ color: 'var(--text-muted)' }}>See below</em></td>
                      <td style={{ fontSize: '0.82em', color: 'var(--text-muted)' }}>
                        Removes flow from shared pool; environment-specific; best for high-volume SPs
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Top callers table ── */}
          {nl.topCallers.length > 0 && (
            <>
              <h4 style={{ margin: '14px 0 6px', fontSize: '0.85em', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Top Callers {nl.overrun > 0 ? '— Process License Candidates' : ''}
              </h4>
              <div className="breakdown-scroll">
                <table className="breakdown-table">
                  <thead>
                    <tr>
                      <th>Caller ID</th>
                      <th>Type</th>
                      <th className="num">Peak Daily</th>
                      <th className="num">Total Requests</th>
                      <th className="num">% of Pool</th>
                      {nl.overrun > 0 && <th className="num">Process Lic.</th>}
                      {nl.overrun > 0 && pProc > 0 && <th className="num">Cost/mo</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {nl.topCallers.map(c => {
                      const licNeeded = Math.ceil(c.peakDailyRequests / 250_000);
                      const cost = licNeeded * pProc;
                      return (
                        <tr key={c.callerId}>
                          <td className="caller-cell" title={c.callerId}>{c.callerId}</td>
                          <td style={{ fontSize: '0.82em', color: 'var(--text-muted)' }}>{c.callerType ?? '—'}</td>
                          <td className="num">{fmtNum(c.peakDailyRequests)}</td>
                          <td className="num">{fmtNum(c.totalRequests)}</td>
                          <td className="num">
                            {nl.tenantPool > 0
                              ? `${((c.peakDailyRequests / nl.tenantPool) * 100).toFixed(1)}%`
                              : '—'}
                          </td>
                          {nl.overrun > 0 && <td className="num">{licNeeded}</td>}
                          {nl.overrun > 0 && pProc > 0 && <td className="num">{cost > 0 ? fmtCur(cost) : '—'}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {nl.overrun > 0 && (
                <p className="settings-hint" style={{ marginTop: 6 }}>
                  ⚠️ Process licenses are <strong>environment-specific</strong>. A flow calling across multiple environments needs one license per environment.
                  The table above shows peak usage across all environments; open the Callers view for per-environment detail.
                </p>
              )}
            </>
          )}

          {/* Edge cases */}
          {nl.overrun === 0 && nl.tenantPool > 0 && (
            <p style={{ color: 'var(--green)', fontSize: '0.9em', marginTop: 4 }}>
              ✅ Peak usage ({fmtNum(nl.peakTenantRequests)} req/day) is within the {fmtNum(nl.tenantPool)} req/day tenant pool. No remediation needed.
            </p>
          )}
          {nl.tenantPool === 0 && (
            <p style={{ color: 'var(--amber)', fontSize: '0.9em', marginTop: 4 }}>
              ⚠️ Tenant pool entitlement not found in the CSV preamble. Overrun analysis unavailable.
            </p>
          )}
        </div>
      )}

      {/* Compliance × Frequency breakdown table */}
      <div className="breakdown-section">
        <h3>Compliance &amp; Licensing Breakdown by Usage Pattern</h3>
        <div className="breakdown-scroll">
          <table className="breakdown-table">
            <thead>
              <tr>
                <th>Usage Pattern</th>
                <th className="num">{entityLabel}</th>
                <th className="num">Premium Lic.</th>
                <th className="num">
                  Premium Cost/mo
                  <span className="col-sub">@ {fmtCur(pPrem)}/lic</span>
                </th>
                <th className="num">Process Lic.</th>
                <th className="num">
                  Process Cost/mo
                  <span className="col-sub">@ {fmtCur(pProc)}/lic</span>
                </th>
                <th className="num">Monthly Total</th>
                <th className="num">Annual Total</th>
              </tr>
            </thead>
            <tbody>
              {rowData.map(({ key, group, premLic, procLic, monthly }) => {
                const isSelected = patternFilter.includes(key);
                return (
                  <tr
                    key={key}
                    className={`breakdown-row ${PATTERN_CLASS[key]} breakdown-clickable ${isSelected ? 'breakdown-selected' : ''}`}
                    onClick={(e) => onSelectPattern(key, e.ctrlKey || e.metaKey)}
                    title={isSelected ? 'Click to deselect (Ctrl+click to multi-select)' : `Click to filter (Ctrl+click to add to selection)`}
                  >
                    <td>
                      <span className={`pat-badge ${PATTERN_CLASS[key]}`}>{PATTERN_LABEL[key]}</span>
                      {isSelected && <span className="pat-active-indicator"> ▸ filtered</span>}
                    </td>
                    <td className="num">{group.length}</td>
                    <td className="num">{premLic > 0 ? premLic : '—'}</td>
                    <td className="num">{premLic > 0 ? fmtCur(premLic * pPrem) : '—'}</td>
                    <td className="num">{procLic > 0 ? procLic : '—'}</td>
                    <td className="num">{procLic > 0 ? fmtCur(procLic * pProc) : '—'}</td>
                    <td className="num bd-monthly">{monthly > 0 ? fmtCur(monthly) : '—'}</td>
                    <td className="num bd-annual">{monthly > 0 ? fmtCur(monthly * 12) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="breakdown-total">
                <td><strong>Total</strong></td>
                <td className="num"><strong>{s.usersAnalyzed}</strong></td>
                <td className="num"><strong>{totPremLic || '—'}</strong></td>
                <td className="num"><strong>{totPremLic > 0 ? fmtCur(totPremLic * pPrem) : '—'}</strong></td>
                <td className="num"><strong>{totProcLic || '—'}</strong></td>
                <td className="num"><strong>{totProcLic > 0 ? fmtCur(totProcLic * pProc) : '—'}</strong></td>
                <td className="num bd-monthly"><strong>{fmtCur(totMonthly)}</strong></td>
                <td className="num bd-annual"><strong>{fmtCur(totMonthly * 12)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
