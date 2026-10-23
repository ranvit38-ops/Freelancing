import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XlsxError, columnIndex, decodeXml, readXlsxGrid } from './xlsx';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '__fixtures__', name));

describe('columnIndex', () => {
  it('maps spreadsheet column letters to zero-based indexes', () => {
    expect(columnIndex('A1')).toBe(0);
    expect(columnIndex('Z9')).toBe(25);
    expect(columnIndex('AA1')).toBe(26);
    expect(columnIndex('AB100')).toBe(27);
  });

  it('rejects a reference with no column letters', () => {
    expect(() => columnIndex('12')).toThrow(XlsxError);
  });
});

describe('decodeXml', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeXml('a &amp; b &lt;c&gt; &#65; &#x42;')).toBe('a & b <c> A B');
  });
});

describe('readXlsxGrid', () => {
  it('reads a workbook written by a third-party writer', async () => {
    const grid = await readXlsxGrid(fixture('basic.xlsx'));
    expect(grid[0]).toEqual(['sample', 'conc_ppb', 'note']);
    expect(grid[1]).toEqual(['S-104', '12.5', 'ok']);
  });

  it('keeps an empty cell empty rather than shifting the row', async () => {
    const grid = await readXlsxGrid(fixture('basic.xlsx'));
    expect(grid[2]).toEqual(['S-105', '9.1', '']);
  });

  it('decodes escaped characters in shared strings', async () => {
    const grid = await readXlsxGrid(fixture('basic.xlsx'));
    expect(grid[3]?.[2]).toBe('below LOD & <check>');
  });

  it('preserves a gap in the middle of a row using the cell reference', async () => {
    const grid = await readXlsxGrid(fixture('gaps.xlsx'));
    expect(grid[0]).toEqual(['a', '', 'c']);
    expect(grid[1]).toEqual(['1', '', '3']);
  });

  it('pads every row to the same width', async () => {
    const grid = await readXlsxGrid(fixture('basic.xlsx'));
    const widths = new Set(grid.map((r) => r.length));
    expect(widths.size).toBe(1);
  });

  it('rejects a file that is not a workbook', async () => {
    await expect(readXlsxGrid(Buffer.from('not a zip'))).rejects.toBeInstanceOf(XlsxError);
  });
});
