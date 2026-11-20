/**
 * Reading many entries typed or pasted at once, so nothing has to be entered
 * one box at a time: condition rows copied from a spreadsheet, a list of
 * sample IDs, a list of email addresses.
 *
 * Pure functions; the forms decide what to do with the result.
 */

export type ConditionLine = { name: string; value: string; unit: string };

/** No form needs more than this many from one paste. */
export const MAX_BULK = 500;

const NUMBER = /^(-?\d[\d.,]*(?:e[-+]?\d+)?)\s*(.*)$/i;

/** "25 °C" -> ["25", "°C"]; "high" -> ["high", ""]. */
function valueAndUnit(text: string): [string, string] {
  const t = text.trim();
  const m = t.match(NUMBER);
  return m ? [m[1]!, m[2]!.trim()] : [t, ''];
}

function isHeader(cells: string[]): boolean {
  const first = cells[0]?.toLowerCase() ?? '';
  const second = cells[1]?.toLowerCase() ?? '';
  return /^(condition|name|parameter|variable)s?$/.test(first) && /^values?$/.test(second);
}

/**
 * Condition rows from pasted text, one per line. Understands spreadsheet
 * columns (name, value, unit), "Temperature: 25 °C", "pH = 7.4" and
 * "Time 30 min". A header row copied with the data is skipped.
 */
export function parseConditionLines(text: string): ConditionLine[] {
  const rows: ConditionLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let row: ConditionLine;
    if (raw.includes('\t')) {
      const cells = raw.split('\t').map((c) => c.trim());
      if (rows.length === 0 && isHeader(cells)) continue;
      const [name = '', value = '', unit = ''] = cells;
      row = cells.length >= 3 ? { name, value, unit } : { name, ...split(value) };
    } else {
      const named = line.match(/^(.+?)\s*[:=]\s*(.+)$/);
      if (named) {
        row = { name: named[1]!.trim(), ...split(named[2]!) };
      } else {
        const spaced = line.match(/^(.+?)\s+(-?\d[\d.,]*(?:e[-+]?\d+)?)\s*(.*)$/i);
        row = spaced
          ? { name: spaced[1]!.trim(), value: spaced[2]!, unit: spaced[3]!.trim() }
          : { name: line, value: '', unit: '' };
      }
    }
    rows.push(row);
    if (rows.length >= MAX_BULK) break;
  }
  return rows;
}

function split(text: string): { value: string; unit: string } {
  const [value, unit] = valueAndUnit(text);
  return { value, unit };
}

/** True when pasted text holds more than one entry and should be spread out. */
export function isMultiEntry(text: string): boolean {
  return /\r?\n/.test(text.trim()) || text.includes('\t');
}

/**
 * "S-101 to S-120", "S-101..S-120" or "S-101–S-120": every ID in between,
 * keeping the first one's zero padding. Anything else is returned as is.
 */
export function expandRange(entry: string): string[] {
  const m = entry.trim().match(/^(.*?)(\d+)\s*(?:to|\.\.|–|—|\s-\s)\s*(.*?)(\d+)$/i);
  if (!m) return [entry.trim()];
  const [, prefix, from, otherPrefix, to] = m as unknown as [string, string, string, string, string];
  if (otherPrefix && otherPrefix !== prefix) return [entry.trim()];
  const start = Number(from);
  const end = Number(to);
  if (end < start || end - start >= MAX_BULK) return [entry.trim()];
  const width = from.startsWith('0') ? from.length : 0;
  const out: string[] = [];
  for (let n = start; n <= end; n += 1) out.push(`${prefix}${String(n).padStart(width, '0')}`);
  return out;
}

/**
 * Sample IDs from a list: one per line or comma separated, ranges expanded,
 * repeats dropped. From a spreadsheet, the first column is the ID.
 */
export function parseSampleIdList(text: string): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  const entries = text.includes('\t')
    ? text.split(/\r?\n/).map((line) => line.split('\t')[0]!)
    : text.split(/[\n\r,;]+/);
  for (const entry of entries) {
    if (!entry.trim()) continue;
    for (const code of expandRange(entry)) {
      const key = code.toLowerCase();
      if (!code || seen.has(key)) continue;
      seen.add(key);
      codes.push(code);
      if (codes.length >= MAX_BULK) return codes;
    }
  }
  return codes;
}

/**
 * Task titles, one per line, as notes from a meeting usually are: bullets,
 * numbers and checkboxes in front of a line are dropped.
 */
export function parseTaskLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 50);
}

/**
 * Email addresses from a list separated by commas, semicolons, spaces or new
 * lines, including "Name <name@uni.edu>" as copied from a mail client.
 * Lower-cased, repeats dropped.
 */
export function parseEmails(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,;]+/)) {
    const email = part.replace(/^[<("']+|[>)"'.]+$/g, '').toLowerCase();
    if (email.includes('@')) seen.add(email);
  }
  return [...seen].slice(0, MAX_BULK);
}
