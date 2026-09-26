import { randomUUID } from 'node:crypto';

/**
 * Transactional email.
 *
 * One provider (Resend) over plain HTTP, no SDK needed for a single endpoint.
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

/**
 * The provider refused or could not be reached. `reason` is written for the
 * person running the deployment: what went wrong and what to change.
 */
export class MailSendError extends Error {
  constructor(
    readonly reason: string,
    readonly status: number | null = null,
  ) {
    super(reason);
    this.name = 'MailSendError';
  }
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** The bare address inside EMAIL_FROM, which may be `Name <addr>` or `addr`. */
export function senderAddress(from: string): string | null {
  const match = /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from.trim()) ?? /^([^<>\s]+@[^<>\s]+)$/.exec(from.trim());
  return match ? match[1]!.toLowerCase() : null;
}

/**
 * What an operator needs to know about email before sending anything. Resend's
 * shared test sender only delivers to the address that owns the Resend
 * account, which looks exactly like "emails don't work" to everyone else.
 */
export function mailSetupProblem(): string | null {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key && !from) return 'RESEND_API_KEY and EMAIL_FROM are not set.';
  if (!key) return 'RESEND_API_KEY is not set.';
  if (!from) return 'EMAIL_FROM is not set.';
  if (!key.startsWith('re_')) return 'RESEND_API_KEY does not look like a Resend key (they start with re_).';
  if (!senderAddress(from)) {
    return 'EMAIL_FROM must be an address, like Labvia <hello@yourdomain.com> or hello@yourdomain.com.';
  }
  return null;
}

/** True when EMAIL_FROM is Resend's shared test sender. */
export function usingResendTestSender(): boolean {
  const address = senderAddress(process.env.EMAIL_FROM ?? '');
  return Boolean(address?.endsWith('@resend.dev'));
}

/**
 * Turns Resend's error into something a person can act on. Their messages
 * are precise but assume you know their product; these say what to change.
 */
export function explainResendError(status: number, body: string): string {
  let message = '';
  let name = '';
  try {
    const parsed = JSON.parse(body) as { message?: unknown; name?: unknown };
    message = typeof parsed.message === 'string' ? parsed.message : '';
    name = typeof parsed.name === 'string' ? parsed.name : '';
  } catch {
    message = body.slice(0, 200);
  }
  const said = message ? ` Resend said: "${message}"` : '';

  if (/only send testing emails to your own email/i.test(message)) {
    return `Resend is in test mode, so it only delivers to the address you signed up to Resend with. To email anyone else, verify a domain at resend.com/domains and set EMAIL_FROM to an address on it.${said}`;
  }
  if (/domain is not verified|verify a domain/i.test(message)) {
    return `The domain in EMAIL_FROM is not verified in Resend. Finish verifying it at resend.com/domains (the DNS records can take a while), or use onboarding@resend.dev for testing.${said}`;
  }
  if (status === 401 || /api key is invalid|invalid_api_key|missing_api_key|restricted_api_key/i.test(`${name} ${message}`)) {
    return `Resend did not accept RESEND_API_KEY. Create a new key with sending access at resend.com/api-keys and replace it on the server.${said}`;
  }
  if (/from/i.test(message) && (status === 422 || /invalid_from_address/i.test(name))) {
    return `EMAIL_FROM is not in a form Resend accepts. Use Labvia <hello@yourdomain.com> or hello@yourdomain.com.${said}`;
  }
  if (status === 429) {
    return `Resend's sending limit was reached (the free plan allows 100 emails a day). Wait, or upgrade the Resend plan.${said}`;
  }
  if (status >= 500) return `Resend had a problem on its side (${status}). Try again in a minute.${said}`;
  return `Resend refused the email (${status}).${said}`;
}

const SEND_TIMEOUT_MS = 15_000;

/** Overridable only so the whole flow can be exercised against a stand-in. */
function resendBase(): string {
  return (process.env.RESEND_BASE_URL || 'https://api.resend.com').replace(/\/$/, '');
}

/**
 * Sends one email and returns Resend's id for it, which is what to search for
 * in the Resend dashboard's log when someone says it never arrived.
 *
 * A timeout, a dropped connection, a rate limit or a Resend outage is tried
 * once more. The idempotency key is the same on both attempts, so a first
 * attempt that did go through is not delivered twice.
 */
export async function sendEmail(
  message: { to: string; subject: string; text: string; replyTo?: string },
  fetchImpl: typeof fetch = fetch,
  { retryDelayMs = 1500 }: { retryDelayMs?: number } = {},
): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new MailNotConfiguredError();

  const idempotencyKey = randomUUID();
  const body = JSON.stringify({
    from,
    to: [message.to],
    subject: message.subject,
    text: message.text,
    // Sent from the deployment's own address, so a plain reply would go
    // nowhere. This puts the researcher in the reply field instead: hitting
    // reply in a normal mail client reaches the person who wrote it.
    ...(message.replyTo ? { reply_to: [message.replyTo] } : {}),
  });

  const attempt = async (): Promise<{ id: string | null } | MailSendError> => {
    let response: Response;
    try {
      response = await fetchImpl(`${resendBase()}/emails`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          'idempotency-key': idempotencyKey,
          'user-agent': 'labvia',
        },
        body,
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = (error as Error).name === 'TimeoutError';
      return new MailSendError(
        timedOut
          ? `Resend did not answer within ${SEND_TIMEOUT_MS / 1000} seconds.`
          : `Could not reach Resend: ${(error as Error).message}.`,
      );
    }
    const text = await response.text().catch(() => '');
    if (!response.ok) return new MailSendError(explainResendError(response.status, text), response.status);
    try {
      const parsed = JSON.parse(text) as { id?: unknown };
      return { id: typeof parsed.id === 'string' ? parsed.id : null };
    } catch {
      return { id: null };
    }
  };

  let result = await attempt();
  const transient = (e: MailSendError) => e.status === null || e.status === 429 || e.status >= 500;
  if (result instanceof MailSendError && transient(result)) {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    result = await attempt();
  }
  if (result instanceof MailSendError) throw result;
  return result;
}

/**
 * Absolute links for emails and for Stripe's return URLs. Relative paths are
 * useless in an inbox, and worse at a payment provider.
 *
 * In production the localhost fallback is not a fallback, it is a trap: a
 * customer pays, Stripe sends them to http://localhost:3001, and they land on
 * a dead page believing the payment failed. Refusing outright is the only
 * honest option, and it fails before the charge rather than after it.
 */
/**
 * The deployment's public address, from configuration only, never from a
 * request. NEXT_PUBLIC_APP_URL when set; otherwise the address the host
 * itself publishes (Render sets RENDER_EXTERNAL_URL on every service), so a
 * deployment works without anyone having to type its own URL in.
 */
export function publicBaseUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL;
  return base ? base.replace(/\/$/, '') : null;
}

export function absoluteUrl(path: string): string {
  const base = publicBaseUrl();
  if (!base) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'NEXT_PUBLIC_APP_URL is not set. Set it to this deployment\'s public address, for example https://labvia.com, so payment redirects and email links point somewhere real.',
      );
    }
    return `http://localhost:3001${path}`;
  }
  return `${base}${path}`;
}
