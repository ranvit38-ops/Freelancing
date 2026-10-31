import { absoluteUrl, sendEmail } from './mailer';

type Email = { subject: string; text: string };

/** Sent once, when an account is created, so there is a record of it in their inbox. */
export function welcomeEmail({
  name,
  labName,
  joined,
  link,
}: {
  name: string;
  labName: string;
  joined: boolean;
  link: string;
}): Email {
  const first = name.trim().split(/\s+/)[0] || 'there';
  return {
    subject: joined ? `You're in ${labName} on Labquill` : 'Your Labquill account is ready',
    text: [
      `Hi ${first},`,
      '',
      joined
        ? `Your Labquill account is set up and you are now a member of ${labName}.`
        : `Your Labquill account is set up, along with a lab called ${labName}.`,
      '',
      joined
        ? 'Start here. It lists what to read first, in order, and who works on what:'
        : 'Open your lab here:',
      link,
      '',
      'If you did not create this account, reply to this email and it will be removed.',
    ].join('\n'),
  };
}

/** Sent when an account that already existed joins another lab. */
export function joinedLabEmail({ name, labName, link }: { name: string; labName: string; link: string }): Email {
  const first = name.trim().split(/\s+/)[0] || 'there';
  return {
    subject: `You're in ${labName} on Labquill`,
    text: [
      `Hi ${first},`,
      '',
      `You are now a member of ${labName} on Labquill.`,
      '',
      'Start here. It lists what to read first, in order, and who works on what:',
      link,
    ].join('\n'),
  };
}

/** Sent when someone hands you a piece of work, so it reaches your inbox and not only the app. */
export function taskAssignedEmail({
  name,
  from,
  title,
  dueOn,
  labName,
  link,
}: {
  name: string;
  from: string;
  title: string;
  dueOn: string | null;
  labName: string;
  link: string;
}): Email {
  const first = name.trim().split(/\s+/)[0] || 'there';
  return {
    subject: `${from} gave you a task: ${title}`,
    text: [
      `Hi ${first},`,
      '',
      `${from} gave you a task in ${labName}:`,
      '',
      `  ${title}`,
      dueOn ? `  Due ${dueOn}` : '',
      '',
      'Open it here:',
      link,
    ]
      .filter((line, i, all) => line !== '' || all[i - 1] !== '')
      .join('\n'),
  };
}

/* ── billing notices ─────────────────────────────────────────────────────
 *
 * Auto-renewal laws ask for the terms in writing once a subscription starts,
 * notice when it is cancelled, and a reminder before a yearly one renews.
 * Each says what it costs, when it renews, and exactly how to stop it.
 */

type BillingNotice = {
  name: string;
  labName: string;
  planName: string;
  price: string;
  interval: 'month' | 'year';
  /** e.g. "12 November 2026", or null when PayPal has not said yet. */
  date: string | null;
  billingLink: string;
  termsLink: string;
};

const howToCancel = (b: BillingNotice) => [
  'To cancel: open Billing in Labquill and choose "Cancel plan", or cancel it under Automatic payments in your PayPal account. The plan then stays active until the end of the period already paid for, and nothing more is charged.',
  `Billing: ${b.billingLink}`,
  `Terms: ${b.termsLink}`,
];

export function subscriptionStartedEmail(b: BillingNotice): Email {
  const first = b.name.trim().split(/\s+/)[0] || 'there';
  return {
    subject: `Your Labquill ${b.planName} plan for ${b.labName}`,
    text: [
      `Hi ${first},`,
      '',
      `${b.labName} is now on the Labquill ${b.planName} plan, paid through PayPal.`,
      '',
      `It costs ${b.price} a ${b.interval} and renews automatically every ${b.interval} until you cancel.${b.date ? ` The next payment is due on ${b.date}.` : ''}`,
      '',
      ...howToCancel(b),
      '',
      'Keep this email as your record of the subscription.',
    ].join('\n'),
  };
}

export function subscriptionCancelledEmail(b: BillingNotice): Email {
  const first = b.name.trim().split(/\s+/)[0] || 'there';
  return {
    subject: `Your Labquill plan for ${b.labName} is cancelled`,
    text: [
      `Hi ${first},`,
      '',
      `The ${b.planName} plan for ${b.labName} is cancelled, and nothing more will be charged.`,
      b.date
        ? `It stays active until ${b.date}. After that the lab becomes read-only: every record, file and dataset stays readable, and nothing is deleted.`
        : 'The lab is now read-only: every record, file and dataset stays readable, and nothing is deleted.',
      '',
      `To start again, choose a plan in Billing: ${b.billingLink}`,
    ].join('\n'),
  };
}

export function renewalReminderEmail(b: BillingNotice): Email {
  const first = b.name.trim().split(/\s+/)[0] || 'there';
  return {
    subject: `Your yearly Labquill plan renews${b.date ? ` on ${b.date}` : ' soon'}`,
    text: [
      `Hi ${first},`,
      '',
      `The yearly ${b.planName} plan for ${b.labName} renews automatically${b.date ? ` on ${b.date}` : ''}, and PayPal will then charge ${b.price} for the next year.`,
      '',
      'If that is what you want, there is nothing to do.',
      '',
      ...howToCancel(b),
    ].join('\n'),
  };
}

/**
 * Sends a confirmation without making anyone wait for it or fail because of
 * it. Signing up must not depend on an email provider being up, so this is not
 * awaited, and a failure is logged with Resend's reason instead of shown.
 */
export function sendConfirmation(to: string, path: string, build: (link: string) => Email): void {
  let link: string;
  try {
    link = absoluteUrl(path);
  } catch (error) {
    console.warn(`[labflow] confirmation email to ${to} not sent: ${(error as Error).message}`);
    return;
  }
  void sendEmail({ to, ...build(link) }).then(
    ({ id }) => console.info(`[labflow] confirmation email sent to ${to}${id ? ` (Resend id ${id})` : ''}`),
    (error: Error) => console.warn(`[labflow] confirmation email to ${to} not sent: ${error.message}`),
  );
}
