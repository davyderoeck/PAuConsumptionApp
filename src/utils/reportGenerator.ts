import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { ClassifiedUser, SellerSummary } from '../types';

const DETAIL_COLUMNS: Array<[keyof ClassifiedUser, string]> = [
  ['callerId', 'Caller ID'],
  ['recommendation', 'Recommendation'],
  ['compliant', 'Compliant'],
  ['totalRequests', 'Total Requests'],
  ['peakDate', 'Peak Date'],
  ['peakDailyRequests', 'Peak Daily Requests'],
  ['peakDayEntitlement', 'Peak Day Entitlement'],
  ['maxEntitledQuantity', 'Max Entitled Quantity'],
  ['effectiveObservedCapacity', 'Effective Observed Capacity'],
  ['capacityGapRequests', 'Capacity Gap Requests'],
  ['additionalPremiumRequired', 'Additional Premium Required'],
  ['totalProcessLicensesRequired', 'Total Process Licenses Required'],
  ['incrementalProcessLicensesNeeded', 'Incremental Process Licenses Needed'],
  ['environmentCount', 'Environment Count'],
  ['environments', 'Environments'],
];

/**
 * Generate and download an Excel workbook matching the Python script output.
 * Sheets: Seller Summary, User Detail, Top 20 Premium, Top 10 Process, Opportunity Value, Assumptions
 */
export function generateReport(summary: SellerSummary, users: ClassifiedUser[], currency = 'USD'): void {
  const wb = XLSX.utils.book_new();

  addSellerSummarySheet(wb, summary, currency);
  addDetailSheet(wb, 'User Detail', users);

  const premiumUsers = users.filter(u => u.additionalPremiumRequired > 0)
    .sort((a, b) => b.peakDailyRequests - a.peakDailyRequests || b.totalRequests - a.totalRequests)
    .slice(0, 20);
  addDetailSheet(wb, 'Top 20 Premium', premiumUsers);

  const processUsers = users.filter(u => u.totalProcessLicensesRequired > 0)
    .sort((a, b) => b.totalProcessLicensesRequired - a.totalProcessLicensesRequired || b.peakDailyRequests - a.peakDailyRequests)
    .slice(0, 10);
  addDetailSheet(wb, 'Top 10 Process', processUsers);

  addOpportunitySheet(wb, summary, currency);
  addAssumptionsSheet(wb);

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const timestamp = new Date().toISOString().slice(0, 10);
  saveAs(blob, `PAu_Consumption_Report_${timestamp}.xlsx`);
}

function addSellerSummarySheet(wb: XLSX.WorkBook, s: SellerSummary, currency: string): void {
  const rows = [
    ['Metric', 'Value'],
    ['Users analyzed', s.usersAnalyzed],
    ['Compliant users', s.compliantUsers],
    ['Non-compliant users', s.nonCompliantUsers],
    ['Users missing Premium', s.usersMissingPremium],
    ['Additional Premium licenses required', s.additionalPremiumLicensesRequired],
    ['Users needing Process licensing', s.usersNeedingProcessLicenses],
    ['Total Process licenses required', s.totalProcessLicensesRequired],
    ['Incremental Process licenses for compliance', s.incrementalProcessLicensesForCompliance],
    [`Monthly opportunity estimate (${currency})`, s.monthlyOpportunityUsd],
    [`Annual opportunity estimate (${currency})`, s.annualOpportunityUsd],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 45 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Seller Summary');
}

function addDetailSheet(wb: XLSX.WorkBook, sheetName: string, users: ClassifiedUser[]): void {
  const header = DETAIL_COLUMNS.map(([, label]) => label);
  const rows = users.map(u =>
    DETAIL_COLUMNS.map(([key]) => {
      const val = u[key];
      if (key === 'compliant') return val ? 'Yes' : 'No';
      return val;
    })
  );
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = DETAIL_COLUMNS.map(([key]) =>
    key === 'callerId' || key === 'environments' ? { wch: 38 } : { wch: 22 }
  );
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

function addOpportunitySheet(wb: XLSX.WorkBook, s: SellerSummary, currency: string): void {
  const rows = [
    ['Metric', 'Value'],
    [`Premium list price per month (${currency})`, s.premiumPriceMonthly],
    [`Process list price per month (${currency})`, s.processPriceMonthly],
    ['Additional Premium licenses required', s.additionalPremiumLicensesRequired],
    ['Total Process licenses required', s.totalProcessLicensesRequired],
    [`Monthly opportunity estimate (${currency})`, s.monthlyOpportunityUsd],
    [`Annual opportunity estimate (${currency})`, s.annualOpportunityUsd],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 38 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Opportunity Value');
}

function addAssumptionsSheet(wb: XLSX.WorkBook): void {
  const rows = [
    ['Assumption'],
    ['Peak daily consumption is the sum of every row for the same user and calendar date across all environments.'],
    ['Premium shortfall applies only to users with more than 8,000 and at most 40,000 requests on their peak day when observed entitlement is below 40,000.'],
    ['Process-license requirement applies to users whose peak day exceeds 40,000 requests.'],
    ['Total Process licenses required are calculated as ceiling(peak_daily_requests / 250,000).'],
    ['Incremental Process licenses for compliance compare observed entitlement capacity against the peak day.'],
    ['Public-price defaults are seller guidance only and can be overridden.'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Assumptions');
}

/**
 * Export the summary overview (KPIs + pattern breakdown) as Excel
 */
export function exportSummaryOverview(
  summary: SellerSummary,
  users: ClassifiedUser[],
  premiumPrice: number,
  processPrice: number,
  currency: string,
): void {
  const wb = XLSX.utils.book_new();

  const monthlyOpp = summary.additionalPremiumLicensesRequired * premiumPrice + summary.totalProcessLicensesRequired * processPrice;
  const kpiRows = [
    ['Metric', 'Value'],
    ['Users Analyzed', summary.usersAnalyzed],
    ['Compliant Users', summary.compliantUsers],
    ['Non-Compliant Users', summary.nonCompliantUsers],
    ['Users Missing Premium', summary.usersMissingPremium],
    ['Additional Premium Licenses Required', summary.additionalPremiumLicensesRequired],
    ['Users Needing Process Licensing', summary.usersNeedingProcessLicenses],
    ['Total Process Licenses Required', summary.totalProcessLicensesRequired],
    [`Premium Price/mo (${currency})`, premiumPrice],
    [`Process Price/mo (${currency})`, processPrice],
    [`Monthly Opportunity (${currency})`, monthlyOpp],
    [`Annual Opportunity (${currency})`, monthlyOpp * 12],
    ['Period', summary.dateRange],
  ];
  const kpiWs = XLSX.utils.aoa_to_sheet(kpiRows);
  kpiWs['!cols'] = [{ wch: 42 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, kpiWs, 'Summary KPIs');

  type PatternKey = 'License recommended' | 'Moderate pattern' | 'Occasional spike' | 'Monitor first' | 'Downgrade candidate' | 'Compliant';
  const PATTERN_ORDER: PatternKey[] = ['License recommended', 'Moderate pattern', 'Occasional spike', 'Monitor first', 'Downgrade candidate', 'Compliant'];
  const byPattern: Record<string, ClassifiedUser[]> = {};
  for (const key of PATTERN_ORDER) byPattern[key] = [];
  for (const u of users) {
    const key = u.frequencyLabel || 'Compliant';
    if (byPattern[key]) byPattern[key].push(u);
    else byPattern['Compliant'].push(u);
  }

  const breakdownHeader = ['Usage Pattern', 'Users', 'Premium Lic.', `Premium Cost/mo (${currency})`, 'Process Lic.', `Process Cost/mo (${currency})`, `Monthly Total (${currency})`, `Annual Total (${currency})`];
  const breakdownRows: (string | number)[][] = [breakdownHeader];
  let totPrem = 0, totProc = 0, totMonth = 0;
  for (const key of PATTERN_ORDER) {
    const group = byPattern[key];
    if (group.length === 0) continue;
    const premLic = group.reduce((s, u) => s + u.additionalPremiumRequired, 0);
    const procLic = group.reduce((s, u) => s + u.totalProcessLicensesRequired, 0);
    const monthly = premLic * premiumPrice + procLic * processPrice;
    breakdownRows.push([key, group.length, premLic, premLic * premiumPrice, procLic, procLic * processPrice, monthly, monthly * 12]);
    totPrem += premLic; totProc += procLic; totMonth += monthly;
  }
  breakdownRows.push(['Total', users.length, totPrem, totPrem * premiumPrice, totProc, totProc * processPrice, totMonth, totMonth * 12]);

  const bdWs = XLSX.utils.aoa_to_sheet(breakdownRows);
  bdWs['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, bdWs, 'Pattern Breakdown');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const timestamp = new Date().toISOString().slice(0, 10);
  saveAs(blob, `PAu_Summary_Overview_${timestamp}.xlsx`);
}

/**
 * Export the users/flows table (with current filters applied) as Excel
 */
export function exportUsersTable(users: ClassifiedUser[], fileType: string): void {
  const wb = XLSX.utils.book_new();
  addDetailSheet(wb, fileType === 'per-flow' ? 'Flow Detail' : 'User Detail', users);

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const timestamp = new Date().toISOString().slice(0, 10);
  saveAs(blob, `PAu_${fileType === 'per-flow' ? 'Flows' : 'Users'}_${timestamp}.xlsx`);
}
