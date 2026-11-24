import type { ParsedTable } from './dataset';
import { formatStat } from './dataset';
import { normaliseSampleCode } from './normalise';

/**
 * Reading an experiment out of the files a researcher already has.
 *
 * The blank experiment form is the moment people give up. They have the data
 * — a CSV off the instrument, a spreadsheet of conditions — and the form asks
 * them to type all of it again in a different shape. So: drop the files, get
 * the form filled in, correct what is wrong.
 *
 * Everything here is derived, not generated. No model is asked to invent an
 * objective, because an invented objective is worse than a blank one: it
 * reads plausibly, gets accepted without reading, and ends up in a thesis.
 * What this does is read what is demonstrably in the file — its name, its
 * date, which columns never vary, what the numbers span — and say where each
 * value came from so the researcher can judge it in one glance.
 */

export type DraftCondition = { name: string; value: string; unit: string | null };

export type ExperimentDraft = {
  title: string | null;
  performedOn: string | null;
  conditions: DraftCondition[];
  sampleCodes: string[];
  observations: string | null;
  /** One line per thing that was read, shown to the researcher verbatim. */
  source: string[];
};

export type DraftInput = { filename: string; table: ParsedTable | null };

/** Column names that hold a sample identifier rather than a measurement. */
const SAMPLE_COLUMNS = /^(sample|sample[ _-]?id|sample[ _-]?code|specimen|id|code)$/i;

/** Units written into a column header, as "mass (mg)" or "temp [C]". */
const UNIT_IN_HEADER = /[([]([^)\]]{1,12})[)\]]\s*$/;

const DATE_PATTERNS: { re: RegExp; iso: (m: RegExpMatchArray) => string }[] = [
  // 2024-06-12 or 2024_06_12
  { re: /(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/, iso: (m) => `${m[1]}-${m[2]}-${m[3]}` },
  // 12-06-2024, day first, which is what most of the world writes
  { re: /(0[1-9]|[12]\d|3[01])[-_.](0[1-9]|1[0-2])[-_.](20\d{2})/, iso: (m) => `${m[3]}-${m[2]}-${m[1]}` },
];

/** The date written into a filename, if there is one. */
export function dateFromFilename(filename: string): string | null {
  for (const { re, iso } of DATE_PATTERNS) {
    const match = filename.match(re);
    if (match) {
      const value = iso(match);
      // A pattern can match digits that are not a date at all (a serial
      // number, a concentration). Parsing back is the cheapest way to tell.
      const parsed = new Date(`${value}T00:00:00Z`);
      if (!Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() <= new Date().getUTCFullYear() + 1) {
        return value;
      }
    }
  }
  return null;
}

/**
 * A readable title from a filename.
 *
 * "2024-06-12_pfas_sorption_run3_FINAL_v2.csv" is a real filename and
 * "PFAS sorption run3" is what the experiment is called. Dates and the
 * final/v2/copy debris carry no meaning into the record.
 */
export function titleFromFilename(filename: string): string | null {
  let stem = filename.replace(/\.[a-z0-9]{1,6}$/i, '');
  for (const { re } of DATE_PATTERNS) stem = stem.replace(re, ' ');

  const words = stem
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w !== '' && !/^(final|copy|v\d+|rev\d*|draft|new|untitled|data|export)$/i.test(w));

  if (words.length === 0) return null;

  // An all-caps word is an acronym a researcher chose (PFAS, HPLC, qPCR) and
  // title-casing it would be wrong. Everything else gets a leading capital.
  const title = words
    .map((w, i) => (w === w.toUpperCase() && w.length > 1 ? w : i === 0 ? capitalise(w) : w))
    .join(' ');
  return title.slice(0, 200);
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Splits "mass (mg)" into its name and its unit. */
export function splitUnit(header: string): { name: string; unit: string | null } {
  const match = header.match(UNIT_IN_HEADER);
  if (!match) return { name: header.trim(), unit: null };
  return { name: header.slice(0, match.index).trim() || header.trim(), unit: match[1]!.trim() };
}

/**
 * Builds the draft.
 *
 * The one real idea here: **a column that never changes is a condition, not a
 * measurement.** A file with `temperature` at 25 on all ninety rows is telling
 * you the run was done at 25 degrees. That is exactly the metadata that never
 * gets recorded and that makes a result impossible to interpret two years
 * later, and it is sitting in the file already.
 */
export function buildDraft(inputs: DraftInput[]): ExperimentDraft {
  const source: string[] = [];
  const conditions = new Map<string, DraftCondition>();
  const sampleCodes = new Set<string>();
  const observations: string[] = [];

  const named = inputs.filter((i) => i.filename.trim() !== '');
  const first = named[0];

  const title = first ? titleFromFilename(first.filename) : null;
  if (title) source.push(`Name taken from ${first!.filename}`);

  let performedOn: string | null = null;
  for (const input of named) {
    performedOn = dateFromFilename(input.filename);
    if (performedOn) {
      source.push(`Date ${performedOn} read from ${input.filename}`);
      break;
    }
  }

  for (const { filename, table } of inputs) {
    if (!table || table.rows.length === 0) continue;

    for (const column of table.columns) {
      const values = table.rows.map((r) => r[column.name] ?? '').filter((v) => v.trim() !== '');
      if (values.length === 0) continue;

      if (SAMPLE_COLUMNS.test(column.name.trim())) {
        for (const value of values) sampleCodes.add(normaliseSampleCode(value));
        continue;
      }

      const distinct = new Set(values);
      // Constant across every row, and more than one row to be constant over.
      if (distinct.size === 1 && values.length > 1) {
        const { name, unit } = splitUnit(column.name);
        // A file listed twice must not produce the condition twice.
        if (!conditions.has(name.toLowerCase())) {
          conditions.set(name.toLowerCase(), { name, value: [...distinct][0]!, unit });
        }
        continue;
      }

      if (column.isNumeric && column.stats) {
        const { name, unit } = splitUnit(column.name);
        const suffix = unit ? ` ${unit}` : '';
        observations.push(
          `${name}: ${column.stats.count} values, ${formatStat(column.stats.min)}${suffix} to ${formatStat(column.stats.max)}${suffix}, mean ${formatStat(column.stats.mean)}${suffix}.`,
        );
      }
    }

    source.push(
      `${filename}: ${table.rows.length} row${table.rows.length === 1 ? '' : 's'}, ${table.columns.length} column${table.columns.length === 1 ? '' : 's'}${table.truncated ? ' (truncated)' : ''}`,
    );
  }

  const conditionList = [...conditions.values()].slice(0, 20);
  if (conditionList.length > 0) {
    source.push(
      `${conditionList.length} column${conditionList.length === 1 ? '' : 's'} never changed, so ${conditionList.length === 1 ? 'it was read as a condition' : 'they were read as conditions'}`,
    );
  }
  if (sampleCodes.size > 0) source.push(`${sampleCodes.size} sample codes found`);

  return {
    title,
    performedOn,
    conditions: conditionList,
    sampleCodes: [...sampleCodes].slice(0, 200),
    observations: observations.length > 0 ? observations.join('\n') : null,
    source,
  };
}

/** True when there was nothing worth filling in, so the UI can say so plainly. */
export function draftIsEmpty(draft: ExperimentDraft): boolean {
  return (
    draft.title === null &&
    draft.performedOn === null &&
    draft.conditions.length === 0 &&
    draft.sampleCodes.length === 0 &&
    draft.observations === null
  );
}
