import type { SessionContext } from './auth';
import { MailNotConfiguredError, MailSendError, sendEmail } from './mailer';
import { listWorkspaceMembers } from './queries';

/**
 * Emails something written in LabLedger to people in the lab, or to yourself.
 * Only lab members can be chosen, so this cannot be used to send mail to
 * arbitrary addresses in the lab's name. Replies go to the sender.
 */
export async function emailToLab(
  s: SessionContext,
  input: {
    recipientIds: string[];
    subject: string;
    text: string;
    attachment?: { filename: string; content: Buffer };
  },
): Promise<{ sentTo: string[] } | { error: string }> {
  const members = await listWorkspaceMembers(s);
  const chosen = members.filter((m) => input.recipientIds.includes(m.id));
  if (chosen.length === 0) return { error: 'Choose at least one person in the lab.' };

  const sentTo: string[] = [];
  for (const person of chosen) {
    try {
      await sendEmail({
        to: person.email,
        replyTo: s.userEmail,
        subject: input.subject,
        text: input.text,
        attachments: input.attachment ? [input.attachment] : undefined,
      });
      sentTo.push(person.name ?? person.email);
    } catch (error) {
      if (error instanceof MailNotConfiguredError) {
        return { error: 'Email is not set up on this site yet. See Settings → Email.' };
      }
      const reason = error instanceof MailSendError ? error.reason : (error as Error).message;
      return sentTo.length > 0
        ? { error: `Sent to ${sentTo.join(', ')}, but not to ${person.name ?? person.email}: ${reason}` }
        : { error: reason };
    }
  }
  return { sentTo };
}
