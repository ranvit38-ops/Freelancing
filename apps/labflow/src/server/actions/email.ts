'use server';

import { rateLimit } from '@/lib/rate-limit';
import { requireSession } from '../authz';
import { MailNotConfiguredError, MailSendError, absoluteUrl, mailSetupProblem, sendEmail } from '../mailer';
import type { ActionState } from './types';

/**
 * Sends one email to the signed-in person's own address, so whoever runs the
 * deployment can see whether email works from the live site instead of
 * finding out when an invitation never arrives. Only ever to yourself, so it
 * cannot be used to email anyone else.
 */
export async function sendTestEmailAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const limit = rateLimit(`test-email:${session.userId}`, { limit: 3, windowMs: 60_000 });
  if (!limit.ok) return { error: `Try again in ${limit.retryAfterSec} seconds.` };

  const problem = mailSetupProblem();
  if (problem) return { error: `${problem} Set it on the server (on Render: Environment), then redeploy.` };

  let link: string;
  try {
    link = absoluteUrl('/settings');
  } catch (error) {
    return { error: (error as Error).message };
  }

  try {
    const { id } = await sendEmail({
      to: session.userEmail,
      subject: 'Labvia test email',
      text: [
        'This is a test from your Labvia deployment. If you are reading it, email works:',
        'invitations, password resets and sign-up confirmations will be delivered too.',
        '',
        `Sent from ${link}`,
      ].join('\n'),
    });
    return {
      ok: true,
      message: `Resend accepted it${id ? ` (id ${id})` : ''} and is delivering it to ${session.userEmail}. Check your inbox, and spam, in the next minute.`,
    };
  } catch (error) {
    if (error instanceof MailNotConfiguredError || error instanceof MailSendError) {
      return { error: error instanceof MailSendError ? error.reason : error.message };
    }
    throw error;
  }
}
