import { useState } from 'react';
import type { ClassifiedUser, FileType } from '../types';
import { exportUsersTable } from '../utils/reportGenerator';

interface UsersTableProps {
  users: ClassifiedUser[];
  onSelectUser: (user: ClassifiedUser) => void;
  patternFilter: string[];
  fileType: FileType;
}

type SortField = keyof ClassifiedUser;
type FilterRec = 'all' | 'Process' | 'Premium' | 'Covered' | 'Downgrade';

export default function UsersTable({ users, onSelectUser, patternFilter, fileType }: UsersTableProps) {
  const [sortField, setSortField] = useState<SortField>('peakDailyRequests');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<FilterRec>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(v => !v);
    else { setSortField(field); setSortAsc(false); }
  };

  // Apply pattern + search filters first (base set for dropdown counts)
  let baseFiltered = users;
  if (patternFilter.length > 0) {
    baseFiltered = baseFiltered.filter(u => patternFilter.includes(u.frequencyLabel || 'Compliant'));
  }
  if (search) {
    const q = search.toLowerCase();
    baseFiltered = baseFiltered.filter(u => u.callerId.toLowerCase().includes(q));
  }

  // Apply recommendation filter on top
  let filtered = baseFiltered;
  if (filter === 'Process') filtered = filtered.filter(u => u.recommendation === 'Process');
  else if (filter === 'Premium') filtered = filtered.filter(u => u.recommendation === 'Premium');
  else if (filter === 'Covered') filtered = filtered.filter(u => u.recommendation === 'Covered');
  else if (filter === 'Downgrade') filtered = filtered.filter(u => u.recommendation === 'Downgrade to Premium');

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortField]; const bv = b[sortField];
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortAsc ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const si = (f: SortField) => sortField === f ? (sortAsc ? ' ↑' : ' ↓') : '';
  const th = (label: string, field: SortField) => (
    <th onClick={() => handleSort(field)}>{label}{si(field)}</th>
  );

  const recBadge = (r: string, compliant: boolean) => {
    if (r === 'Downgrade to Premium') return <span className="badge badge-downgrade">⬇ Downgrade</span>;
    if (!compliant && r === 'Covered') return <span className="badge badge-warning">Non-Compliant</span>;
    if (r === 'Process') return <span className="badge badge-non-compliant">Process</span>;
    if (r === 'Premium') return <span className="badge badge-warning">Premium</span>;
    return <span className="badge badge-compliant">Covered</span>;
  };

  const isPerFlow = fileType === 'per-flow';
  const entityLabel = isPerFlow ? 'Flow' : 'User';
  const entitiesLabel = isPerFlow ? 'Flows' : 'Users';

  // Counts reflect active pattern + search filters so the dropdown is accurate
  const counts = {
    all: baseFiltered.length,
    Process: baseFiltered.filter(u => u.recommendation === 'Process').length,
    Premium: baseFiltered.filter(u => u.recommendation === 'Premium').length,
    Covered: baseFiltered.filter(u => u.recommendation === 'Covered').length,
    Downgrade: baseFiltered.filter(u => u.recommendation === 'Downgrade to Premium').length,
  };

  return (
    <div className="users-table-section">
      <h2>{isPerFlow ? '⚡ Flow Detail' : '👥 User Detail'}</h2>
      <div className="table-controls">
        <input
          type="text" placeholder={`Search ${isPerFlow ? 'flow' : 'caller'} ID...`} value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="search-input"
        />
        <select value={filter} onChange={e => { setFilter(e.target.value as FilterRec); setPage(0); }} className="filter-select">
          <option value="all">All ({counts.all})</option>
          <option value="Process">🚫 Process ({counts.Process})</option>
          {!isPerFlow && <option value="Premium">⚠️ Premium ({counts.Premium})</option>}
          {isPerFlow && counts.Downgrade > 0 && (
            <option value="Downgrade">⬇ Downgrade ({counts.Downgrade})</option>
          )}
          <option value="Covered">✅ Covered ({counts.Covered})</option>
        </select>
        {patternFilter.length > 0 && (
          <span className="active-pattern-filter">
            Pattern: <strong>{patternFilter.join(', ')}</strong>
            &nbsp;·&nbsp;{filtered.length} {filtered.length !== 1 ? entitiesLabel.toLowerCase() : entityLabel.toLowerCase()}
          </span>
        )}
        <button className="btn-export-small"
          onClick={() => exportUsersTable(sorted, fileType)}
          title="Export filtered users to Excel">
          📥 Export
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              {th(isPerFlow ? 'Flow ID' : 'Caller ID', 'callerId')}
              {th('Recommendation', 'recommendation')}
              {th('Analysis', 'frequencyLabel')}
              {th('Compliant', 'compliant')}
              {th('Peak Date', 'peakDate')}
              {th('Peak Daily Req', 'peakDailyRequests')}
              {th('Entitlement', 'maxEntitledQuantity')}
              {th('Capacity Gap', 'capacityGapRequests')}
              {!isPerFlow && th('Days>8k', 'daysOverStandard')}
              {th(isPerFlow ? 'Days>250k' : 'Days>40k', 'daysOverPremium')}
              {isPerFlow && th('Days<40k', 'daysUnderPremium')}
              {th('Process Lic.', 'totalProcessLicensesRequired')}
              {th('Incremental Proc.', 'incrementalProcessLicensesNeeded')}
              {th('Total Requests', 'totalRequests')}
              {th('Environments', 'environmentCount')}
            </tr>
          </thead>
          <tbody>
            {paged.map((u, i) => (
              <tr
                key={u.callerId + i}
                className={`clickable-row ${u.recommendation === 'Process' ? 'row-non-compliant' : u.recommendation === 'Premium' ? 'row-warning' : u.recommendation === 'Downgrade to Premium' ? 'row-downgrade' : ''}`}
                onClick={() => onSelectUser(u)}
                title={`Click to drill into ${isPerFlow ? 'flow' : 'user'} detail`}
              >
                <td title={u.callerId} className="caller-cell">{u.callerId}</td>
                <td>{recBadge(u.recommendation, u.compliant)}</td>
                <td className="insight-cell" title={u.frequencyInsight || undefined}>
                  {u.frequencyLabel ? (
                    <span className={`insight-label insight-${
                      u.frequencyLabel === 'License recommended' ? 'high'
                      : u.frequencyLabel === 'Moderate pattern' ? 'medium'
                      : u.frequencyLabel === 'Downgrade candidate' ? 'downgrade'
                      : 'low'
                    }`}>
                      {u.frequencyLabel}
                    </span>
                  ) : '—'}
                </td>
                <td>{u.compliant ? '✅' : '❌'}</td>
                <td>{u.peakDate}</td>
                <td className="num">{u.peakDailyRequests.toLocaleString()}</td>
                <td className="num">{u.maxEntitledQuantity.toLocaleString()}</td>
                <td className="num">{u.capacityGapRequests > 0 ? u.capacityGapRequests.toLocaleString() : '—'}</td>
                {!isPerFlow && (
                  <td className="num">
                    {u.daysOverStandard > 0 ? (
                      <span title={`Exceeded 8k on ${u.daysOverStandard} of ${u.totalDays} days`}
                        style={{ color: u.daysOverStandard >= 3 ? 'var(--amber)' : 'var(--text-muted)' }}>
                        {u.daysOverStandard}/{u.totalDays}
                      </span>
                    ) : '—'}
                  </td>
                )}
                <td className="num">
                  {u.daysOverPremium > 0 ? (
                    <span title={`Exceeded ${isPerFlow ? '250k' : '40k'} on ${u.daysOverPremium} of ${u.totalDays} days`}
                      style={{ color: u.daysOverPremium >= 3 ? 'var(--red)' : 'var(--amber)' }}>
                      {u.daysOverPremium}/{u.totalDays}
                    </span>
                  ) : '—'}
                </td>
                {isPerFlow && (
                  <td className="num">
                    {u.daysUnderPremium > 0 ? (
                      <span title={`Under 40k on ${u.daysUnderPremium} of ${u.totalDays} days — downgrade candidate`}
                        style={{ color: u.daysUnderPremium === u.totalDays ? '#58a6ff' : 'var(--text-muted)' }}>
                        {u.daysUnderPremium}/{u.totalDays}
                      </span>
                    ) : '—'}
                  </td>
                )}
                <td className="num">{u.totalProcessLicensesRequired || '—'}</td>
                <td className="num">{u.incrementalProcessLicensesNeeded || '—'}</td>
                <td className="num">{u.totalRequests.toLocaleString()}</td>
                <td className="num" title={u.environments}>{u.environmentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setPage(0)} disabled={page === 0}>«</button>
          <button onClick={() => setPage(p => p - 1)} disabled={page === 0}>‹</button>
          <span>Page {page + 1} of {totalPages} ({sorted.length} {entitiesLabel.toLowerCase()})</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>›</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>»</button>
        </div>
      )}
    </div>
  );
}
