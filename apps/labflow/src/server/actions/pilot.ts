'use server';

import { revalidatePath } from 'next/cache';
import { isWouldPay, parseMonthlyValue, pilotMode } from '@/lib/pilot';
import { requireSession } from '../authz';
import { savePilotFeedback } from '../queries';
import type { ActionState } from './types';

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

  await savePilotFeedback(session, {
    wouldPay,
    monthlyValue: parseMonthlyValue(String(formData.get('monthlyValue') ?? '')),
    blocker: trim('blocker'),
    decisionMaker: trim('decisionMaker'),
  });

  revalidatePath('/billing');
  return { ok: true, message: 'Thank you. That is exactly what this pilot is for.' };
}
