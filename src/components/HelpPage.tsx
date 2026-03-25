interface HelpPageProps {
  onClose: () => void;
}

const DOCS = [
  {
    category: 'Power Platform Request Limits',
    items: [
      {
        title: 'Requests limits and allocations',
        url: 'https://learn.microsoft.com/en-us/power-platform/admin/api-request-limits-allocations',
        desc: 'Official overview of Power Platform request (PPR) entitlements per license type, including daily limits for M365, Power Apps, Power Automate, and Dynamics 365 licenses.',
      },
      {
        title: 'Pay-as-you-go for Power Platform requests',
        url: 'https://learn.microsoft.com/en-us/power-platform/admin/pay-as-you-go-overview',
        desc: 'How the pay-as-you-go model works for Power Platform requests that exceed included entitlements.',
      },
      {
        title: 'Power Automate licensing FAQ',
        url: 'https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq',
        desc: 'Frequently asked questions about Power Apps and Power Automate licensing, including request consumption and overages.',
      },
    ],
  },
  {
    category: 'License Types & Entitlements',
    items: [
      {
        title: 'Microsoft Power Platform licensing overview',
        url: 'https://learn.microsoft.com/en-us/power-platform/admin/pricing-billing-skus',
        desc: 'Full licensing guide covering all Power Platform SKUs: per-user, per-app, per-flow, and included entitlements.',
      },
      {
        title: 'Power Automate licensing',
        url: 'https://learn.microsoft.com/en-us/power-automate/licensing/types',
        desc: 'Detailed breakdown of Power Automate license types including Premium, Process, and Hosted Process.',
      },
      {
        title: 'Power Apps licensing',
        url: 'https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq#power-apps',
        desc: 'Power Apps per-user and per-app license entitlements and how they contribute to request allocations.',
      },
      {
        title: 'Dynamics 365 license entitlements',
        url: 'https://learn.microsoft.com/en-us/power-platform/admin/api-request-limits-allocations#requests-included-with-dynamics-365-licenses',
        desc: 'How Dynamics 365 licenses (Sales, Customer Service, etc.) contribute to the request pool.',
      },
    ],
  },
  {
    category: 'Capacity & Monitoring',
    items: [
      {
        title: 'Capacity add-ons',
        url: 'https://learn.microsoft.com/en-us/power-platform/admin/capacity-add-on',
        desc: 'How capacity add-ons work and how to assign them to environments.',
      },
      {
        title: 'View and download consumption reports (PPAC)',
        url: 'https://learn.microsoft.com/en-us/power-platform/admin/api-request-limits-allocations#view-detailed-power-platform-request-usage-information-in-the-ppac',
        desc: 'Step-by-step guide to downloading licensed user, non-licensed user, and per-flow reports from the Power Platform Admin Center.',
      },
      {
        title: 'Power Platform Admin Center',
        url: 'https://admin.powerplatform.microsoft.com/',
        desc: 'Direct link to the Power Platform Admin Center (PPAC) where you can download consumption reports.',
      },
    ],
  },
  {
    category: 'Request Thresholds & Compliance',
    items: [
      {
        title: 'What counts as a Power Platform request?',
        url: 'https://learn.microsoft.com/en-us/power-platform/admin/api-request-limits-allocations#what-is-a-microsoft-power-platform-request',
        desc: 'Definition of what constitutes a Power Platform request — connector actions, HTTP calls, plug-in executions, etc.',
      },
      {
        title: 'Non-licensed user and service principal consumption',
        url: 'https://learn.microsoft.com/en-us/power-platform/admin/api-request-limits-allocations#non-licensed-usersapplication-usersusers-with-special-free-licenses',
        desc: 'How non-interactive, application, and service principal accounts consume from the tenant-level pool.',
      },
      {
        title: 'Per-flow license plan',
        url: 'https://learn.microsoft.com/en-us/power-automate/licensing/types#per-flow-plan',
        desc: 'Per-flow (Process) license details — 250K requests/day per flow, when to use it, and how it relates to compliance.',
      },
      {
        title: 'Transition period and enforcement',
        url: 'https://learn.microsoft.com/en-us/power-platform/admin/api-request-limits-allocations#enforcement',
        desc: 'Current enforcement timeline for Power Platform request limits and grace periods.',
      },
    ],
  },
] as const;

const THRESHOLDS = [
  { tier: 'M365 / Office 365', daily: '6,000', note: 'Included with most M365 plans' },
  { tier: 'Power Apps per app', daily: '6,000', note: 'Per licensed user per app' },
  { tier: 'Power Automate Free', daily: '6,000', note: 'Basic seeded entitlement' },
  { tier: 'Power Apps per user', daily: '40,000', note: 'Premium per-user license' },
  { tier: 'Power Automate Premium', daily: '40,000', note: 'Premium per-user license' },
  { tier: 'Dynamics 365 Enterprise', daily: '40,000', note: 'Sales, CS, Field Service, etc.' },
  { tier: 'Dynamics 365 Professional', daily: '20,000', note: 'D365 Professional plans' },
  { tier: 'Power Automate Process', daily: '250,000', note: 'Per-flow license (per flow)' },
] as const;

export default function HelpPage({ onClose }: HelpPageProps) {
  return (
    <div className="help-page">
      <div className="help-header">
        <div>
          <h2>📖 Licensing &amp; Consumption Reference</h2>
          <p className="help-subtitle">Official Microsoft documentation on Power Platform request consumption, licensing, and compliance</p>
        </div>
        <button className="dd-close" onClick={onClose} title="Close">✕</button>
      </div>

      {/* Quick reference table */}
      <div className="help-section">
        <h3 className="help-section-title">⚡ Quick Reference — Daily Request Entitlements</h3>
        <p className="help-section-desc">
          Each license type grants a specific number of Power Platform requests per user per 24-hour period.
          Usage is evaluated at the <strong>per-user, per-day</strong> level.
        </p>
        <div className="help-table-scroll">
          <table className="help-table">
            <thead>
              <tr>
                <th>License Tier</th>
                <th className="num">Daily Requests</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {THRESHOLDS.map((t, i) => (
                <tr key={i}>
                  <td><strong>{t.tier}</strong></td>
                  <td className="num">{t.daily}</td>
                  <td className="help-muted">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="help-source">
          Source: <a href="https://learn.microsoft.com/en-us/power-platform/admin/api-request-limits-allocations" target="_blank" rel="noopener noreferrer">Requests limits and allocations</a>
        </p>
      </div>

      {/* Documentation links */}
      {DOCS.map((section, si) => (
        <div key={si} className="help-section">
          <h3 className="help-section-title">{section.category}</h3>
          <div className="help-links-grid">
            {section.items.map((item, ii) => (
              <a key={ii} href={item.url} target="_blank" rel="noopener noreferrer" className="help-link-card">
                <span className="help-link-title">{item.title}</span>
                <span className="help-link-desc">{item.desc}</span>
                <span className="help-link-url">{new URL(item.url).hostname} ↗</span>
              </a>
            ))}
          </div>
        </div>
      ))}

      {/* Color coding explanation */}
      <div className="help-section">
        <h3 className="help-section-title">🎨 How This Tool Classifies Users</h3>
        <div className="help-table-scroll">
          <table className="help-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Condition</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="badge badge-no-license">No License</span></td>
                <td>Entitlement = 0 — user has no assigned license</td>
                <td>Assign M365, Power Apps, Power Automate, or D365 license</td>
              </tr>
              <tr>
                <td><span className="badge badge-covered">Covered</span></td>
                <td>Peak daily usage ≤ entitled capacity</td>
                <td>No action needed</td>
              </tr>
              <tr>
                <td><span className="badge badge-premium">Premium</span></td>
                <td>Peak exceeds current entitlement but ≤ 40K, no premium license</td>
                <td>Upgrade to Power Apps/Power Automate Premium</td>
              </tr>
              <tr>
                <td><span className="badge badge-process">Process</span></td>
                <td>Peak daily usage exceeds 40K (or entitled capacity for premium users)</td>
                <td>Add Power Automate Process (per-flow) licenses</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
