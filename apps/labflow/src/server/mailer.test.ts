import { describe, expect, it, afterEach } from 'vitest';
import { MailNotConfiguredError, sendEmail } from './mailer';

const original = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
afterEach(() => {
  process.env.RESEND_API_KEY = original.key ?? '';
  process.env.EMAIL_FROM = original.from ?? '';
  if (!original.key) delete process.env.RESEND_API_KEY;
  if (!original.from) delete process.env.EMAIL_FROM;
});

function capture() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('sendEmail', () => {
  it('refuses rather than pretending when no provider is configured', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    await expect(sendEmail({ to: 'a@b.com', subject: 's', text: 't' })).rejects.toBeInstanceOf(
      MailNotConfiguredError,
    );
  });

  it('sets reply_to so hitting reply reaches the person, not the deployment', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'labvia@example.com';
    const { calls, fetchImpl } = capture();

    await sendEmail(
      { to: 'owner@example.com', subject: 's', text: 't', replyTo: 'researcher@uni.edu' },
      fetchImpl,
    );
    expect(calls[0]?.body.reply_to).toEqual(['researcher@uni.edu']);
  });

  it('omits reply_to entirely when there is nobody to reply to', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'labvia@example.com';
    const { calls, fetchImpl } = capture();

    await sendEmail({ to: 'someone@example.com', subject: 's', text: 't' }, fetchImpl);
    expect(calls[0]?.body).not.toHaveProperty('reply_to');
  });
});
