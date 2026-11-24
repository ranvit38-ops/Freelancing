import { checkCompleteness, type CompletenessInput } from './completeness';

export type PulseMember = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  runsThisWeek: number;
  notesThisWeek: number;
  lastActive: Date | string | null;
};

export type PulseRow = PulseMember & {
  /** Started runs by this person with anything left on the checklist. */
  recordsToFill: number;
  /** Whole days since they last put anything in; null if they never have. */
  quietDays: number | null;
};

/** After this long with nothing recorded, a person is worth a word. */
export const QUIET_AFTER_DAYS = 7;

/**
 * The PI's one-glance view of the lab: per person, what they did this week,
 * how many of their records are thin, and how long since they last recorded
 * anything. Quietest first, so the people who need a nudge are at the top.
 */
export function pulseRows(
  members: PulseMember[],
  records: (CompletenessInput & { researcherId: string | null })[],
  now: Date,
): PulseRow[] {
  const thin = new Map<string, number>();
  for (const record of records) {
    if (!record.researcherId) continue;
    const report = checkCompleteness(record);
    if (report.documented < report.categories.length) {
      thin.set(record.researcherId, (thin.get(record.researcherId) ?? 0) + 1);
    }
  }
  return members
    .map((m) => {
      const last = m.lastActive ? new Date(m.lastActive) : null;
      return {
        ...m,
        recordsToFill: thin.get(m.id) ?? 0,
        quietDays: last ? Math.floor((now.getTime() - last.getTime()) / 86_400_000) : null,
      };
    })
    .sort((a, b) => quietness(b) - quietness(a));
}

function quietness(row: PulseRow): number {
  return row.quietDays === null ? Number.MAX_SAFE_INTEGER : row.quietDays;
}
