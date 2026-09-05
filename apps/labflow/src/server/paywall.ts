import { redirect } from 'next/navigation';
import { toSubscriptionState, usable, type SubscriptionState } from '@/lib/plans';
import { getSubscription } from './queries';
import type { SessionContext } from './auth';

/**
 * The paywall.
 *
 * Enforced server-side in the app layout and again in every write action, so
 * there is no client state to tamper with and no route to reach directly. The
 * billing and settings pages stay reachable — locking someone out of the page
 * where they would pay is the one mistake that guarantees they never do.
 */
export async function requireActiveWorkspace(session: SessionContext): Promise<SubscriptionState> {
  const state = toSubscriptionState(await getSubscription(session));
  // usable() already rejects null, but redirect()'s `never` is not narrowing
  // for the compiler here, so the check is explicit.
  if (!state || !usable(state)) redirect('/billing?locked=1');
  return state;
}

/** For write actions: returns an error string instead of redirecting. */
export async function blockedReason(session: SessionContext): Promise<string | null> {
  const state = toSubscriptionState(await getSubscription(session));
  if (usable(state)) return null;
  return 'This workspace has no active plan. Existing records stay readable — choose a plan to add or change anything.';
}
