/**
 * Runs once when the server starts. Only the Node server has a database to
 * use; the import stays inside the check so the edge bundle never sees it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startBillingClock } = await import('./server/billing-clock');
    startBillingClock();
  }
}
