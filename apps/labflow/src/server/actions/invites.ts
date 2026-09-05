'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { normaliseEmail } from '@/lib/normalise';
import { seatLimit, seatsRemaining, toSubscriptionState, usable } from '@/lib/plans';
import { MailNotConfiguredError, absoluteUrl, mailConfigured, sendEmail } from '../mailer';
import { requireSession } from '../authz';
import * as q from '../queries';
import type { ActionState } from './types';

const INVITE_DAYS = 14;

/**
 * Invites someone to the current workspace.
 *
 * The link carries the token; only its hash is stored, so a database leak
 * cannot be used to join a lab. When no mail provider is configured the link is
 * returned to the inviter to pass on themselves, rather than silently vanishing.
 */
export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  if (session.role === 'member') {
    return { error: 'Only an owner or admin can invite people to this workspace.' };
  }

  const email = normaliseEmail(String(formData.get('email') ?? ''));
  if (!email.includes('@') || email.length < 5) {
    return { fieldErrors: { email: 'Enter a valid email address' } };
  }
  const role = formData.get('role') === 'admin' ? 'admin' : 'member';

  // A seat is consumed by a member or by an invite that has not been accepted.
  const [row, usage] = await Promise.all([q.getSubscription(session), q.seatUsage(session)]);
  const subscription = toSubscriptionState(row);
  if (!usable(subscription)) {
    return { error: 'This workspace needs an active plan before you can invite people.' };
  }
  if (seatsRemaining(subscription, usage.members, usage.pending) < 1) {
    return {
      error: `All ${seatLimit(subscription)} seats on this plan are taken. Upgrade, or revoke a pending invitation, to add someone.`,
    };
  }

  const token = randomBytes(32).toString('base64url');
  await q.createInvite(session, {
    email,
    role,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  });

  const link = absoluteUrl(`/join?token=${token}`);
  revalidatePath('/settings');

  if (!mailConfigured()) {
    return {
      ok: true,
      message: `Email is not configured on this deployment, so nothing was sent. Send them this link yourself: ${link}`,
    };
  }

  try {
    await sendEmail({
      to: email,
      subject: `${session.userName} invited you to ${session.workspaceName} on LabFlow`,
      text: [
        `${session.userName} has invited you to join ${session.workspaceName} on LabFlow.`,
        '',
        'Open this link to accept (it expires in two weeks):',
        link,
        '',
        'If you were not expecting this, you can ignore it.',
      ].join('\n'),
    });
  } catch (error) {
    if (error instanceof MailNotConfiguredError) {
      return { ok: true, message: `${error.message} Send them this link yourself: ${link}` };
    }
    return { error: 'The invitation could not be sent. The invite is saved — try resending.' };
  }

  return { ok: true, message: `Invitation sent to ${email}.` };
}

export async function revokeInviteAction(formData: FormData) {
  const session = await requireSession();
  if (session.role === 'member') return;
  await q.revokeInvite(session, String(formData.get('inviteId') ?? ''));
  revalidatePath('/settings');
}
