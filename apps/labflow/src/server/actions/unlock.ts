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

  const { ok, retryAfterSec } = rateLimit(`unlock:${clientIp(headers())}`, {
    limit: 5,
    windowMs: 600_000,
  });
  if (!ok) {
    return { error: `Too many attempts. Try again in ${retryAfterSec} seconds.` };
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
    extraSeats: 0,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });

  console.info(
    `[labflow] owner code redeemed for workspace ${session.workspaceId} by ${session.userEmail}`,
  );
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Unlocked. This workspace now has the Department plan.' };
}
