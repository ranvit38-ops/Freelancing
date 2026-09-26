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
    subject: joined ? `You're in ${labName} on Labvia` : 'Your Labvia account is ready',
    text: [
      `Hi ${first},`,
      '',
      joined
        ? `Your Labvia account is set up and you are now a member of ${labName}.`
        : `Your Labvia account is set up, along with a workspace for ${labName}.`,
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
    subject: `You're in ${labName} on Labvia`,
    text: [
      `Hi ${first},`,
      '',
      `You are now a member of ${labName} on Labvia.`,
      '',
      'Start here. It lists what to read first, in order, and who works on what:',
      link,
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
