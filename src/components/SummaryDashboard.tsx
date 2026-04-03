import type { ClassifiedUser, FileType, NonLicensedTenantAnalysis, SellerSummary } from '../types';
import { REQUEST_ADDON_CAPACITY, D365_POOL_CAP, PROCESS_CAPACITY_UNIT } from '../types';
import { exportSummaryOverview } from '../utils/reportGenerator';

interface SummaryDashboardProps {
  summary: SellerSummary;
  users: ClassifiedUser[];
  patternFilter: string[];
  onSelectPattern: (pattern: string, multi: boolean) => void;
  fileType: FileType;
  premiumPrice: number;
  processPrice: number;
  addonPrice: number;
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

export default function SummaryDashboard({ summary: s, users, patternFilter, onSelectPattern, fileType, premiumPrice, processPrice, addonPrice, currency, nonLicensedAnalysis }: SummaryDashboardProps) {
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
  const fmtPct1 = (n: number) => `${(n * 100).toFixed(0)}%`;

  // ── Day-status grouping for non-licensed breakdown table ──────────────────
  const dayGroups = nl && nl.tenantPool > 0 ? (() => {
    const g = {
      ok:   { days: 0, total: 0, peak: 0 },
      high: { days: 0, total: 0, peak: 0 },
      over: { days: 0, total: 0, peak: 0 },
      cap:  { days: 0, total: 0, peak: 0 },
    };
    for (const day of nl.dailyTotals) {
      const pct = day.requests / nl.tenantPool;
      const key = day.requests > D365_POOL_CAP ? 'cap'
                : day.requests > nl.tenantPool  ? 'over'
                : pct > 0.8                     ? 'high'
                : 'ok';
      g[key].days++;
      g[key].total += day.requests;
      g[key].peak = Math.max(g[key].peak, day.requests);
    }
    return g;
  })() : null;
  const dgAddonCost = (peak: number) => {
    if (!nl || peak <= nl.tenantPool) return 0;
    const overrunForAddons = Math.min(peak, D365_POOL_CAP) - nl.tenantPool;
    return Math.ceil(overrunForAddons / REQUEST_ADDON_CAPACITY) * addonPrice;
  };
  const dgProcessLic = (peak: number) =>
    peak > D365_POOL_CAP ? Math.ceil((peak - D365_POOL_CAP) / PROCESS_CAPACITY_UNIT) : 0;
  const dgProcessCost = (peak: number) => dgProcessLic(peak) * processPrice;

  // ── Pool gauge data (non-licensed) — 3 zones ────────────────────────────
  // Green = entitled pool, Amber = add-on zone (pool → 10M), Red = process zone (above 10M)
  const poolRawPct    = nl && nl.tenantPool > 0 ? nl.peakTenantRequests / nl.tenantPool : 0;
  const isOverrunGauge = nl ? nl.overrun > 0 : false;
  const poolFillClr   = nl?.addonsCapped ? '#da3633' : isOverrunGauge ? '#c18e00' : poolRawPct > 0.8 ? '#d29922' : '#3fb950';
  // 3-zone bar: total width = peak requests (100%)
  const peak = nl ? nl.peakTenantRequests : 0;
  const barGreenPct = peak > 0 ? (Math.min(peak, nl!.tenantPool) / peak) * 100 : 100;
  const barAmberPct = nl && peak > nl.tenantPool && peak > 0
    ? ((Math.min(peak, D365_POOL_CAP) - nl.tenantPool) / peak) * 100
    : 0;
  const barRedPct   = nl && peak > D365_POOL_CAP
    ? ((peak - D365_POOL_CAP) / peak) * 100
    : 0;

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
          {fileType === 'non-licensed' && nl ? (
            /* ── Non-licensed: 4 financial KPIs ── */
            <>
              <div className={`kpi-pill ${nl.overrun > 0 ? 'kpi-amber' : 'kpi-green'}`}>
                <span className="kpi-val">
                  {nl.addonCostMonthly > 0 ? `${fmtCur(nl.addonCostMonthly)}/mo` : nl.overrun > 0 ? 'Set price ⚙️' : '✓ $0'}
                </span>
                <span className="kpi-lbl">Add-on cost{nl.addonsCapped ? ' (max)' : ''}</span>
              </div>
              <div className={`kpi-pill ${nl.addonsCapped ? 'kpi-red' : ''}`}>
                <span className="kpi-val">{nl.processLicensesNeeded > 0 ? nl.processLicensesNeeded : '—'}</span>
                <span className="kpi-lbl">Process lic. needed</span>
              </div>
              <div className={`kpi-pill ${nl.addonsCapped ? 'kpi-red' : ''}`}>
                <span className="kpi-val">
                  {nl.processLicenseCostMonthly > 0
                    ? `${fmtCur(nl.processLicenseCostMonthly)}/mo`
                    : nl.addonsCapped ? 'Set price ⚙️' : '—'}
                </span>
                <span className="kpi-lbl">Process lic. cost</span>
              </div>
              <div className="kpi-pill kpi-accent">
                <span className="kpi-val">
                  {(nl.addonCostMonthly + nl.processLicenseCostMonthly) > 0
                    ? `${fmtCur((nl.addonCostMonthly + nl.processLicenseCostMonthly) * 12)}/yr`
                    : nl.overrun > 0 ? 'Set prices ⚙️' : '✓ $0'}
                </span>
                <span className="kpi-lbl">Total annual cost</span>
              </div>
            </>
          ) : (
            /* ── Per-user / per-flow: compliance KPIs ── */
            <>
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
            </>
          )}
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
              {nl.addonsCapped
                ? `⚠️ Exceeds 10M cap — +${fmtNum(nl.excessAbove10M)} req/day requires Process licenses`
                : nl.overrun > 0
                ? `⚠️ Pool exceeded — +${fmtNum(nl.overrun)} req/day (coverable by add-ons)`
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

            {/* Horizontal 3-zone bar */}
            <div className="pool-gauge-bar">
              <div className="pool-gauge-fill" style={{
                width: `${barGreenPct}%`,
                background: '#3fb950',
                borderRadius: isOverrunGauge ? '4px 0 0 4px' : 4,
              }} />
              {barAmberPct > 0 && (
                <div className="pool-gauge-fill" style={{
                  width: `${barAmberPct}%`,
                  background: '#c18e00',
                  borderRadius: barRedPct > 0 ? 0 : '0 4px 4px 0',
                }} />
              )}
              {barRedPct > 0 && (
                <div className="pool-gauge-fill" style={{
                  width: `${barRedPct}%`,
                  background: '#da3633',
                  borderRadius: '0 4px 4px 0',
                }} />
              )}
            </div>
            <div className="pool-gauge-bar-labels">
              <span style={{ color: '#3fb950' }}>✓ Entitled: {fmtNum(nl.tenantPool)}</span>
              {nl.overrun === 0 && <span>Free: {fmtNum(nl.tenantPool - nl.peakTenantRequests)}</span>}
              {nl.overrun > 0 && !nl.addonsCapped && (
                <span style={{ color: '#c18e00' }}>■ Add-on zone: +{fmtNum(nl.overrun)} (max 10M)</span>
              )}
              {nl.addonsCapped && (
                <span style={{ color: '#c18e00' }}>■ Add-on zone: +{fmtNum(D365_POOL_CAP - nl.tenantPool)} to 10M cap</span>
              )}
              {nl.addonsCapped && (
                <span style={{ color: '#da3633' }}>▲ Process zone: +{fmtNum(nl.excessAbove10M)} above 10M</span>
              )}
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
                <span className="kpi-lbl">Add-ons needed{nl.addonsCapped ? ' (max)' : ''}</span>
              </div>
            )}
            {nl.overrun > 0 && nl.addonCostMonthly > 0 && (
              <div className="kpi-pill kpi-accent">
                <span className="kpi-val">{fmtCur(nl.addonCostMonthly)}/mo</span>
                <span className="kpi-lbl">Add-on cost</span>
              </div>
            )}
            {nl.addonsCapped && (
              <div className="kpi-pill kpi-red">
                <span className="kpi-val">+{fmtNum(nl.excessAbove10M)}</span>
                <span className="kpi-lbl">Above 10M cap</span>
              </div>
            )}
            {nl.addonsCapped && (
              <div className="kpi-pill kpi-red">
                <span className="kpi-val">{nl.processLicensesNeeded}</span>
                <span className="kpi-lbl">Process lic. needed</span>
              </div>
            )}
            {nl.addonsCapped && nl.processLicenseCostMonthly > 0 && (
              <div className="kpi-pill kpi-red">
                <span className="kpi-val">{fmtCur(nl.processLicenseCostMonthly)}/mo</span>
                <span className="kpi-lbl">Process lic. cost</span>
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
              {/* 3-zone bar: green=pool, amber=add-on zone, red=process zone */}
              <div style={{ height: 10, borderRadius: 5, background: 'var(--border)', overflow: 'hidden', position: 'relative', display: 'flex' }}>
                {(() => {
                  const tot = Math.max(nl.peakTenantRequests, nl.tenantPool);
                  const gPct = (Math.min(nl.peakTenantRequests, nl.tenantPool) / tot) * 100;
                  const aPct = nl.overrun > 0
                    ? ((Math.min(nl.peakTenantRequests, D365_POOL_CAP) - nl.tenantPool) / tot) * 100
                    : 0;
                  const rPct = nl.addonsCapped
                    ? ((nl.peakTenantRequests - D365_POOL_CAP) / tot) * 100
                    : 0;
                  return (
                    <>
                      <div style={{ height: '100%', width: `${gPct}%`, background: '#3fb950', borderRadius: '5px 0 0 5px' }} />
                      {aPct > 0 && <div style={{ height: '100%', width: `${aPct}%`, background: '#c18e00', borderRadius: rPct > 0 ? 0 : '0 5px 5px 0' }} />}
                      {rPct > 0 && <div style={{ height: '100%', width: `${rPct}%`, background: '#da3633', borderRadius: '0 5px 5px 0' }} />}
                    </>
                  );
                })()}
              </div>
              {nl.overrun > 0 && (
                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: '0.75em', flexWrap: 'wrap' }}>
                  <span style={{ color: '#c18e00' }}>■ Add-on zone: +{fmtNum(Math.min(nl.overrun, D365_POOL_CAP - nl.tenantPool))} req/day</span>
                  {nl.addonsCapped && <span style={{ color: '#da3633' }}>■ Process zone: +{fmtNum(nl.excessAbove10M)} req/day above 10M cap</span>}
                </div>
              )}
            </div>
          )}

          {/* ── Overrun remediation options ── */}
          {nl.overrun > 0 && (
            <>
              {/* 10M platform cap warning */}
              {nl.addonsCapped && (
                <div style={{
                  background: 'rgba(218,54,51,0.12)',
                  border: '1px solid var(--red)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 12,
                  fontSize: '0.88em',
                }}>
                  <strong style={{ color: 'var(--red)' }}>⚠️ Platform limit reached</strong>
                  <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>
                    The non-licensed tenant pool is hard-capped at <strong>10,000,000 req/day</strong> by Microsoft.
                    Add-ons can fill only up to this ceiling. The excess of{' '}
                    <strong style={{ color: 'var(--red)' }}>+{fmtNum(nl.excessAbove10M)} req/day</strong> above 10M
                    must be covered with <strong>Power Automate Process licenses</strong> ({fmtNum(250_000)} req/day each).
                  </p>
                </div>
              )}

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
                      <td>
                        <strong>A — PP Request Add-ons</strong>
                        {nl.addonsCapped && <span style={{ color: 'var(--red)', fontSize: '0.8em', marginLeft: 6 }}>(capped at 10M)</span>}
                      </td>
                      <td className="num">{nl.addonsNeeded}</td>
                      <td className="num">
                        +{fmtNum(nl.addonsNeeded * REQUEST_ADDON_CAPACITY)} req/day
                        {nl.addonsCapped && (
                          <span style={{ display: 'block', fontSize: '0.8em', color: 'var(--text-muted)' }}>
                            fills pool to {fmtNum(10_000_000)}/day max
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {nl.addonCostMonthly > 0
                          ? <strong>{fmtCur(nl.addonCostMonthly)}</strong>
                          : <em style={{ color: 'var(--text-muted)' }}>Set price in ⚙️</em>}
                      </td>
                      <td style={{ fontSize: '0.82em', color: 'var(--text-muted)' }}>
                        Expands shared tenant pool; benefits all non-licensed callers
                        {nl.addonsCapped && '. Cannot exceed 10M/day platform limit.'}
                      </td>
                    </tr>
                    {nl.addonsCapped ? (
                      <tr className="row-non-compliant">
                        <td><strong>B — Process Licenses</strong> <span style={{ fontSize: '0.8em' }}>(mandatory for excess above 10M)</span></td>
                        <td className="num">{nl.processLicensesNeeded}</td>
                        <td className="num">{fmtNum(nl.processLicensesNeeded * 250_000)} req/day</td>
                        <td className="num">
                          {nl.processLicenseCostMonthly > 0
                            ? <strong style={{ color: 'var(--red)' }}>{fmtCur(nl.processLicenseCostMonthly)}</strong>
                            : <em style={{ color: 'var(--text-muted)' }}>Set Process price in ⚙️</em>}
                        </td>
                        <td style={{ fontSize: '0.82em', color: 'var(--text-muted)' }}>
                          Required — platform will throttle above 10M. Each license covers 250k req/day per flow.
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td><strong>B — Process Licenses</strong> (top callers)</td>
                        <td className="num">varies</td>
                        <td className="num">250k req/day each</td>
                        <td className="num"><em style={{ color: 'var(--text-muted)' }}>See below</em></td>
                        <td style={{ fontSize: '0.82em', color: 'var(--text-muted)' }}>
                          Removes flow from shared pool; environment-specific; best for high-volume SPs
                        </td>
                      </tr>
                    )}
                    {nl.addonsCapped && nl.addonCostMonthly > 0 && nl.processLicenseCostMonthly > 0 && (
                      <tr style={{ fontWeight: 700 }}>
                        <td>Total (A + B)</td>
                        <td />
                        <td />
                        <td className="num">{fmtCur(nl.addonCostMonthly + nl.processLicenseCostMonthly)}/mo</td>
                        <td style={{ fontSize: '0.82em', color: 'var(--text-muted)' }}>Combined minimum monthly cost</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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

      {/* ── Breakdown table — day-status for non-licensed, pattern for others ── */}
      <div className="breakdown-section">
        {fileType === 'non-licensed' && nl && dayGroups ? (
          <>
            <h3>📅 Daily Consumption Breakdown by Status</h3>
            <p style={{ fontSize: '0.82em', color: 'var(--text-muted)', margin: '-4px 0 10px' }}>
              Costs shown are monthly estimates based on the peak day within each status group.
              Add-ons and Process licenses are monthly subscriptions sized to your worst day.
            </p>
            <div className="breakdown-scroll">
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th className="num">Days</th>
                    <th className="num">% of Period</th>
                    <th className="num">Total Requests</th>
                    <th className="num">Peak Req/Day</th>
                    <th className="num">Add-on Cost/mo</th>
                    {nl.addonsCapped && <th className="num">Process Lic.</th>}
                    {nl.addonsCapped && <th className="num">Process Cost/mo</th>}
                  </tr>
                </thead>
                <tbody>
                  {([
                    { key: 'cap',  label: '⚠ >10M',     clr: 'var(--red)',   cls: 'row-non-compliant' },
                    { key: 'over', label: '⚠ Over pool', clr: '#c18e00',      cls: 'row-warning' },
                    { key: 'high', label: '~ High',       clr: 'var(--amber)', cls: '' },
                    { key: 'ok',   label: '✓ OK',         clr: 'var(--green)', cls: '' },
                  ] as const).map(({ key, label, clr, cls }) => {
                    const g = dayGroups[key];
                    if (g.days === 0) return null;
                    const addonCost = dgAddonCost(g.peak);
                    const procLic   = dgProcessLic(g.peak);
                    const procCost  = dgProcessCost(g.peak);
                    return (
                      <tr key={key} className={cls}>
                        <td><span style={{ color: clr, fontWeight: 600 }}>{label}</span></td>
                        <td className="num">{g.days}</td>
                        <td className="num">{fmtPct1(g.days / nl.dailyTotals.length)}</td>
                        <td className="num">{fmtNum(g.total)}</td>
                        <td className="num" style={{ color: clr }}>{fmtNum(g.peak)}</td>
                        <td className="num">
                          {addonCost > 0
                            ? <strong style={{ color: '#c18e00' }}>{fmtCur(addonCost)}</strong>
                            : addonPrice === 0 && key !== 'ok' && key !== 'high'
                            ? <em style={{ color: 'var(--text-muted)' }}>Set price ⚙️</em>
                            : '—'}
                        </td>
                        {nl.addonsCapped && (
                          <td className="num" style={{ color: procLic > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                            {procLic > 0 ? procLic : '—'}
                          </td>
                        )}
                        {nl.addonsCapped && (
                          <td className="num">
                            {procCost > 0
                              ? <strong style={{ color: 'var(--red)' }}>{fmtCur(procCost)}</strong>
                              : procLic > 0 && processPrice === 0
                              ? <em style={{ color: 'var(--text-muted)' }}>Set price ⚙️</em>
                              : '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="breakdown-total">
                    <td><strong>Total</strong></td>
                    <td className="num"><strong>{nl.dailyTotals.length}</strong></td>
                    <td className="num"><strong>100%</strong></td>
                    <td className="num"><strong>{fmtNum(nl.dailyTotals.reduce((s, d) => s + d.requests, 0))}</strong></td>
                    <td className="num"><strong>{fmtNum(nl.peakTenantRequests)}</strong></td>
                    <td className="num bd-monthly"><strong>{nl.addonCostMonthly > 0 ? fmtCur(nl.addonCostMonthly) : '—'}</strong></td>
                    {nl.addonsCapped && <td className="num"><strong>{nl.processLicensesNeeded > 0 ? nl.processLicensesNeeded : '—'}</strong></td>}
                    {nl.addonsCapped && <td className="num bd-annual"><strong>{nl.processLicenseCostMonthly > 0 ? fmtCur(nl.processLicenseCostMonthly) : '—'}</strong></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
