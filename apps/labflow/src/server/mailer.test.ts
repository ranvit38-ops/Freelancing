import { describe, expect, it, afterEach } from 'vitest';
import {
  MailNotConfiguredError,
  MailSendError,
  explainResendError,
  mailSetupProblem,
  senderAddress,
  sendEmail,
  usingResendTestSender,
} from './mailer';

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

function respond(...replies: (Response | Error)[]) {
  const calls: { headers: Record<string, string> }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    calls.push({ headers: init.headers as Record<string, string> });
    const next = replies.shift();
    if (!next) throw new Error('no more replies');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('sendEmail against Resend', () => {
  const configure = () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'Labvia <hello@example.com>';
  };
  const message = { to: 'a@uni.edu', subject: 's', text: 't' };

  it("returns Resend's id so a missing email can be found in its log", async () => {
    configure();
    const { fetchImpl } = respond(json(200, { id: 'email_123' }));
    await expect(sendEmail(message, fetchImpl)).resolves.toEqual({ id: 'email_123' });
  });

  it('explains test mode instead of reporting a bare 403, and does not retry it', async () => {
    configure();
    const { calls, fetchImpl } = respond(
      json(403, {
        statusCode: 403,
        name: 'validation_error',
        message:
          'You can only send testing emails to your own email address (me@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains',
      }),
    );
    const error = await sendEmail(message, fetchImpl, { retryDelayMs: 0 }).catch((e) => e);
    expect(error).toBeInstanceOf(MailSendError);
    expect(error.reason).toMatch(/test mode/);
    expect(error.reason).toMatch(/resend\.com\/domains/);
    expect(calls).toHaveLength(1);
  });

  it('tries a Resend outage once more with the same idempotency key', async () => {
    configure();
    const { calls, fetchImpl } = respond(json(502, { message: 'bad gateway' }), json(200, { id: 'e2' }));
    await expect(sendEmail(message, fetchImpl, { retryDelayMs: 0 })).resolves.toEqual({ id: 'e2' });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.headers['idempotency-key']).toBe(calls[1]!.headers['idempotency-key']);
  });

  it('tries a dropped connection once more, then gives a readable reason', async () => {
    configure();
    const { calls, fetchImpl } = respond(new Error('socket hang up'), new Error('socket hang up'));
    const error = await sendEmail(message, fetchImpl, { retryDelayMs: 0 }).catch((e) => e);
    expect(calls).toHaveLength(2);
    expect(error).toBeInstanceOf(MailSendError);
    expect(error.reason).toMatch(/Could not reach Resend/);
  });
});

describe('explainResendError', () => {
  it('names the key when Resend rejects it', () => {
    expect(explainResendError(401, JSON.stringify({ name: 'missing_api_key', message: 'Missing API key' }))).toMatch(
      /RESEND_API_KEY/,
    );
  });

  it('names the domain when it is not verified', () => {
    expect(
      explainResendError(403, JSON.stringify({ message: 'The example.com domain is not verified. Please, add and verify your domain' })),
    ).toMatch(/not verified in Resend/);
  });

  it('names EMAIL_FROM when the sender is malformed', () => {
    expect(
      explainResendError(422, JSON.stringify({ name: 'validation_error', message: 'Invalid `from` field.' })),
    ).toMatch(/EMAIL_FROM/);
  });

  it('survives a body that is not JSON', () => {
    expect(explainResendError(500, '<html>oops</html>')).toMatch(/Resend had a problem/);
  });
});

describe('email setup checks', () => {
  it('reads the address out of either sender form', () => {
    expect(senderAddress('Labvia <Hello@Lab.org>')).toBe('hello@lab.org');
    expect(senderAddress('hello@lab.org')).toBe('hello@lab.org');
    expect(senderAddress('Labvia')).toBeNull();
  });

  it('says what is missing, and spots a key that is not a Resend key', () => {
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = 'hello@lab.org';
    expect(mailSetupProblem()).toMatch(/RESEND_API_KEY is not set/);
    process.env.RESEND_API_KEY = 'sk-something-else';
    expect(mailSetupProblem()).toMatch(/start with re_/);
    process.env.RESEND_API_KEY = 're_ok';
    expect(mailSetupProblem()).toBeNull();
  });

  it("recognises Resend's shared test sender", () => {
    process.env.EMAIL_FROM = 'Labvia <onboarding@resend.dev>';
    expect(usingResendTestSender()).toBe(true);
    process.env.EMAIL_FROM = 'hello@lab.org';
    expect(usingResendTestSender()).toBe(false);
  });
});
