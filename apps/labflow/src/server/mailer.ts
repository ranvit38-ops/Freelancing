/**
 * Transactional email.
 *
 * One provider (Resend) over plain HTTP — no SDK needed for a single endpoint.
 * When it is not configured the send fails loudly rather than silently
 * pretending, and callers decide what to tell the user.
 */

export class MailNotConfiguredError extends Error {
  constructor() {
    super(
      'Email delivery is not configured on this deployment. Set RESEND_API_KEY and EMAIL_FROM on the server.',
    );
    this.name = 'MailNotConfiguredError';
  }
}

export class MailSendError extends Error {}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(
  message: { to: string; subject: string; text: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new MailNotConfiguredError();

  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
  });

  if (!response.ok) {
    throw new MailSendError(`The email provider rejected the message (${response.status}).`);
  }
}

/** Absolute links for emails; relative paths are useless in an inbox. */
export function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  return `${base.replace(/\/$/, '')}${path}`;
}
