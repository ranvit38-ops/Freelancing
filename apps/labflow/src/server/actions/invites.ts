'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { normaliseEmail } from '@/lib/normalise';
import { rateLimit } from '@/lib/rate-limit';
import { PLANS } from '@/lib/plans';
import { isValidEmail } from '@/lib/validation';
import { MailNotConfiguredError, MailSendError, absoluteUrl, mailConfigured, publicBaseUrl, sendEmail } from '../mailer';
import { linkForViewer } from '../origin';
import { requireSession } from '../authz';
import { workspacePlan } from '../paywall';
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

  // Each invitation is an email sent in the lab's name, so a runaway form or a
  // compromised admin account cannot turn this into a way to send spam.
  const limit = rateLimit(`invite:${session.workspaceId}`, { limit: 30, windowMs: 10 * 60_000 });
  if (!limit.ok) {
    return { error: `That is a lot of invitations at once. Try again in ${limit.retryAfterSec} seconds.` };
  }

  const email = normaliseEmail(String(formData.get('email') ?? ''));
  if (!isValidEmail(email)) {
    return { fieldErrors: { email: 'Enter a valid email address' } };
  }
  const role = formData.get('role') === 'admin' ? 'admin' : 'member';

  // A seat is consumed by a member or by an invite that has not been accepted.
  //
  // The seat count comes from the plan actually in force, which is what
  // workspacePlan answers. Reading the subscription row directly used to skip
  // every override above it, so a pilot deployment meant to hand a whole lab
  // the top plan still stopped them at the free plan's third person.
  const [{ plan, writable }, usage] = await Promise.all([
    workspacePlan(session),
    q.seatUsage(session),
  ]);
  if (!writable) {
    return { error: 'This workspace needs an active plan before you can invite people.' };
  }
  const seats = PLANS[plan].seats;
  if (usage.members + usage.pending >= seats) {
    return {
      error: `All ${seats} seats on this plan are taken. Upgrade, or revoke a pending invitation, to add someone.`,
    };
  }

  const token = randomBytes(32).toString('base64url');
  await q.createInvite(session, {
    email,
    role,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  });

  revalidatePath('/settings');

  // Shown to the inviter, who passes it on themselves: the address they are
  // using right now is the right one, whether or not it is configured.
  const handOver = linkForViewer(`/join?token=${token}`);
  if (!mailConfigured()) {
    return {
      ok: true,
      message: `Email is not set up on this deployment, so nothing was sent. The invitation is saved: send them this link yourself: ${handOver}`,
    };
  }

  // Going into an email to someone else, so it must be the configured
  // address and never one read off this request.
  if (!publicBaseUrl() && process.env.NODE_ENV === 'production') {
    return {
      ok: true,
      message: `The invitation is saved but was not emailed, because this server does not know its public address (set NEXT_PUBLIC_APP_URL). Send them this link yourself: ${handOver}`,
    };
  }
  const link = absoluteUrl(`/join?token=${token}`);

  try {
    await sendEmail({
      to: email,
      replyTo: session.userEmail,
      subject: `${session.userName} invited you to ${session.workspaceName} on Labvia`,
      text: [
        `${session.userName} has invited you to join ${session.workspaceName} on Labvia.`,
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
    // The inviter runs the lab, so they get the real reason, and the link so
    // the invitation is not lost while email gets fixed.
    const reason = error instanceof MailSendError ? error.reason : (error as Error).message;
    console.error(`[labflow] invitation email to ${email} failed: ${reason}`);
    return {
      error: `The invitation is saved, but the email did not go out. ${reason} Meanwhile, send them this link yourself: ${link}`,
    };
  }

  return {
    ok: true,
    message: `Invitation emailed to ${email}. If it is not in their inbox in a few minutes, ask them to check spam, or send them this link: ${link}`,
  };
}

export async function revokeInviteAction(formData: FormData) {
  const session = await requireSession();
  if (session.role === 'member') return;
  await q.revokeInvite(session, String(formData.get('inviteId') ?? ''));
  revalidatePath('/settings');
}

/**
 * Turns the lab's join link on, rotates it, or switches it off.
 *
 * Deliberately not per-person. A PI pastes one link into the lab's group chat
 * and everyone is in, which is the difference between nine people trying this
 * and the two who happened to be in the room when the invitations went out.
 *
 * Only an owner or admin may touch it, and the code is long enough that it
 * cannot be found by guessing: 32 random bytes is the same strength as the
 * per-person invitation tokens.
 */
export async function setJoinLinkAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (session.role === 'member') return;

  const wanted = String(formData.get('mode') ?? '');
  await q.setJoinCode(session, wanted === 'off' ? null : randomBytes(32).toString('base64url'));
  revalidatePath('/team');
}
