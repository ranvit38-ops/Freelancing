'use server';

import { createHash, timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { requireSession } from '../authz';
import { applySubscriptionEvent } from '../queries';
import type { ActionState } from './types';

/**
 * Owner unlock: redeems a secret code to comp the current workspace.
 *
 * Built as a redeemable code rather than a password that anyone typing it gets
 * free access from:
 *  - It only exists when LABFLOW_OWNER_UNLOCK is set on the server, so there is
 *    no default and nothing to guess on a fresh deployment.
 *  - Comparison is constant-time over SHA-256 digests, so the code cannot be
 *    recovered a character at a time.
 *  - It is rate limited, so it cannot be brute-forced.
 *  - It requires a signed-in session and comps *that* workspace, so every
 *    redemption is attached to an account rather than floating free.
 */
export async function redeemOwnerCodeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();

  const expected = process.env.LABFLOW_OWNER_UNLOCK;
  if (!expected) {
    return { error: 'No owner code is configured on this deployment.' };
  }

  // The IP alone is not enough: some hosts pass a client-supplied
  // X-Forwarded-For through, and a fresh fake address per guess would reset
  // the count. The account and the whole server are limited too, so guessing
  // stays slow however the address is dressed up. The server-wide cap means a
  // determined guesser can make the owner wait ten minutes, never get in.
  const window = { windowMs: 600_000 };
  const blocked = [
    rateLimit(`unlock:user:${session.userId}`, { limit: 5, ...window }),
    rateLimit(`unlock:ip:${clientIp(headers())}`, { limit: 5, ...window }),
    rateLimit('unlock:all', { limit: 30, ...window }),
  ].find((check) => !check.ok);
  if (blocked) {
    return { error: `Too many attempts. Try again in ${blocked.retryAfterSec} seconds.` };
  }

  const supplied = String(formData.get('code') ?? '');
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(a, b)) {
    return { error: 'That code is not recognised.' };
  }

  // Comped: the top plan, with no Stripe subscription behind it.
  await applySubscriptionEvent({
    workspaceId: session.workspaceId,
    plan: 'department',
    status: 'active',
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });

  console.info(
    `[labflow] owner code redeemed for workspace ${session.workspaceId} by ${session.userEmail}`,
  );
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Unlocked. This lab now has the Department plan.' };
}
