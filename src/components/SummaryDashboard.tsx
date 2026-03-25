import type { ClassifiedUser, FileType, SellerSummary } from '../types';
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

export default function SummaryDashboard({ summary: s, users, patternFilter, onSelectPattern, fileType, premiumPrice, processPrice, currency }: SummaryDashboardProps) {
  const isPerFlow = fileType === 'per-flow';
  const entityLabel = isPerFlow ? 'Flows' : 'Users';
  const complianceRate = s.usersAnalyzed > 0
    ? ((s.compliantUsers / s.usersAnalyzed) * 100).toFixed(1)
    : '0';

  const pPrem = premiumPrice;
  const pProc = processPrice;
  const fmtCur = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });

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

      {/* Compliance × Frequency breakdown table */}
      <div className="breakdown-section">
        <h3>Compliance &amp; Licensing Breakdown by Usage Pattern</h3>
        <div className="breakdown-scroll">
          <table className="breakdown-table">
            <thead>
              <tr>
                <th>Usage Pattern</th>
                <th className="num">Users</th>
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
