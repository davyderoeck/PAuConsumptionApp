import { useState } from 'react';

interface SettingsPanelProps {
  premiumPrice: number;
  processPrice: number;
  currency: string;
  onPremiumPrice: (v: number) => void;
  onProcessPrice: (v: number) => void;
  onCurrency: (v: string) => void;
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
  premiumPrice, processPrice, currency,
  onPremiumPrice, onProcessPrice, onCurrency, onClose,
}: SettingsPanelProps) {
  const [premText, setPremText] = useState(toDisplay(premiumPrice));
  const [procText, setProcText] = useState(toDisplay(processPrice));
  const [premError, setPremError] = useState(false);
  const [procError, setProcError] = useState(false);

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

  const handlePremBlur = () => {
    const val = parsePrice(premText);
    if (val !== null) setPremText(toDisplay(val));
  };
  const handleProcBlur = () => {
    const val = parsePrice(procText);
    if (val !== null) setProcText(toDisplay(val));
  };

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
              <input
                type="text"
                inputMode="decimal"
                value={premText}
                onChange={e => handlePremChange(e.target.value)}
                onBlur={handlePremBlur}
                className={`settings-input ${premError ? 'settings-input-error' : ''}`}
                placeholder="15,00"
              />
            </div>
            {premError && <span className="settings-error-msg">Enter a valid price (e.g. 15,00)</span>}
          </div>

          <div className="settings-field">
            <label>Power Automate Process (per flow/mo)</label>
            <div className="settings-input-wrap">
              <span className="settings-currency">{sym}</span>
              <input
                type="text"
                inputMode="decimal"
                value={procText}
                onChange={e => handleProcChange(e.target.value)}
                onBlur={handleProcBlur}
                className={`settings-input ${procError ? 'settings-input-error' : ''}`}
                placeholder="150,00"
              />
            </div>
            {procError && <span className="settings-error-msg">Enter a valid price (e.g. 150,00)</span>}
          </div>

          <div className="settings-preview">
            <h4>Opportunity Preview</h4>
            <p className="settings-hint">Changes apply immediately to the opportunity calculation in the dashboard.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
