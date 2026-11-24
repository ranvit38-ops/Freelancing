import { sendRenewalReminders } from './billing-sync';

/**
 * The one scheduled job: reminders before yearly plans renew.
 *
 * Runs inside the server rather than as a separate cron service, checking a
 * few times a day. The query claims each reminder as it sends it, so a
 * restart, an overlap or a second server never sends one twice.
 */
const EVERY_MS = 6 * 60 * 60 * 1000;

let started = false;

export function startBillingClock() {
  if (started || !process.env.DATABASE_URL) return;
  started = true;
  const run = () =>
    sendRenewalReminders().then(
      (sent) => sent > 0 && console.info(`[labflow] sent ${sent} yearly renewal reminder${sent === 1 ? '' : 's'}`),
      (error: Error) => console.error(`[labflow] renewal reminders failed: ${error.message}`),
    );
  // Not at the very moment of boot, while migrations and the first requests settle.
  setTimeout(run, 2 * 60 * 1000).unref();
  setInterval(run, EVERY_MS).unref();
}
