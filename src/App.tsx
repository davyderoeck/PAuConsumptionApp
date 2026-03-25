import { useCallback, useState } from 'react'
import './App.css'
import type { ClassifiedUser, EnvironmentSummary, FileType, ProcessingStatus, RawApiRow, SellerSummary, UserDrillDownData } from './types'
import { DEFAULT_PREMIUM_PRICE_MONTHLY, DEFAULT_PROCESS_PRICE_MONTHLY } from './types'
import { parseFile } from './utils/fileParser'
import { analyzeConsumption, buildDrillDown, buildEnvironmentSummary } from './utils/complianceAnalyzer'
import { generateReport } from './utils/reportGenerator'
import FileUpload from './components/FileUpload'
import SummaryDashboard from './components/SummaryDashboard'
import UsersTable from './components/UsersTable'
import UserDrillDown from './components/UserDrillDown'
import EnvironmentView from './components/EnvironmentView'
import EnvironmentDrillDown from './components/EnvironmentDrillDown'
import SettingsPanel from './components/SettingsPanel'
import HelpPage from './components/HelpPage'

type ActiveView = 'users' | 'environments' | 'help'

function App() {
  const [status, setStatus] = useState<ProcessingStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<SellerSummary | null>(null)
  const [users, setUsers] = useState<ClassifiedUser[]>([])
  const [rawRows, setRawRows] = useState<RawApiRow[]>([])
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([])
  const [drillDown, setDrillDown] = useState<UserDrillDownData | null>(null)
  const [envDrillDown, setEnvDrillDown] = useState<EnvironmentSummary | null>(null)
  const [activeView, setActiveView] = useState<ActiveView>('users')
  const [showSettings, setShowSettings] = useState(false)
  const [premiumPrice, setPremiumPrice] = useState(DEFAULT_PREMIUM_PRICE_MONTHLY)
  const [processPrice, setProcessPrice] = useState(DEFAULT_PROCESS_PRICE_MONTHLY)
  const [currency, setCurrency] = useState('USD')
  const [patternFilter, setPatternFilter] = useState<string[]>([])
  const [fileType, setFileType] = useState<FileType>('per-user')

  const handleFileSelected = useCallback(async (file: File) => {
    setError(null)
    setSummary(null)
    setUsers([])
    setRawRows([])
    setEnvironments([])
    setProgress(0)

    try {
      setStatus('parsing')
      setProgressLabel('Reading file...')
      setProgress(5)

      const parseResult = await parseFile(file, (pct) => {
        setProgress(pct)
        setProgressLabel(pct < 40 ? 'Reading file...' : 'Parsing rows...')
      })

      if (parseResult.rows.length === 0) {
        throw new Error('No valid data rows found. Check that the file has the required columns.')
      }

      setFileType(parseResult.fileType)

      setStatus('analyzing')
      setProgressLabel('Analyzing consumption...')
      setProgress(92)

      await new Promise(r => setTimeout(r, 10))

      const { users: analyzedUsers, summary: analyzedSummary } = analyzeConsumption(
        parseResult.rows,
        parseResult.dateRange,
        premiumPrice,
        processPrice,
        parseResult.fileType,
      )
      const envSummaries = buildEnvironmentSummary(parseResult.rows, parseResult.fileType)

      setProgress(100)
      setProgressLabel('Complete!')
      setRawRows(parseResult.rows)
      setUsers(analyzedUsers)
      setSummary(analyzedSummary)
      setEnvironments(envSummaries)
      setStatus('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      setStatus('error')
    }
  }, [premiumPrice, processPrice])

  const handleRestart = useCallback(() => {
    setStatus('idle')
    setProgress(0)
    setProgressLabel('')
    setError(null)
    setSummary(null)
    setUsers([])
    setRawRows([])
    setEnvironments([])
    setDrillDown(null)
    setEnvDrillDown(null)
    setActiveView('users')
  }, [])

  const handleDownload = useCallback(() => {
    if (summary && users.length > 0) {
      const monthlyOpp = summary.additionalPremiumLicensesRequired * premiumPrice + summary.totalProcessLicensesRequired * processPrice;
      const liveSummary = {
        ...summary,
        premiumPriceMonthly: premiumPrice,
        processPriceMonthly: processPrice,
        monthlyOpportunityUsd: monthlyOpp,
        annualOpportunityUsd: monthlyOpp * 12,
      };
      generateReport(liveSummary, users, currency);
    }
  }, [summary, users, premiumPrice, processPrice, currency])

  const handleSelectUser = useCallback((user: ClassifiedUser) => {
    const data = buildDrillDown(rawRows, user.callerId, user)
    setDrillDown(data)
  }, [rawRows])

  const isProcessing = status === 'parsing' || status === 'analyzing'

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo" title="Power Automate Consumption Analyzer">
          <svg width="36" height="36" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Power Automate">
            <defs>
              <linearGradient id="sl-g0" x1="43" y1="55" x2="29" y2="10" gradientUnits="userSpaceOnUse"><stop stopColor="#0D36A5"/><stop offset="1" stopColor="#1152D4"/></linearGradient>
              <linearGradient id="sl-g1" x1="46" y1="10" x2="46" y2="86" gradientUnits="userSpaceOnUse"><stop stopColor="#84CAFF"/><stop offset="1" stopColor="#61B1FB"/></linearGradient>
              <linearGradient id="sl-g2" x1="37.5" y1="10" x2="37.5" y2="86" gradientUnits="userSpaceOnUse"><stop stopColor="#3B90F5"/><stop offset="1" stopColor="#2A78EE"/></linearGradient>
              <clipPath id="sl-c"><rect width="96" height="96" fill="white"/></clipPath>
            </defs>
            <g clipPath="url(#sl-c)">
              <mask id="sl-m" maskUnits="userSpaceOnUse" x="-1" y="10" width="97" height="76">
                <path d="M61.2116 10C62.3496 10 63.4337 10.4847 64.1925 11.3328L94.6136 45.3328C95.9723 46.8514 95.9723 49.1486 94.6136 50.6672L64.1925 84.6672C63.4337 85.5153 62.3496 86 61.2116 86H3.94634C0.488777 86 -1.34012 81.9095 0.965366 79.3328L29 48L0.965366 16.6672C-1.34012 14.0905 0.488777 10 3.94634 10H61.2116Z" fill="white"/>
              </mask>
              <g mask="url(#sl-m)">
                <path d="M63 10L29 48L-5 10H63Z" fill="url(#sl-g0)"/>
                <path d="M-5 86L63 10L97 48L63 86H-5Z" fill="url(#sl-g1)"/>
                <path d="M-5 86L63 10L80 29L29 86H-5Z" fill="url(#sl-g2)"/>
              </g>
            </g>
          </svg>
        </div>
        <div className="sidebar-nav">
          <div className="sidebar-item" title="Analyze File" onClick={handleRestart}>
            {/* Refresh / Analyze icon */}
            <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H5.498a.75.75 0 0 0-.75.75v3.233a.75.75 0 0 0 1.5 0v-1.61l.311.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.459-.364Zm-3.049-8.348a7 7 0 0 0-8.432 4.116.75.75 0 0 0 1.393.556 5.5 5.5 0 0 1 8.2-2.588l.311.311H11.5a.75.75 0 0 0 0 1.5h3.233a.75.75 0 0 0 .75-.75V2.988a.75.75 0 0 0-1.5 0v1.61l-.311-.31Z" clipRule="evenodd"/>
            </svg>
          </div>

          <div className="sidebar-divider" />

          <div
            className={`sidebar-item ${activeView === 'users' && status === 'complete' ? 'active' : ''}`}
            title={fileType === 'per-flow' ? 'Flow Overview' : 'User Overview'}
            onClick={() => status === 'complete' && setActiveView('users')}
          >
            {/* People / Users icon */}
            <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-1 8.5c0-1.14.463-2.17 1.21-2.92A5 5 0 0 0 1 17h7.022A3.5 3.5 0 0 1 8 14.5Zm5-3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-3.5 3a3.5 3.5 0 1 1 7 0h-7Z"/>
            </svg>
          </div>
          <div
            className={`sidebar-item ${activeView === 'environments' && status === 'complete' ? 'active' : ''}`}
            title="Environment Overview"
            onClick={() => status === 'complete' && setActiveView('environments')}
          >
            {/* Server / Environment icon */}
            <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Zm14 1a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM2 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2Zm14 1a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clipRule="evenodd"/>
            </svg>
          </div>

          <div className="sidebar-divider" />

          <div
            className={`sidebar-item ${activeView === 'help' ? 'active' : ''}`}
            title="Help & Documentation"
            onClick={() => setActiveView('help')}
          >
            {/* Question mark icon (standalone, no circle) */}
            <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.25 6.088c0-1.893 1.554-3.338 3.382-3.088 1.52.208 2.618 1.592 2.618 3.125 0 1.195-.57 1.876-1.468 2.507-.225.158-.46.3-.698.444-.585.355-1.184.72-1.584 1.38a.75.75 0 0 0 1.29.764c.211-.347.573-.578 1.077-.884.258-.157.543-.33.822-.527C13.72 9.053 14.75 7.933 14.75 6.125c0-2.318-1.67-4.327-3.97-4.642C8.203 1.159 5.75 3.16 5.75 6.088a.75.75 0 0 0 1.5 0ZM10 18a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/>
            </svg>
          </div>
          <div className="sidebar-item" title="Settings" onClick={() => setShowSettings(true)}>
            {/* Cog / Settings icon */}
            <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25L2.795 4.48a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd"/>
            </svg>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className="main-content">
        <header className="app-header">
          <div>
            <h1>
              <svg width="28" height="28" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" style={{verticalAlign:'middle', marginRight:10}} aria-hidden="true">
                <defs>
                  <linearGradient id="hl-g0" x1="43" y1="55" x2="29" y2="10" gradientUnits="userSpaceOnUse"><stop stopColor="#0D36A5"/><stop offset="1" stopColor="#1152D4"/></linearGradient>
                  <linearGradient id="hl-g1" x1="46" y1="10" x2="46" y2="86" gradientUnits="userSpaceOnUse"><stop stopColor="#84CAFF"/><stop offset="1" stopColor="#61B1FB"/></linearGradient>
                  <linearGradient id="hl-g2" x1="37.5" y1="10" x2="37.5" y2="86" gradientUnits="userSpaceOnUse"><stop stopColor="#3B90F5"/><stop offset="1" stopColor="#2A78EE"/></linearGradient>
                  <clipPath id="hl-c"><rect width="96" height="96" fill="white"/></clipPath>
                </defs>
                <g clipPath="url(#hl-c)">
                  <mask id="hl-m" maskUnits="userSpaceOnUse" x="-1" y="10" width="97" height="76">
                    <path d="M61.2116 10C62.3496 10 63.4337 10.4847 64.1925 11.3328L94.6136 45.3328C95.9723 46.8514 95.9723 49.1486 94.6136 50.6672L64.1925 84.6672C63.4337 85.5153 62.3496 86 61.2116 86H3.94634C0.488777 86 -1.34012 81.9095 0.965366 79.3328L29 48L0.965366 16.6672C-1.34012 14.0905 0.488777 10 3.94634 10H61.2116Z" fill="white"/>
                  </mask>
                  <g mask="url(#hl-m)">
                    <path d="M63 10L29 48L-5 10H63Z" fill="url(#hl-g0)"/>
                    <path d="M-5 86L63 10L97 48L63 86H-5Z" fill="url(#hl-g1)"/>
                    <path d="M-5 86L63 10L80 29L29 86H-5Z" fill="url(#hl-g2)"/>
                  </g>
                </g>
              </svg>
              Power Automate Consumption Analyzer
            </h1>
            <p className="subtitle">Identify licensing opportunities from Power Platform API request exports</p>
          </div>
          {status === 'complete' && (
            <div className="header-actions">
              <div className="view-tabs">
                <button
                  className={`view-tab ${activeView === 'users' ? 'active' : ''}`}
                  onClick={() => setActiveView('users')}
                >{fileType === 'per-flow' ? '⚡ Flows' : '👥 Users'}</button>
                <button
                  className={`view-tab ${activeView === 'environments' ? 'active' : ''}`}
                  onClick={() => setActiveView('environments')}
                >🏢 Environments</button>
              </div>
              <button className="btn-secondary" onClick={() => setShowSettings(true)}>⚙️ Prices</button>
              <button className="btn-primary" onClick={handleDownload}>📥 Report</button>
            </div>
          )}
        </header>

        <main>
          {activeView === 'help' && (
            <HelpPage onClose={() => setActiveView('users')} />
          )}

          {activeView !== 'help' && (status === 'idle' || status === 'error') && (
            <FileUpload onFileSelected={handleFileSelected} status={status} />
          )}

          {activeView !== 'help' && isProcessing && (
            <div className="progress-section">
              <p className="progress-label">{progressLabel}</p>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-pct">{progress}%</p>
            </div>
          )}

          {activeView !== 'help' && error && (
            <div className="error-banner">
              <strong>Error:</strong> {error}
            </div>
          )}

          {activeView !== 'help' && summary && status === 'complete' && (
            <>
              <SummaryDashboard summary={summary} users={users} patternFilter={patternFilter} onSelectPattern={(p, multi) => { setPatternFilter(prev => { if (multi) { return prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]; } else { return prev.length === 1 && prev[0] === p ? [] : [p]; } }); setActiveView('users'); }} fileType={fileType} premiumPrice={premiumPrice} processPrice={processPrice} currency={currency} />

              {activeView === 'users' && (
                <UsersTable users={users} onSelectUser={handleSelectUser} patternFilter={patternFilter} fileType={fileType} />
              )}

              {activeView === 'environments' && (
                <EnvironmentView environments={environments} onSelectEnv={env => setEnvDrillDown(env)} fileType={fileType} />
              )}
            </>
          )}
        </main>

        <footer className="app-footer">
          <div className="footer-disclaimer">
            ⚠️ <strong>Disclaimer:</strong> This tool is <strong>not</strong> an official Microsoft product. All analysis results are estimates based on exported data and may contain inaccuracies. Always refer to official Microsoft documentation and consult with a licensing specialist for compliance decisions.
          </div>
          <div className="footer-meta">
            <span>v1.0.0</span>
            <span className="footer-sep">·</span>
            <span>Built 2026-03-13</span>
            <span className="footer-sep">·</span>
            <span>Community tool — not affiliated with Microsoft</span>
          </div>
        </footer>
      </div>

      {/* Drill-down modals */}
      {drillDown && (
        <UserDrillDown data={drillDown} onClose={() => setDrillDown(null)} fileType={fileType} />
      )}
      {envDrillDown && (
        <EnvironmentDrillDown env={envDrillDown} onClose={() => setEnvDrillDown(null)} fileType={fileType} />
      )}
      {showSettings && (
        <SettingsPanel
          premiumPrice={premiumPrice}
          processPrice={processPrice}
          currency={currency}
          onPremiumPrice={setPremiumPrice}
          onProcessPrice={setProcessPrice}
          onCurrency={setCurrency}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

export default App
