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
  // Flows needing Process — split by frequency confidence
  const perFlowProcessFlows = perFlowFile?.users.filter(u => u.recommendation === 'Process') ?? []
  const perFlowProcessConfirmed = perFlowProcessFlows
    .filter(u => u.frequencyLabel === 'License recommended')
    .reduce((s, u) => s + u.totalProcessLicensesRequired, 0)
  const perFlowProcessMonitor = perFlowProcessFlows
    .filter(u => u.frequencyLabel !== 'License recommended')
    .reduce((s, u) => s + u.totalProcessLicensesRequired, 0)
  const perFlowProcessNeeded = perFlowProcessConfirmed + perFlowProcessMonitor

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

  // ── Licensed Users — split by frequency ──────────────────
  const licProcessUsers = licensedFile?.users.filter(u => u.totalProcessLicensesRequired > 0) ?? []
  const licProcessConfirmed = licProcessUsers
    .filter(u => u.frequencyLabel === 'License recommended' || u.frequencyLabel === 'Moderate pattern')
    .reduce((s, u) => s + u.totalProcessLicensesRequired, 0)
  const licProcessMonitor = licProcessUsers
    .filter(u => u.frequencyLabel !== 'License recommended' && u.frequencyLabel !== 'Moderate pattern')
    .reduce((s, u) => s + u.totalProcessLicensesRequired, 0)
  const licProcessNeeded = licProcessConfirmed + licProcessMonitor
  const licPremiumNeeded = licensedFile?.summary.additionalPremiumLicensesRequired ?? 0

  // ── Confidence totals ─────────────────────────────────────
  // "Confirmed" = recurring usage — definitely needs the license
  // "Monitor"   = occasional/moderate pattern — may not need permanent license
  const confirmedProcess = perFlowProcessConfirmed + netNewProcessForNL + licProcessConfirmed
  const monitorProcess   = perFlowProcessMonitor + licProcessMonitor

  // ── Grand Totals ──────────────────────────────────────────
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
          <span className="combined-kpi-value combined-kpi-red">{fmtN(confirmedProcess)}</span>
          <span className="combined-kpi-label">PROCESS — CONFIRMED</span>
          <span className="combined-kpi-sub">{fmt(confirmedProcess * processPrice, currency)}/mo · recurring pattern</span>
        </div>
        {monitorProcess > 0 && (
          <div className="combined-kpi">
            <span className="combined-kpi-value combined-kpi-amber">{fmtN(monitorProcess)}</span>
            <span className="combined-kpi-label">PROCESS — MONITOR</span>
            <span className="combined-kpi-sub">{fmt(monitorProcess * processPrice, currency)}/mo · occasional only</span>
          </div>
        )}
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
          <span className="combined-kpi-sub">all license types combined</span>
        </div>
        <div className="combined-kpi combined-kpi-annual">
          <span className="combined-kpi-value combined-kpi-annual-value">{fmt(totalAnnualCost, currency)}</span>
          <span className="combined-kpi-label">TOTAL ANNUAL OPPORTUNITY</span>
          <span className="combined-kpi-sub">{fmt(totalMonthlyCost, currency)}/mo × 12</span>
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
              <th className="num-col">PROCESS — CONFIRMED</th>
              <th className="num-col">PROCESS — MONITOR</th>
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
                  {perFlowProcessConfirmed > 0
                    ? <span className="badge badge-non-compliant">{fmtN(perFlowProcessConfirmed)}</span>
                    : <span className="muted">—</span>}
                </td>
                <td className="num-col">
                  {perFlowProcessMonitor > 0
                    ? <div className="combined-monitor-cell">
                        <span className="badge badge-warning">{fmtN(perFlowProcessMonitor)}</span>
                        <span className="combined-monitor-hint">moderate / occasional</span>
                      </div>
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
                <td className="num-col"><span className="muted">—</span><span className="combined-monitor-hint">tenant pool overrun — mandatory</span></td>
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
                  {licProcessConfirmed > 0
                    ? <span className="badge badge-non-compliant">{fmtN(licProcessConfirmed)}</span>
                    : <span className="muted">—</span>}
                </td>
                <td className="num-col">
                  {licProcessMonitor > 0
                    ? <div className="combined-monitor-cell">
                        <span className="badge badge-warning">{fmtN(licProcessMonitor)}</span>
                        <span className="combined-monitor-hint">occasional only — monitor</span>
                      </div>
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
              <td className="num-col"><strong>{fmtN(confirmedProcess)}</strong></td>
              <td className="num-col"><strong className="combined-kpi-amber">{monitorProcess > 0 ? fmtN(monitorProcess) : '—'}</strong></td>
              <td className="num-col"><strong>{fmtN(totalNewPremium)}</strong></td>
              <td className="num-col"><strong>{nlAddonsNeeded > 0 ? fmtN(nlAddonsNeeded) : '—'}</strong></td>
              <td className="num-col"><strong>{fmt(totalMonthlyCost, currency)}/mo</strong></td>
              <td className="num-col combined-kpi-blue-text"><strong>{fmt(totalAnnualCost, currency)}/yr</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="combined-confidence-legend">
        <span className="cleg-item"><span className="badge badge-non-compliant">N</span> <strong>Confirmed</strong> — recurring pattern (≥40 % of days above threshold). License purchase strongly recommended.</span>
        <span className="cleg-item"><span className="badge badge-warning">N</span> <strong>Monitor first</strong> — moderate or occasional spikes (&lt;40 % of days). Assess trend before purchasing.</span>
        <span className="cleg-item"><span className="combined-reuse-tag">♻ reused</span> Freed Process slots reallocated from downgraded per-flow flows — no new license needed.</span>
      </div>

      <p className="combined-note">
        ⚠ Costs are estimates based on peak consumption within each file's date range. License reuse assumes freed
        per-flow Process licenses are reassigned within the same tenant. Actual net-new purchases depend on existing
        license agreements. Prices are configured in Settings.
      </p>
    </div>
  )
}
