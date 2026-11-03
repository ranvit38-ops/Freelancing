/** The option in every "who" picker that hands a task to the whole lab. */
export const EVERYONE = '__everyone__';

export type DueTone = 'overdue' | 'soon' | 'later' | 'none';

/**
 * How a deadline reads, relative to today.
 *
 * A date on its own makes people do arithmetic. "Due tomorrow" and "3 days
 * overdue" do not, and the overdue ones are the whole reason a lab looks at
 * the list. Both dates are YYYY-MM-DD, compared as calendar days so a task due
 * today is due today whatever the time.
 */
export function dueLabel(dueOn: string | null, today: string): { text: string; tone: DueTone } {
  if (!dueOn) return { text: 'No deadline', tone: 'none' };
  const days = Math.round(
    (Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (days < -1) return { text: `${-days} days overdue`, tone: 'overdue' };
  if (days === -1) return { text: 'Due yesterday', tone: 'overdue' };
  if (days === 0) return { text: 'Due today', tone: 'soon' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'soon' };
  if (days < 7) {
    const weekday = new Date(`${dueOn}T00:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    });
    return { text: `Due ${weekday}`, tone: 'soon' };
  }
  const date = new Date(`${dueOn}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return { text: `Due ${date}`, tone: 'later' };
}

/**
 * Soonest first, overdue at the very top, no deadline last.
 *
 * The order a person works through a list is the order it should be shown in.
 */
export function byDeadline<T extends { dueOn: string | null }>(a: T, b: T): number {
  if (a.dueOn === b.dueOn) return 0;
  if (a.dueOn === null) return 1;
  if (b.dueOn === null) return -1;
  return a.dueOn < b.dueOn ? -1 : 1;
}

/** Today as YYYY-MM-DD, in UTC so the server and the tests agree. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
