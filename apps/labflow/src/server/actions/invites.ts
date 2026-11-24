'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { normaliseEmail } from '@/lib/normalise';
import { rateLimit } from '@/lib/rate-limit';
import { PLANS } from '@/lib/plans';
import { isValidEmail } from '@/lib/validation';
import { parseEmails } from '@/lib/bulk-input';
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
    return { error: 'Only an owner or admin can invite people to this lab.' };
  }

  // One address, or a list pasted from anywhere: commas, spaces, new lines,
  // or "Name <name@uni.edu>" straight out of a mail client.
  const emails = parseEmails(String(formData.get('email') ?? '')).map(normaliseEmail);
  const invalid = emails.filter((e) => !isValidEmail(e));
  if (emails.length === 0 || invalid.length) {
    return {
      fieldErrors: {
        email: invalid.length ? `Not a valid address: ${invalid.slice(0, 3).join(', ')}` : 'Enter a valid email address',
      },
    };
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
    return { error: 'This lab needs an active plan before you can invite people.' };
  }
  const seats = PLANS[plan].seats;
  const free = seats - usage.members - usage.pending;
  if (free <= 0) {
    return {
      error: `All ${seats} seats on this plan are taken. Upgrade, or revoke a pending invitation, to add someone.`,
    };
  }
  // A list is all or nothing, so nobody has to work out who got in.
  if (emails.length > free) {
    return {
      error: `That is ${emails.length} people, and this plan has room for ${free} more. Upgrade, revoke a pending invitation, or invite fewer at once.`,
    };
  }

  const results: Invited[] = [];
  for (const email of emails) {
    // Each invitation is an email sent in the lab's name, so a runaway form or
    // a compromised admin account cannot turn this into a way to send spam.
    const limit = rateLimit(`invite:${session.workspaceId}`, { limit: 30, windowMs: 10 * 60_000 });
    if (!limit.ok) {
      results.push({ email, error: `Not invited: too many invitations at once. Try again in ${limit.retryAfterSec} seconds.` });
      continue;
    }
    results.push(await inviteOne(session, email, role));
  }
  revalidatePath('/settings');

  if (results.length === 1) {
    const [only] = results as [Invited];
    return only.error ? { error: only.error } : { ok: true, message: only.message };
  }
  const sent = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  const lines = [
    sent.length ? `Invited ${sent.length}: ${sent.map((r) => r.email).join(', ')}.` : '',
    ...sent.filter((r) => r.handOver).map((r) => `${r.email}: send them ${r.handOver}`),
    ...failed.map((r) => `${r.email}: ${r.error}`),
  ].filter(Boolean);
  return failed.length ? { error: lines.join(' ') } : { ok: true, message: lines.join(' ') };
}

type Invited = { email: string; message?: string; error?: string; handOver?: string };

/** One invitation: saved, then emailed, or handed back as a link to pass on. */
async function inviteOne(
  session: Awaited<ReturnType<typeof requireSession>>,
  email: string,
  role: 'admin' | 'member',
): Promise<Invited> {
  const token = randomBytes(32).toString('base64url');
  await q.createInvite(session, {
    email,
    role,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  });

  // Shown to the inviter, who passes it on themselves: the address they are
  // using right now is the right one, whether or not it is configured.
  const handOver = await linkForViewer(`/join?token=${token}`);
  if (!mailConfigured()) {
    return {
      email,
      handOver,
      message: `Email is not set up on this deployment, so nothing was sent. The invitation is saved: send them this link yourself: ${handOver}`,
    };
  }

  // Going into an email to someone else, so it must be the configured
  // address and never one read off this request.
  if (!publicBaseUrl() && process.env.NODE_ENV === 'production') {
    return {
      email,
      handOver,
      message: `The invitation is saved but was not emailed, because this server does not know its public address (set NEXT_PUBLIC_APP_URL). Send them this link yourself: ${handOver}`,
    };
  }
  const link = absoluteUrl(`/join?token=${token}`);

  try {
    await sendEmail({
      to: email,
      replyTo: session.userEmail,
      subject: `${session.userName} invited you to ${session.workspaceName} on Labquill`,
      text: [
        `${session.userName} has invited you to join ${session.workspaceName} on Labquill.`,
        '',
        'Open this link to accept (it expires in two weeks):',
        link,
        '',
        'If you were not expecting this, you can ignore it.',
      ].join('\n'),
    });
  } catch (error) {
    if (error instanceof MailNotConfiguredError) {
      return { email, handOver: link, message: `${error.message} Send them this link yourself: ${link}` };
    }
    // The inviter runs the lab, so they get the real reason, and the link so
    // the invitation is not lost while email gets fixed.
    const reason = error instanceof MailSendError ? error.reason : (error as Error).message;
    console.error(`[labflow] invitation email to ${email} failed: ${reason}`);
    return {
      email,
      error: `The invitation is saved, but the email did not go out. ${reason} Meanwhile, send them this link yourself: ${link}`,
    };
  }

  return {
    email,
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
