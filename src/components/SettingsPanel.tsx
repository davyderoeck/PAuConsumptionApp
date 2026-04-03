import { useState } from 'react';
import type { FileType, TenantPoolConfig } from '../types';

interface SettingsPanelProps {
  premiumPrice: number;
  processPrice: number;
  currency: string;
  fileType: FileType;
  tenantPoolConfig: TenantPoolConfig;
  onPremiumPrice: (v: number) => void;
  onProcessPrice: (v: number) => void;
  onCurrency: (v: string) => void;
  onTenantPoolConfig: (c: TenantPoolConfig) => void;
  onClose: () => void;
}

function toDisplay(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.replace(',', '.');
  if ((normalized.match(/\./g) || []).length > 1) return null;
  const val = parseFloat(normalized);
  if (isNaN(val) || val < 0) return null;
  return Math.round(val * 100) / 100;
}

export default function SettingsPanel({
  premiumPrice, processPrice, currency, fileType, tenantPoolConfig,
  onPremiumPrice, onProcessPrice, onCurrency, onTenantPoolConfig, onClose,
}: SettingsPanelProps) {
  const [premText, setPremText] = useState(toDisplay(premiumPrice));
  const [procText, setProcText] = useState(toDisplay(processPrice));
  const [addonText, setAddonText] = useState(toDisplay(tenantPoolConfig.requestAddonPrice));
  const [premError, setPremError] = useState(false);
  const [procError, setProcError] = useState(false);
  const [addonError, setAddonError] = useState(false);

  const sym = currency === 'EUR' ? '€' : '$';

  const handlePremChange = (raw: string) => {
    const filtered = raw.replace(/[^0-9.,]/g, '');
    setPremText(filtered);
    const val = parsePrice(filtered);
    if (val !== null) { onPremiumPrice(val); setPremError(false); }
    else { setPremError(true); }
  };

  const handleProcChange = (raw: string) => {
    const filtered = raw.replace(/[^0-9.,]/g, '');
    setProcText(filtered);
    const val = parsePrice(filtered);
    if (val !== null) { onProcessPrice(val); setProcError(false); }
    else { setProcError(true); }
  };

  const handleAddonChange = (raw: string) => {
    const filtered = raw.replace(/[^0-9.,]/g, '');
    setAddonText(filtered);
    const val = parsePrice(filtered);
    if (val !== null) { onTenantPoolConfig({ requestAddonPrice: val }); setAddonError(false); }
    else { setAddonError(true); }
  };

  const handlePremBlur = () => { const val = parsePrice(premText); if (val !== null) setPremText(toDisplay(val)); };
  const handleProcBlur = () => { const val = parsePrice(procText); if (val !== null) setProcText(toDisplay(val)); };
  const handleAddonBlur = () => { const val = parsePrice(addonText); if (val !== null) setAddonText(toDisplay(val)); };

  return (
    <div className="settings-overlay" onClick={e => { if ((e.target as HTMLElement).classList.contains('settings-overlay')) onClose(); }}>
      <div className="settings-panel">
        <div className="settings-header">
          <h2>⚙️ Settings</h2>
          <button className="dd-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          <h3 className="settings-section-title">License Pricing (Monthly)</h3>
          <p className="settings-hint">Override the list prices used for opportunity calculations. These defaults are estimate-only guidance.</p>

          <div className="settings-field">
            <label>Currency</label>
            <div className="settings-currency-toggle">
              <button type="button" className={`currency-btn ${currency === 'USD' ? 'active' : ''}`} onClick={() => onCurrency('USD')}>USD ($)</button>
              <button type="button" className={`currency-btn ${currency === 'EUR' ? 'active' : ''}`} onClick={() => onCurrency('EUR')}>EUR (€)</button>
            </div>
          </div>

          <div className="settings-field">
            <label>Power Automate Premium (per user/mo)</label>
            <div className="settings-input-wrap">
              <span className="settings-currency">{sym}</span>
              <input type="text" inputMode="decimal" value={premText}
                onChange={e => handlePremChange(e.target.value)} onBlur={handlePremBlur}
                className={`settings-input ${premError ? 'settings-input-error' : ''}`} placeholder="15,00" />
            </div>
            {premError && <span className="settings-error-msg">Enter a valid price (e.g. 15,00)</span>}
          </div>

          <div className="settings-field">
            <label>Power Automate Process (per flow/mo)</label>
            <div className="settings-input-wrap">
              <span className="settings-currency">{sym}</span>
              <input type="text" inputMode="decimal" value={procText}
                onChange={e => handleProcChange(e.target.value)} onBlur={handleProcBlur}
                className={`settings-input ${procError ? 'settings-input-error' : ''}`} placeholder="150,00" />
            </div>
            {procError && <span className="settings-error-msg">Enter a valid price (e.g. 150,00)</span>}
          </div>

          {fileType === 'non-licensed' && (
            <>
              <div className="settings-divider" />
              <h3 className="settings-section-title">Non-Licensed Tenant Pool</h3>
              <p className="settings-hint">
                The tenant pool size is read from the CSV file. Set the add-on price below
                to estimate the cost of expanding the pool with <strong>PP Request capacity add-ons</strong> (each adds 50,000 req/day).
              </p>
              <div className="settings-field">
                <label>PP Request capacity add-on (per add-on/mo)</label>
                <p className="settings-hint" style={{ marginBottom: 4 }}>
                  Enter 0 to skip cost estimation for this option.
                </p>
                <div className="settings-input-wrap">
                  <span className="settings-currency">{sym}</span>
                  <input type="text" inputMode="decimal" value={addonText}
                    onChange={e => handleAddonChange(e.target.value)} onBlur={handleAddonBlur}
                    className={`settings-input ${addonError ? 'settings-input-error' : ''}`} placeholder="0,00" />
                </div>
                {addonError && <span className="settings-error-msg">Enter a valid price</span>}
              </div>
            </>
          )}

          <div className="settings-preview">
            <h4>Opportunity Preview</h4>
            <p className="settings-hint">Changes apply immediately to the opportunity calculation in the dashboard.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
