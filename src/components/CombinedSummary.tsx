import type { LoadedFile } from '../types'

interface CombinedSummaryProps {
  loadedFiles: LoadedFile[]
  premiumPrice: number
  processPrice: number
  addonPrice: number
  currency: string
}

const fmt = (v: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)

const fmtN = (v: number) => new Intl.NumberFormat('en-US').format(v)

export default function CombinedSummary({ loadedFiles, premiumPrice, processPrice, addonPrice, currency }: CombinedSummaryProps) {
  const perFlowFile  = loadedFiles.find(f => f.fileType === 'per-flow')
  const licensedFile = loadedFiles.find(f => f.fileType === 'per-user')
  const nlFile       = loadedFiles.find(f => f.fileType === 'non-licensed')

  // ── Per-Flow ─────────────────────────────────────────────
  // Flows that are downgrade candidates: they currently hold per-flow Process licenses
  // but their peak usage (≤40k req/day) could be covered by a Premium user license.
  const downgradableFlows  = perFlowFile?.users.filter(u => u.recommendation === 'Downgrade to Premium') ?? []
  const downgradableCount  = downgradableFlows.length
  // Flows that genuinely need Process licenses (peak >250k req/day), cannot be downgraded
  const perFlowProcessNeeded = perFlowFile?.users
    .filter(u => u.recommendation === 'Process')
    .reduce((s, u) => s + u.totalProcessLicensesRequired, 0) ?? 0

  // ── Non-Licensed ─────────────────────────────────────────
  const nlProcessNeeded  = nlFile?.nonLicensedAnalysis?.processLicensesNeeded ?? 0
  const nlAddonsNeeded   = nlFile?.nonLicensedAnalysis?.addonsNeeded ?? 0
  const nlAddonCostMo    = nlAddonsNeeded * addonPrice

  // ── Reuse optimisation ─────────────────────────────────────
  // Downgrading per-flow flows frees 1 Process license per flow.
  // Those freed licenses can be reallocated to non-licensed callers.
  const hasReuseOpportunity      = downgradableCount > 0 && nlProcessNeeded > 0
  const reuseableProcessLicenses = Math.min(downgradableCount, nlProcessNeeded)
  const netNewProcessForNL       = nlProcessNeeded - reuseableProcessLicenses
  // Each downgraded flow needs a Premium user license instead
  const premiumForDowngradedFlows = reuseableProcessLicenses

  // ── Licensed Users ────────────────────────────────────────
  const licProcessNeeded = licensedFile?.summary.totalProcessLicensesRequired ?? 0
  const licPremiumNeeded = licensedFile?.summary.additionalPremiumLicensesRequired ?? 0

  // ── Totals ────────────────────────────────────────────────
  const totalNewProcess  = netNewProcessForNL + perFlowProcessNeeded + licProcessNeeded
  const totalNewPremium  = licPremiumNeeded + premiumForDowngradedFlows
  const totalProcessCostMo = totalNewProcess * processPrice
  const totalPremiumCostMo = totalNewPremium * premiumPrice
  const totalMonthlyCost   = totalProcessCostMo + totalPremiumCostMo + nlAddonCostMo
  const totalAnnualCost    = totalMonthlyCost * 12

  // Monthly saving vs. naive (no reuse): buy all nlProcessNeeded fresh
  const monthlySavings = reuseableProcessLicenses * (processPrice - premiumPrice)

  // ── Per-row costs (for table) ─────────────────────────────
  const flowRowCostMo    = (perFlowProcessNeeded * processPrice) + (premiumForDowngradedFlows * premiumPrice)
  const nlRowCostMo      = (netNewProcessForNL * processPrice) + nlAddonCostMo
  const licRowCostMo     = (licProcessNeeded * processPrice) + (licPremiumNeeded * premiumPrice)

  return (
    <div className="combined-summary">

      <div className="combined-header">
        <h2 className="combined-title">🔗 Combined License Overview</h2>
        <p className="combined-subtitle">
          Cross-file analysis — optimised totals accounting for license reuse between file types
        </p>
      </div>

      {/* ── KPI pills ───────────────────────────────────────── */}
      <div className="combined-kpi-row">
        <div className="combined-kpi">
          <span className="combined-kpi-value combined-kpi-green">{fmtN(totalNewPremium)}</span>
          <span className="combined-kpi-label">PREMIUM LIC. NEEDED</span>
          <span className="combined-kpi-sub">{fmt(totalPremiumCostMo, currency)}/mo</span>
        </div>
        <div className="combined-kpi">
          <span className="combined-kpi-value combined-kpi-red">{fmtN(totalNewProcess)}</span>
          <span className="combined-kpi-label">PROCESS LIC. NEEDED</span>
          <span className="combined-kpi-sub">{fmt(totalProcessCostMo, currency)}/mo</span>
        </div>
        {nlFile && (
          <div className="combined-kpi">
            <span className="combined-kpi-value combined-kpi-amber">{fmtN(nlAddonsNeeded)}</span>
            <span className="combined-kpi-label">PP REQ. ADD-ONS</span>
            <span className="combined-kpi-sub">{fmt(nlAddonCostMo, currency)}/mo</span>
          </div>
        )}
        {monthlySavings > 0 && (
          <div className="combined-kpi">
            <span className="combined-kpi-value combined-kpi-green">{fmt(monthlySavings, currency)}</span>
            <span className="combined-kpi-label">MONTHLY SAVING</span>
            <span className="combined-kpi-sub">via license reuse</span>
          </div>
        )}
        <div className="combined-kpi combined-kpi-total">
          <span className="combined-kpi-value combined-kpi-blue">{fmt(totalMonthlyCost, currency)}</span>
          <span className="combined-kpi-label">TOTAL MONTHLY</span>
          <span className="combined-kpi-sub">{fmt(totalAnnualCost, currency)}/yr</span>
        </div>
      </div>

      {/* ── Reuse opportunity ───────────────────────────────── */}
      {hasReuseOpportunity && (
        <div className="combined-reuse-banner">
          <div className="combined-reuse-icon">♻️</div>
          <div className="combined-reuse-body">
            <div className="combined-reuse-title">License Reuse Opportunity — save {fmt(monthlySavings, currency)}/mo</div>
            <div className="combined-reuse-steps">
              <div className="combined-reuse-step">
                <span className="crs-tag crs-flow">↓ Per-Flow</span>
                <span>Downgrade <strong>{downgradableCount}</strong> flow{downgradableCount !== 1 ? 's' : ''} to Premium user license
                  (usage ≤ 40k req/day, no per-flow license needed)</span>
              </div>
              <div className="combined-reuse-arrow">→</div>
              <div className="combined-reuse-step">
                <span className="crs-tag crs-free">🔓 Free</span>
                <span><strong>{downgradableCount}</strong> Process license slot{downgradableCount !== 1 ? 's' : ''} freed</span>
              </div>
              <div className="combined-reuse-arrow">→</div>
              <div className="combined-reuse-step">
                <span className="crs-tag crs-nl">→ Non-Licensed</span>
                <span>Reallocate <strong>{reuseableProcessLicenses}</strong> freed slot{reuseableProcessLicenses !== 1 ? 's' : ''} to
                  non-licensed callers ({nlProcessNeeded} needed → <strong>{netNewProcessForNL} net new</strong>)</span>
              </div>
            </div>
            <div className="combined-reuse-tradeoff">
              Trade-off: replace {reuseableProcessLicenses} × Process ({fmt(processPrice, currency)}/mo each) with
              {' '}{reuseableProcessLicenses} × Premium ({fmt(premiumPrice, currency)}/mo each) for the downgraded flows.
              Net saving: <strong>{fmt(monthlySavings, currency)}/mo · {fmt(monthlySavings * 12, currency)}/yr</strong>
            </div>
          </div>
        </div>
      )}

      {/* ── Breakdown table ─────────────────────────────────── */}
      <div className="combined-section-title">License Needs by Source</div>
      <div className="section-wrapper">
        <table className="data-table combined-table">
          <thead>
            <tr>
              <th>SOURCE</th>
              <th>FILE</th>
              <th className="num-col">PROCESS LIC.</th>
              <th className="num-col">PREMIUM LIC.</th>
              <th className="num-col">ADD-ONS</th>
              <th className="num-col">MONTHLY COST</th>
              <th className="num-col">ANNUAL COST</th>
            </tr>
          </thead>
          <tbody>
            {perFlowFile && (
              <tr>
                <td><span className="ct-tag ct-tag-flow">⚡ Per-Flow</span></td>
                <td className="combined-filename" title={perFlowFile.fileName}>{perFlowFile.fileName}</td>
                <td className="num-col">
                  {perFlowProcessNeeded > 0
                    ? <span className="badge badge-non-compliant">{fmtN(perFlowProcessNeeded)}</span>
                    : <span className="muted">—</span>}
                </td>
                <td className="num-col">
                  {premiumForDowngradedFlows > 0
                    ? <span className="combined-detail">+{fmtN(premiumForDowngradedFlows)} <span className="muted">(from {downgradableCount} downgrades)</span></span>
                    : <span className="muted">—</span>}
                </td>
                <td className="num-col"><span className="muted">—</span></td>
                <td className="num-col">{flowRowCostMo > 0 ? fmt(flowRowCostMo, currency) : <span className="muted">—</span>}</td>
                <td className="num-col">{flowRowCostMo > 0 ? fmt(flowRowCostMo * 12, currency) : <span className="muted">—</span>}</td>
              </tr>
            )}
            {nlFile && (
              <tr>
                <td><span className="ct-tag ct-tag-nl">👤 Non-Licensed</span></td>
                <td className="combined-filename" title={nlFile.fileName}>{nlFile.fileName}</td>
                <td className="num-col">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {netNewProcessForNL > 0
                      ? <span className="badge badge-non-compliant">{fmtN(netNewProcessForNL)} new</span>
                      : <span className="muted">—</span>}
                    {reuseableProcessLicenses > 0 && (
                      <span className="combined-reuse-tag">♻ {fmtN(reuseableProcessLicenses)} reused</span>
                    )}
                    {nlProcessNeeded > 0 && (
                      <span className="muted" style={{ fontSize: '0.78em' }}>{fmtN(nlProcessNeeded)} total needed</span>
                    )}
                  </div>
                </td>
                <td className="num-col"><span className="muted">—</span></td>
                <td className="num-col">
                  {nlAddonsNeeded > 0
                    ? <span className="badge badge-warning">{fmtN(nlAddonsNeeded)}</span>
                    : <span className="muted">—</span>}
                </td>
                <td className="num-col">{nlRowCostMo > 0 ? fmt(nlRowCostMo, currency) : <span className="muted">—</span>}</td>
                <td className="num-col">{nlRowCostMo > 0 ? fmt(nlRowCostMo * 12, currency) : <span className="muted">—</span>}</td>
              </tr>
            )}
            {licensedFile && (
              <tr>
                <td><span className="ct-tag ct-tag-user">👥 Licensed Users</span></td>
                <td className="combined-filename" title={licensedFile.fileName}>{licensedFile.fileName}</td>
                <td className="num-col">
                  {licProcessNeeded > 0
                    ? <span className="badge badge-non-compliant">{fmtN(licProcessNeeded)}</span>
                    : <span className="muted">—</span>}
                </td>
                <td className="num-col">
                  {licPremiumNeeded > 0
                    ? <span className="badge badge-warning">{fmtN(licPremiumNeeded)}</span>
                    : <span className="muted">—</span>}
                </td>
                <td className="num-col"><span className="muted">—</span></td>
                <td className="num-col">{licRowCostMo > 0 ? fmt(licRowCostMo, currency) : <span className="muted">—</span>}</td>
                <td className="num-col">{licRowCostMo > 0 ? fmt(licRowCostMo * 12, currency) : <span className="muted">—</span>}</td>
              </tr>
            )}
            <tr className="combined-total-row">
              <td colSpan={2}><strong>Total</strong></td>
              <td className="num-col"><strong>{fmtN(totalNewProcess)}</strong></td>
              <td className="num-col"><strong>{fmtN(totalNewPremium)}</strong></td>
              <td className="num-col"><strong>{nlAddonsNeeded > 0 ? fmtN(nlAddonsNeeded) : '—'}</strong></td>
              <td className="num-col"><strong>{fmt(totalMonthlyCost, currency)}/mo</strong></td>
              <td className="num-col combined-kpi-blue-text"><strong>{fmt(totalAnnualCost, currency)}/yr</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="combined-note">
        ⚠ Costs are estimates based on peak consumption within each file's date range. License reuse assumes freed
        per-flow Process licenses are reassigned within the same tenant. Actual net-new purchases depend on existing
        license agreements. Prices are configured in Settings.
      </p>
    </div>
  )
}
