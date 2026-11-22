import { digestEmail, emailDue, isPace, parseKinds, type Pace } from '@/lib/notify';
import { absoluteUrl, mailConfigured, sendEmail } from './mailer';
import * as q from './queries';

/**
 * Sends the batched notification emails that are due.
 *
 * Runs from the cron route (Render Cron Job, every 15 minutes) and, so a
 * small deployment works without one, after ordinary requests at most once a
 * minute per server. Safe to run twice at once: each person's batch is
 * marked as emailed straight after it is sent, and the pace window then
 * holds the next one back.
 */

/** Minutes an item waits unread before it can be emailed: if you are in the app, you saw it. */
export function emailDelayMinutes(): number {
  const raw = Number(process.env.LABFLOW_NOTIFY_DELAY_MINUTES);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
}

export async function sendDueNotificationEmails(now = new Date()): Promise<{ sent: number; people: number }> {
  if (!mailConfigured()) return { sent: 0, people: 0 };
  const pending = await q.pendingNotificationEmails();
  const byUser = new Map<string, typeof pending>();
  for (const row of pending) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);

  let sent = 0;
  for (const [userId, rows] of byUser) {
    const first = rows[0]!;
    const pace: Pace = isPace(first.pace) ? first.pace : 'hourly';
    const kinds = parseKinds(first.kinds);
    // Kinds the person turned off, or everything when email is off, are
    // settled as handled so they never come out later in a burst.
    const muted = rows.filter((r) => pace === 'off' || !kinds.includes(r.kind as never));
    if (muted.length) await q.markNotificationsEmailed(userId, muted.map((r) => r.id), false);
    const wanted = rows.filter((r) => !muted.includes(r));
    if (!wanted.length) continue;
    const due = emailDue({ pace, lastEmailedAt: first.lastEmailedAt, oldestPending: wanted[0]!.createdAt, now, delayMinutes: emailDelayMinutes() });
    if (!due) continue;

    let settingsLink: string;
    let links: string[];
    try {
      settingsLink = absoluteUrl('/settings#notifications');
      links = wanted.map((r) => absoluteUrl(`/notifications/${r.id}`));
    } catch (error) {
      console.warn(`[labflow] notification email not sent: ${(error as Error).message}`);
      return { sent, people: byUser.size };
    }
    const email = digestEmail({
      name: first.name,
      pace,
      settingsLink,
      items: wanted.map((r, i) => ({ labName: r.labName, title: r.title, body: r.body, link: links[i]!, createdAt: r.createdAt })),
    });
    try {
      await sendEmail({ to: first.email, ...email });
      await q.markNotificationsEmailed(userId, wanted.map((r) => r.id), true);
      sent++;
    } catch (error) {
      // Left pending: the next run tries again.
      console.warn(`[labflow] notification email to ${first.email} not sent: ${(error as Error).message}`);
    }
  }
  return { sent, people: byUser.size };
}

let lastRun = 0;

/** After a request: runs the job at most once a minute per server, never in the way. */
export function nudgeNotificationEmails(): void {
  const now = Date.now();
  if (now - lastRun < 60_000) return;
  lastRun = now;
  void sendDueNotificationEmails().catch((error: Error) => console.warn(`[labflow] notification email job failed: ${error.message}`));
}
