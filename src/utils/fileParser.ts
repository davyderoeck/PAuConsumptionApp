import * as XLSX from 'xlsx';
import type { RawApiRow, FileType } from '../types';

export interface ParseResult {
  rows: RawApiRow[];
  dateRange: string;
  totalRowCount: number;
  parseIssues: string[];
  fileType: FileType;
}

/**
 * Parse an uploaded CSV or Excel file into raw API request rows.
 * Supports two column layouts:
 *   Per-user:  Environment ID, Environment Name, Caller ID, Usage Datetime, Entitled Quantity, Power Automate Requests
 *   Per-flow:  Environment ID, Environment Name, Caller ID, Caller Type, Usage Datetime, Entitled Quantity, Consumed Quantity
 */
export async function parseFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<ParseResult> {
  onProgress?.(5);
  const isCSV = file.name.toLowerCase().endsWith('.csv');

  if (isCSV) {
    return parseCSV(file, onProgress);
  } else {
    return parseExcel(file, onProgress);
  }
}

async function parseCSV(
  file: File,
  onProgress?: (pct: number) => void
): Promise<ParseResult> {
  const text = await readFileAsText(file);
  onProgress?.(40);

  const lines = text.split(/\r?\n/);
  if (lines.length < 2) throw new Error('File is empty or has no data rows.');

  const header = parseCSVLine(lines[0]);
  const fileType = detectFileType(header);
  validateColumns(header, fileType);

  const colIdx = buildColumnIndex(header, fileType);
  const rows: RawApiRow[] = [];
  const issues: string[] = [];
  const total = lines.length;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = parseCSVLine(line);
    try {
      const row = buildRow(cells, colIdx, i + 1, fileType);
      if (row) rows.push(row);
    } catch (e) {
      issues.push(`Row ${i + 1}: ${(e as Error).message}`);
    }

    if (i % 5000 === 0) {
      onProgress?.(40 + Math.floor((i / total) * 50));
    }
  }

  onProgress?.(90);
  return {
    rows,
    dateRange: extractDateRange(file.name),
    totalRowCount: lines.length - 1,
    parseIssues: issues,
    fileType,
  };
}

async function parseExcel(
  file: File,
  onProgress?: (pct: number) => void
): Promise<ParseResult> {
  const buffer = await readFileAsArrayBuffer(file);
  onProgress?.(40);

  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
  onProgress?.(70);

  if (rawData.length === 0) throw new Error('No data rows found in file.');

  const header = Object.keys(rawData[0]);
  const fileType = detectFileType(header);
  validateColumns(header, fileType);
  const colIdx = buildColumnIndex(header, fileType);

  const rows: RawApiRow[] = [];
  const issues: string[] = [];

  for (let i = 0; i < rawData.length; i++) {
    const raw = rawData[i];
    const cells = header.map(h => String(raw[h] ?? ''));
    try {
      const row = buildRow(cells, colIdx, i + 2, fileType);
      if (row) rows.push(row);
    } catch (e) {
      issues.push(`Row ${i + 2}: ${(e as Error).message}`);
    }
  }

  onProgress?.(90);
  return {
    rows,
    dateRange: extractDateRange(file.name),
    totalRowCount: rawData.length,
    parseIssues: issues,
    fileType,
  };
}

interface ColIdx {
  environmentId: number;
  environmentName: number;
  callerId: number;
  callerType: number;          // -1 when absent (per-user files)
  usageDatetime: number;
  entitledQuantity: number;
  powerAutomateRequests: number; // maps to "Consumed Quantity" for per-flow
}

/** Detect whether the file is a per-user or per-flow export based on its columns */
function detectFileType(header: string[]): FileType {
  const has = (name: string) => header.some(h => h.trim().toLowerCase() === name.toLowerCase());
  // "Consumed Quantity" is the definitive per-flow column; "Caller Type" alone isn't enough
  // since some per-user exports also include it
  if (has('Consumed Quantity')) return 'per-flow';
  return 'per-user';
}

function buildColumnIndex(header: string[], fileType: FileType): ColIdx {
  const find = (name: string, optional = false) => {
    const idx = header.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
    if (idx === -1 && !optional) throw new Error(`Column "${name}" not found`);
    return idx;
  };

  if (fileType === 'per-flow') {
    return {
      environmentId: find('Environment ID'),
      environmentName: find('Environment Name'),
      callerId: find('Caller ID'),
      callerType: find('Caller Type', true),
      usageDatetime: find('Usage Datetime'),
      entitledQuantity: find('Entitled Quantity'),
      powerAutomateRequests: find('Consumed Quantity'),
    };
  }

  return {
    environmentId: find('Environment ID'),
    environmentName: find('Environment Name'),
    callerId: find('Caller ID'),
    callerType: -1,
    usageDatetime: find('Usage Datetime'),
    entitledQuantity: find('Entitled Quantity'),
    powerAutomateRequests: find('Power Automate Requests'),
  };
}

function validateColumns(header: string[], fileType: FileType): void {
  const required = fileType === 'per-flow'
    ? ['Environment ID', 'Environment Name', 'Caller ID', 'Usage Datetime', 'Entitled Quantity', 'Consumed Quantity']
    : ['Environment ID', 'Environment Name', 'Caller ID', 'Usage Datetime', 'Entitled Quantity', 'Power Automate Requests'];

  const missing = required.filter(
    col => !header.some(h => h.trim().toLowerCase() === col.toLowerCase())
  );
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }
}

function buildRow(cells: string[], idx: ColIdx, _rowNum: number, fileType: FileType): RawApiRow | null {
  const callerId = cells[idx.callerId]?.trim();
  if (!callerId) return null;

  const usageDate = parseDate(cells[idx.usageDatetime]?.trim());
  const entitledQuantity = parseInt(cells[idx.entitledQuantity]?.trim() || '0', 10);
  const powerAutomateRequests = parseInt(cells[idx.powerAutomateRequests]?.trim() || '0', 10);

  if (isNaN(entitledQuantity) || isNaN(powerAutomateRequests)) {
    throw new Error('Invalid numeric values');
  }

  const row: RawApiRow = {
    environmentId: cells[idx.environmentId]?.trim() || '',
    environmentName: cells[idx.environmentName]?.trim() || '',
    callerId,
    usageDate,
    entitledQuantity,
    powerAutomateRequests,
  };

  if (fileType === 'per-flow' && idx.callerType >= 0) {
    row.callerType = cells[idx.callerType]?.trim() || 'Flow';
  }

  return row;
}

/** Parse "dd/mm/yyyy HH:MM" or "mm/dd/yyyy HH:MM" → "YYYY-MM-DD" */
function parseDate(value: string): string {
  // Try slash-separated date
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const a = parseInt(match[1], 10);
    const b = parseInt(match[2], 10);
    const year = match[3];
    let day: number, month: number;
    if (b > 12) {
      // Second value can't be month → format is MM/DD/YYYY
      month = a; day = b;
    } else if (a > 12) {
      // First value can't be month → format is DD/MM/YYYY
      day = a; month = b;
    } else {
      // Ambiguous — default to MM/DD/YYYY (US / PPAC standard)
      month = a; day = b;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // Try ISO format already
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  throw new Error(`Unrecognized date format: "${value}"`);
}

/** Parse a single CSV line respecting quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function extractDateRange(filename: string): string {
  const match = filename.match(/(\d{4}_\d{2}_\d{2})_(\d{4}_\d{2}_\d{2})/);
  if (match) {
    return `${match[1].replace(/_/g, '-')} to ${match[2].replace(/_/g, '-')}`;
  }
  return 'Unknown period';
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file, 'utf-8');
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

