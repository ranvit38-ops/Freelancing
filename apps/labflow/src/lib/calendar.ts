/**
 * Month arithmetic for the lab calendar, on YYYY-MM-DD strings.
 *
 * Kept in UTC and on plain date strings throughout: a lab meeting is on a day,
 * not at an instant, and doing this with local Date objects is how "Thursday"
 * turns into Wednesday for whoever is reading from another timezone.
 */

export type Month = { year: number; month: number }; // month is 1-12

export function parseMonth(value: string | undefined, fallback: string): Month {
  const m = (value ?? '').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  return { year: Number(fallback.slice(0, 4)), month: Number(fallback.slice(5, 7)) };
}

export function monthKey({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function shiftMonth({ year, month }: Month, by: number): Month {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthName({ year, month }: Month): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Every day shown on the month's grid: whole weeks, Monday first, from the
 * week containing the 1st to the week containing the last day. Four to six
 * rows, never a trailing row of next month.
 */
export function monthGrid({ year, month }: Month): string[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + (6 - ((last.getUTCDay() + 6) % 7)));

  const days: string[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) days.push(iso(d));
  return days;
}

/** "2:00 PM" from "14:00", for display only; stored as written. */
export function displayTime(atTime: string | null): string {
  if (!atTime) return 'All day';
  const [h, m] = atTime.split(':').map(Number);
  const suffix = h! >= 12 ? 'PM' : 'AM';
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}
