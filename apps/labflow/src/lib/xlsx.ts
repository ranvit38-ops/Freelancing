import JSZip from 'jszip';

/**
 * Minimal .xlsx reader.
 *
 * An .xlsx is a zip of XML, and jszip is already here for PPTX export, so this
 * needs no spreadsheet library. It reads the first worksheet as a table of
 * strings — which is all the dataset layer wants, since it does its own type
 * detection and never trusts Excel's formatting.
 *
 * Deliberately not supported: formulas (the cached value is used), multiple
 * sheets (the first is read), merged cells, and dates are returned as Excel
 * serial numbers unless the file stores them as text.
 */

export class XlsxError extends Error {}

/** "A" → 0, "Z" → 25, "AA" → 26. */
export function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0];
  if (!letters) throw new XlsxError(`Unreadable cell reference: ${reference}`);
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

export function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITIES[code] ?? whole;
  });
}

/** Concatenates the <t> runs inside one shared-string or inline-string node. */
function textOf(xml: string): string {
  const parts = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? '');
  return decodeXml(parts.join(''));
}

function sharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? ''));
}

/** Reads the first worksheet into a rectangular array of cell strings. */
export async function readXlsxGrid(data: Buffer): Promise<string[][]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new XlsxError('This file is not a readable .xlsx workbook.');
  }

  const sheetPath = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()[0];
  if (!sheetPath) throw new XlsxError('No worksheet was found in this workbook.');

  const [sheetXml, sharedXml] = await Promise.all([
    zip.file(sheetPath)!.async('string'),
    zip.file('xl/sharedStrings.xml')?.async('string') ?? Promise.resolve(null),
  ]);
  const shared = sharedStrings(sharedXml);

  const grid: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1] ?? cellMatch[2] ?? '';
      const inner = cellMatch[3] ?? '';
      const reference = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="([^"]+)"/)?.[1];

      let value = '';
      if (type === 's') {
        const index = Number(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
        value = shared[index] ?? '';
      } else if (type === 'inlineStr') {
        value = textOf(inner);
      } else if (type === 'str') {
        value = decodeXml(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
      } else {
        value = decodeXml(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
      }

      // Honour the cell reference so gaps become empty cells, not shifted ones.
      const target = reference ? columnIndex(reference) : cells.length;
      while (cells.length < target) cells.push('');
      cells[target] = value;
    }
    grid.push(cells);
  }

  // Pad every row to the widest, so callers can index by column safely.
  const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
  return grid.map((row) => {
    while (row.length < width) row.push('');
    return row;
  });
}
