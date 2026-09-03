import Papa from 'papaparse';
import { readXlsxGrid } from './xlsx';

/**
 * Tabular import.
 *
 * This layer only describes what is in the file — column names, types, and
 * descriptive statistics. It never infers a scientific claim from the numbers;
 * that is the researcher's job, and the AI layer's output is labelled separately.
 */

export type ColumnStats = {
  count: number;
  missing: number;
  min?: number;
  max?: number;
  mean?: number;
  stdDev?: number;
};

export type ParsedColumn = { name: string; isNumeric: boolean; stats: ColumnStats | null };

export type ParsedTable = {
  columns: ParsedColumn[];
  rows: Record<string, string>[];
  truncated: boolean;
};

/** Rows kept inline with the dataset record; the original file is authoritative. */
const MAX_STORED_ROWS = 5000;

export class UnsupportedFormatError extends Error {}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  // Tolerate thousands separators and a trailing percent sign.
  const cleaned = trimmed.replace(/,/g, '').replace(/%$/, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function describeColumn(name: string, values: string[]): ParsedColumn {
  const present = values.filter((v) => v.trim() !== '');
  const missing = values.length - present.length;
  const numbers = present.map(toNumber).filter((n): n is number => n !== null);

  // A column counts as numeric only if essentially all its values parse.
  const isNumeric = present.length > 0 && numbers.length === present.length;
  if (!isNumeric) {
    return { name, isNumeric: false, stats: { count: present.length, missing } };
  }

  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const variance =
    numbers.length > 1
      ? numbers.reduce((acc, n) => acc + (n - mean) ** 2, 0) / (numbers.length - 1)
      : 0;

  return {
    name,
    isNumeric: true,
    stats: {
      count: numbers.length,
      missing,
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      mean,
      stdDev: Math.sqrt(variance),
    },
  };
}

/** Shared by the CSV and spreadsheet readers: header row + typed columns. */
function tableFromRows(names: string[], allRows: Record<string, string>[]): ParsedTable {
  const rows = allRows.slice(0, MAX_STORED_ROWS);
  const columns = names.map((name) => describeColumn(name, allRows.map((r) => r[name] ?? '')));
  return { columns, rows, truncated: allRows.length > rows.length };
}

/** Parses CSV/TSV text into rows plus per-column descriptions. */
export function parseDelimitedText(text: string): ParsedTable {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const names = (result.meta.fields ?? []).filter((f) => f.trim() !== '');
  if (names.length === 0) throw new UnsupportedFormatError('No column headers found in this file.');

  const allRows = result.data.map((row) => {
    const clean: Record<string, string> = {};
    for (const name of names) clean[name] = String(row[name] ?? '');
    return clean;
  });

  return tableFromRows(names, allRows);
}

/**
 * Parses the first worksheet of an .xlsx workbook. The first row is the header;
 * everything below it is read as text and typed by describeColumn, exactly as
 * for CSV, so a spreadsheet and its CSV export produce the same dataset.
 */
export async function parseSpreadsheet(data: Buffer): Promise<ParsedTable> {
  const grid = await readXlsxGrid(data);
  const header = grid[0] ?? [];
  const names = header.map((name, i) => name.trim() || `Column ${i + 1}`);
  if (names.length === 0) throw new UnsupportedFormatError('No column headers found in this file.');

  const allRows = grid
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => {
      const record: Record<string, string> = {};
      names.forEach((name, i) => {
        record[name] = row[i] ?? '';
      });
      return record;
    });

  return tableFromRows(names, allRows);
}

/** Formats a statistic for display without pretending to more precision. */
export function formatStat(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 0.001 || abs >= 1_000_000)) return value.toExponential(2);
  return String(Math.round(value * 1000) / 1000);
}
