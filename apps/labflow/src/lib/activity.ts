/**
 * Pure helpers for the lab's activity log: what changed, and how it reads.
 */

type Comparable = string | number | boolean | Date | null | undefined;

function normalise(value: Comparable): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  return String(value).trim();
}

/**
 * The human names of the fields that differ between a record and its new
 * values. Only fields present in `next` are compared, so a partial update
 * never reports the fields it did not touch. Empty and missing are the same.
 */
export function changedFields(before: object, next: object, names: Record<string, string>): string[] {
  const was = before as Record<string, Comparable>;
  const now = next as Record<string, Comparable>;
  return Object.keys(now)
    .filter((key) => key in names && normalise(was[key]) !== normalise(now[key]))
    .map((key) => names[key]!);
}

/** A short, single-line excerpt for the log: enough to recognise, not the whole note. */
export function excerpt(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

export type ActivityRow = {
  createdAt: Date;
  actorName: string | null;
  action: string;
  subjectType: string;
  label: string;
  detail: string | null;
};

/** One spreadsheet row per entry, quoted so commas and line breaks survive. */
export function activityCsv(rows: ActivityRow[]): string {
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [['When (UTC)', 'Who', 'Did', 'What', 'Name', 'Detail'].join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString().replace('T', ' ').slice(0, 19),
        r.actorName ?? 'Former member',
        r.action,
        r.subjectType,
        r.label,
        r.detail ?? '',
      ]
        .map((v) => cell(v))
        .join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}
