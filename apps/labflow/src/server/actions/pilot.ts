'use server';

import { revalidatePath } from 'next/cache';
import { feedbackEmail, isWouldPay, parseMonthlyValue, pilotMode } from '@/lib/pilot';
import type { FeedbackAnswers } from '@/lib/pilot';
import { requireSession } from '../authz';
import { sendEmail } from '../mailer';
import { savePilotFeedback } from '../queries';
import type { ActionState } from './types';

/**
 * Puts the answer in the owner's inbox.
 *
 * Never throws. The answer is already saved by the time this runs, and a
 * researcher who took the trouble to answer should not be shown an email
 * provider's error. A failure here costs a notification, not the data: the
 * owner dashboard still lists every answer.
 */
async function notifyOwner(
  answers: FeedbackAnswers,
  from: { name: string; email: string; workspace: string },
): Promise<void> {
  const owner = process.env.LABFLOW_OWNER_EMAIL?.trim();
  if (!owner) return;

  try {
    // reply_to is the researcher, so replying from the inbox reaches them.
    await sendEmail({ to: owner, replyTo: from.email, ...feedbackEmail(answers, from) });
  } catch (error) {
    console.error(`Pilot feedback saved but not emailed: ${(error as Error).message}`);
  }
}

/**
 * Records one person's answer to the only question a pilot exists to ask.
 *
 * Deliberately short. Every extra field is another reason to close the tab, and
 * a blank form teaches you nothing. Only the first question is required; a
 * researcher who answers that and nothing else has still told you the thing
 * that matters.
 */
export async function submitPilotFeedbackAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();

  // A pilot deployment is the only place this belongs. Elsewhere the question
  // is answered by whether they paid.
  if (!pilotMode()) {
    return { error: 'This deployment is not running a pilot.' };
  }

  const wouldPay = String(formData.get('wouldPay') ?? '');
  if (!isWouldPay(wouldPay)) {
    return { fieldErrors: { wouldPay: 'Choose one of the three answers' } };
  }

  const trim = (key: string) => {
    const value = String(formData.get(key) ?? '').trim();
    return value.length > 0 ? value.slice(0, 2000) : null;
  };

  const answers: FeedbackAnswers = {
    wouldPay,
    monthlyValue: parseMonthlyValue(String(formData.get('monthlyValue') ?? '')),
    blocker: trim('blocker'),
    decisionMaker: trim('decisionMaker'),
  };

  await savePilotFeedback(session, answers);
  await notifyOwner(answers, {
    name: session.userName,
    email: session.userEmail,
    workspace: session.workspaceName,
  });

  revalidatePath('/billing');
  return {
    ok: true,
    message: 'Thank you. That is exactly what this pilot is for — I will be in touch shortly.',
  };
}
