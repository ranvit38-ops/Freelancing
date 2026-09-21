import { PLANS, type PlanId } from './plans';

/**
 * Pilot mode: the whole product, free, for labs who agreed to try it.
 *
 * A pilot is not a free tier. The free tier is deliberately small so that real
 * use pushes against it, which is the right shape once people are choosing
 * whether to pay. During a pilot that pressure is noise: a lab of eight hits
 * the three person cap on day one and spends the pilot arguing with a limit
 * instead of using the product, and a fourteen day trial expires halfway
 * through the very month you asked them to evaluate.
 *
 * So a pilot deployment puts every workspace on the top plan, with no expiry
 * and no countdown, and replaces every prompt to pay with one question about
 * whether they would.
 *
 * Turned on by setting LABFLOW_PILOT_MODE to 1 on the host, exactly like any
 * other deployment setting. Unlike LABFLOW_DISABLE_PAYWALL this is *meant* to
 * work in production, because a pilot is a production deployment. That makes it
 * the one setting that can give the product away by accident, so the owner
 * dashboard says loudly when it is on.
 */

/** What a pilot workspace gets. The best plan, because that is what is being judged. */
export const PILOT_PLAN: PlanId = 'department';

export function pilotMode(): boolean {
  return process.env.LABFLOW_PILOT_MODE === '1';
}

/** The line shown on every page of a pilot deployment. */
export function pilotBanner(): string {
  return `Free pilot: every ${PLANS[PILOT_PLAN].name} feature is on, for ${PLANS[PILOT_PLAN].seats} people, with nothing to pay and no end date.`;
}

export const WOULD_PAY = ['yes', 'maybe', 'no'] as const;
export type WouldPay = (typeof WOULD_PAY)[number];

export function isWouldPay(value: string): value is WouldPay {
  return (WOULD_PAY as readonly string[]).includes(value);
}

/** How each answer reads back on the owner dashboard. */
export const WOULD_PAY_LABEL: Record<WouldPay, string> = {
  yes: 'Would pay',
  maybe: 'Not sure',
  no: 'Would not pay',
};

/**
 * Reads a typed monthly figure.
 *
 * People write "about $80", "80/month" and "£80". Pulling the first number out
 * of whatever they typed beats refusing the form over punctuation, and a
 * refused form is an answer you never get. Anything with no number in it at all
 * is recorded as no figure rather than as zero, because "I would pay nothing"
 * and "I did not say" are different answers.
 */
export function parseMonthlyValue(input: string): number | null {
  const match = input.replace(/,/g, '').match(/\d+(\.\d+)?/);
  if (!match) return null;
  const value = Math.round(Number(match[0]));
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return null;
  return value;
}

export type FeedbackAnswers = {
  wouldPay: WouldPay;
  monthlyValue: number | null;
  blocker: string | null;
  decisionMaker: string | null;
};

/**
 * The email that lands in the owner's inbox when a researcher answers.
 *
 * An answer sitting in a database table is an answer nobody reads. The whole
 * point of a pilot is the conversation that follows, and that conversation
 * starts within the day or not at all.
 *
 * The subject leads with the verdict and the lab, so a full inbox still sorts
 * itself. Unanswered questions are said to be unanswered rather than left out:
 * a lab that skipped "what would stop you" told you something, and a gap in
 * the email reads like a bug instead.
 */
export function feedbackEmail(
  answers: FeedbackAnswers,
  from: { name: string; email: string; workspace: string },
): { subject: string; text: string } {
  const notSaid = '(not answered)';
  return {
    subject: `Labvia pilot: ${WOULD_PAY_LABEL[answers.wouldPay]} — ${from.workspace}`,
    text: [
      `${from.name} <${from.email}> from ${from.workspace} answered the pilot question.`,
      '',
      `Would pay:        ${WOULD_PAY_LABEL[answers.wouldPay]}`,
      `Worth per month:  ${answers.monthlyValue === null ? notSaid : `$${answers.monthlyValue}`}`,
      '',
      'What would stop them:',
      answers.blocker ?? notSaid,
      '',
      'Who decides:',
      answers.decisionMaker ?? notSaid,
      '',
      '—',
      'Reply to this email to answer them directly.',
    ].join('\n'),
  };
}

/**
 * Whether this deployment loses uploaded files when it restarts.
 *
 * A free host has no persistent disk. Files still upload, still attach and
 * still download — right up until the container restarts, and then they are
 * gone with no trace. That is the worst possible failure for a research tool:
 * a lab finds out a month later that the gel image backing a figure has
 * vanished, and the only thing they learn is not to trust it.
 *
 * So a deployment without a disk has to say so, in the product, before anyone
 * uploads anything. Set LABFLOW_EPHEMERAL_UPLOADS to 1 on any host where the
 * uploads directory is not on a real disk.
 */
export function ephemeralUploads(): boolean {
  return process.env.LABFLOW_EPHEMERAL_UPLOADS === '1';
}

export function ephemeralUploadsWarning(): string {
  return 'Files are not kept on this preview. Anything uploaded here disappears when the server restarts, so keep your own copy.';
}
