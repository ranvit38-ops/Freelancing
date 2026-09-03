import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UnsupportedFormatError,
  describeColumn,
  formatStat,
  parseDelimitedText,
  parseSpreadsheet,
} from './dataset';

describe('describeColumn', () => {
  it('recognises a numeric column and computes descriptive statistics', () => {
    const col = describeColumn('conc', ['1', '2', '3', '4']);
    expect(col.isNumeric).toBe(true);
    expect(col.stats).toMatchObject({ count: 4, missing: 0, min: 1, max: 4, mean: 2.5 });
    // Sample standard deviation of 1,2,3,4 is 1.290994…
    expect(col.stats?.stdDev).toBeCloseTo(1.290994, 5);
  });

  it('does not call a column numeric when any value is text', () => {
    expect(describeColumn('c', ['1', '2', 'below LOD']).isNumeric).toBe(false);
  });

  it('counts blanks as missing rather than zero', () => {
    const col = describeColumn('c', ['1', '', '3']);
    expect(col.stats).toMatchObject({ count: 2, missing: 1, mean: 2 });
  });

  it('tolerates thousands separators and percentages', () => {
    expect(describeColumn('c', ['1,200', '800']).isNumeric).toBe(true);
    expect(describeColumn('c', ['95%', '99%']).stats?.max).toBe(99);
  });

  it('treats an entirely empty column as non-numeric', () => {
    const col = describeColumn('c', ['', '']);
    expect(col.isNumeric).toBe(false);
    expect(col.stats).toMatchObject({ count: 0, missing: 2 });
  });
});

describe('parseDelimitedText', () => {
  it('parses headers, rows and column types', () => {
    const table = parseDelimitedText('sample,conc_ppb,note\nS-104,12.5,ok\nS-105,9.1,\n');
    expect(table.columns.map((c) => c.name)).toEqual(['sample', 'conc_ppb', 'note']);
    expect(table.columns[1]?.isNumeric).toBe(true);
    expect(table.columns[0]?.isNumeric).toBe(false);
    expect(table.rows).toEqual([
      { sample: 'S-104', conc_ppb: '12.5', note: 'ok' },
      { sample: 'S-105', conc_ppb: '9.1', note: '' },
    ]);
  });

  it('rejects a file with no headers', () => {
    expect(() => parseDelimitedText('')).toThrow(UnsupportedFormatError);
  });
});

describe('formatStat', () => {
  it('rounds ordinary numbers and uses exponent notation at the extremes', () => {
    expect(formatStat(2.5)).toBe('2.5');
    expect(formatStat(1.23456)).toBe('1.235');
    expect(formatStat(0.00001)).toBe('1.00e-5');
    expect(formatStat(undefined)).toBe('—');
  });
});

describe('parseSpreadsheet', () => {
  const workbook = () => readFileSync(join(__dirname, '__fixtures__', 'basic.xlsx'));

  it('reads an .xlsx into the same shape a CSV produces', async () => {
    const table = await parseSpreadsheet(workbook());
    expect(table.columns.map((c) => c.name)).toEqual(['sample', 'conc_ppb', 'note']);
    expect(table.rows[0]).toEqual({ sample: 'S-104', conc_ppb: '12.5', note: 'ok' });
  });

  it('types spreadsheet columns the same way as CSV columns', async () => {
    const table = await parseSpreadsheet(workbook());
    expect(table.columns[1]?.isNumeric).toBe(true);
    expect(table.columns[0]?.isNumeric).toBe(false);
    expect(table.columns[1]?.stats?.max).toBe(12.5);
  });

  it('agrees with the CSV reader on the same data', async () => {
    const fromSheet = await parseSpreadsheet(workbook());
    const fromCsv = parseDelimitedText(
      'sample,conc_ppb,note\nS-104,12.5,ok\nS-105,9.1,\nS-106,0,below LOD & <check>\n',
    );
    expect(fromSheet.rows).toEqual(fromCsv.rows);
    expect(fromSheet.columns.map((c) => c.isNumeric)).toEqual(
      fromCsv.columns.map((c) => c.isNumeric),
    );
  });
});
