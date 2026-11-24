import { PLANS, type PlanId } from '@/lib/plans';
import { publicBaseUrl } from './mailer';

/**
 * PayPal Subscriptions, via PayPal's own approval page.
 *
 * The subscriber approves on paypal.com, so no card or bank details ever reach
 * this server. PayPal charges each period, retries a failed payment, and emails
 * its own receipts; Labquill only reads what PayPal says and acts on it.
 *
 * Sandbox unless PAYPAL_ENV is exactly "live", so a half-configured deployment
 * can never take real money by accident.
 *
 * SETUP REQUIRED before this can take a payment (RUNNING.md has the steps):
 *   1. A PayPal Business account, held by an adult or a company, and a REST app
 *      in the PayPal developer dashboard: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET.
 *   2. `npm run paypal:setup` creates the product and the six plans at the
 *      Pricing page's prices and prints their ids for the PAYPAL_PLAN_* variables.
 *   3. A webhook at /api/paypal/webhook for BILLING.SUBSCRIPTION.* and
 *      PAYMENT.SALE.* events; its id goes in PAYPAL_WEBHOOK_ID.
 */

export class BillingNotConfiguredError extends Error {
  constructor(detail = 'Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and the plan ids.') {
    super(`Payments are not configured on this deployment. ${detail}`);
    this.name = 'BillingNotConfiguredError';
  }
}

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PayPalError';
  }
}

export type PaidPlanId = Exclude<PlanId, 'free'>;
export type Interval = 'month' | 'year';

export const PAID_PLANS: PaidPlanId[] = ['lab', 'group', 'department'];

/** The variable holding PayPal's plan id for each plan and billing period. */
export function planEnvName(plan: PaidPlanId, interval: Interval): string {
  return `PAYPAL_PLAN_${plan.toUpperCase()}_${interval === 'month' ? 'MONTHLY' : 'YEARLY'}`;
}

export function paypalLive(): boolean {
  return process.env.PAYPAL_ENV === 'live';
}

export function apiBase(): string {
  return (
    process.env.PAYPAL_API_BASE || (paypalLive() ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')
  ).replace(/\/$/, '');
}

/**
 * What is stopping this deployment taking a payment, in words, or null.
 *
 * Names the actual gap: perfect keys with no public address are broken in a
 * way that has nothing to do with PayPal.
 */
export function billingProblem(): string | null {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return 'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are not both set, so this deployment cannot reach PayPal.';
  }
  const missing = PAID_PLANS.flatMap((plan) => (['month', 'year'] as const).map((i) => planEnvName(plan, i))).filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    return `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set, so those plans have nothing to subscribe to. Run npm run paypal:setup.`;
  }
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    return 'PAYPAL_WEBHOOK_ID is not set, so PayPal could not tell Labquill about renewals, failed payments or cancellations.';
  }
  // A subscription with no public address sends the customer back to localhost.
  if (process.env.NODE_ENV === 'production' && !publicBaseUrl()) {
    return 'NEXT_PUBLIC_APP_URL is not set, so PayPal would send customers back to localhost after approving.';
  }
  return null;
}

export function planIdFor(plan: PaidPlanId, interval: Interval): string {
  const id = process.env[planEnvName(plan, interval)];
  if (!id) throw new BillingNotConfiguredError(`${planEnvName(plan, interval)} is not set.`);
  return id;
}

/** Maps a PayPal plan id back to the plan and period it represents. */
export function planForPayPalPlan(planId: string): { plan: PaidPlanId; interval: Interval } | null {
  for (const plan of PAID_PLANS) {
    for (const interval of ['month', 'year'] as const) {
      if (process.env[planEnvName(plan, interval)] === planId) return { plan, interval };
    }
  }
  return null;
}

/** The price this deployment promises for a plan and period, in US dollars. */
export function priceFor(plan: PaidPlanId, interval: Interval): number {
  return interval === 'month' ? PLANS[plan].monthly : PLANS[plan].yearly;
}

/** PayPal's subscription statuses, narrowed to the ones Labquill acts on. */
export function mapPayPalStatus(status: string): 'active' | 'past_due' | 'canceled' | 'none' {
  switch (status) {
    case 'ACTIVE':
    case 'APPROVED':
      return 'active';
    case 'SUSPENDED':
      return 'past_due';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'canceled';
    default:
      return 'none';
  }
}

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(fetchImpl: typeof fetch): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new BillingNotConfiguredError();
  const response = await fetchImpl(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response) throw new PayPalError('PayPal could not be reached.', 503);
  if (!response.ok) {
    throw new PayPalError(
      response.status === 401
        ? 'PayPal rejected PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET. Check they belong to the same app, and to sandbox or live as PAYPAL_ENV says.'
        : `PayPal refused to sign in (${response.status}).`,
      response.status,
    );
  }
  const body = (await response.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

/** One call to PayPal's REST API, as this deployment's app. */
export async function paypal<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const auth = await accessToken(fetchImpl);
  const response = await fetchImpl(`${apiBase()}${path}`, {
    method,
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json', prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response) throw new PayPalError('PayPal could not be reached.', 503);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!response.ok) {
    let detail = '';
    try {
      const parsed = JSON.parse(text) as { message?: string; details?: { description?: string }[] };
      detail = parsed.details?.[0]?.description ?? parsed.message ?? '';
    } catch {
      // Not JSON; the status says enough.
    }
    throw new PayPalError(`PayPal refused (${response.status}${detail ? `: ${detail}` : ''}).`, response.status);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

export type PayPalSubscription = {
  id: string;
  status: string;
  plan_id: string;
  custom_id?: string;
  subscriber?: { email_address?: string };
  billing_info?: { next_billing_time?: string; last_payment?: { time?: string } };
  links?: { href: string; rel: string }[];
};

function approveLink(sub: PayPalSubscription): string {
  const href = sub.links?.find((l) => l.rel === 'approve')?.href;
  if (!href) throw new PayPalError('PayPal did not return an approval link.', 502);
  return href;
}

/** Starts a subscription; the customer approves it on PayPal. */
export async function createSubscription(
  input: { plan: PaidPlanId; interval: Interval; workspaceId: string; email: string; returnUrl: string; cancelUrl: string },
  fetchImpl?: typeof fetch,
): Promise<{ id: string; approveUrl: string }> {
  const sub = await paypal<PayPalSubscription>(
    'POST',
    '/v1/billing/subscriptions',
    {
      plan_id: planIdFor(input.plan, input.interval),
      // Read back on every event: which lab this subscription pays for.
      custom_id: input.workspaceId,
      subscriber: { email_address: input.email },
      application_context: {
        brand_name: 'Labquill',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    },
    fetchImpl,
  );
  return { id: sub.id, approveUrl: approveLink(sub) };
}

/** Moves a live subscription to another plan; the customer approves it on PayPal. */
export async function reviseSubscription(
  id: string,
  input: { plan: PaidPlanId; interval: Interval; returnUrl: string; cancelUrl: string },
  fetchImpl?: typeof fetch,
): Promise<{ approveUrl: string }> {
  const revised = await paypal<PayPalSubscription>(
    'POST',
    `/v1/billing/subscriptions/${encodeURIComponent(id)}/revise`,
    {
      plan_id: planIdFor(input.plan, input.interval),
      application_context: {
        brand_name: 'Labquill',
        shipping_preference: 'NO_SHIPPING',
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    },
    fetchImpl,
  );
  return { approveUrl: approveLink(revised) };
}

export async function getPayPalSubscription(id: string, fetchImpl?: typeof fetch): Promise<PayPalSubscription> {
  if (!/^I-[A-Z0-9]{6,40}$/.test(id)) throw new PayPalError('That is not a PayPal subscription id.', 400);
  return paypal<PayPalSubscription>('GET', `/v1/billing/subscriptions/${id}`, undefined, fetchImpl);
}

export async function cancelPayPalSubscription(id: string, reason: string, fetchImpl?: typeof fetch): Promise<void> {
  await paypal<void>('POST', `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { reason: reason.slice(0, 127) }, fetchImpl);
}

/**
 * Whether a webhook really came from PayPal, asked of PayPal itself.
 *
 * Without this anyone could POST themselves a paid plan. The body is passed
 * back exactly as received, because the signature covers those bytes.
 */
export async function verifyWebhook(headers: Headers, raw: string, fetchImpl?: typeof fetch): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const get = (name: string) => headers.get(name) ?? '';
  if (!get('paypal-transmission-sig')) return false;
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return false;
  }
  const result = await paypal<{ verification_status?: string }>(
    'POST',
    '/v1/notifications/verify-webhook-signature',
    {
      auth_algo: get('paypal-auth-algo'),
      cert_url: get('paypal-cert-url'),
      transmission_id: get('paypal-transmission-id'),
      transmission_sig: get('paypal-transmission-sig'),
      transmission_time: get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: event,
    },
    fetchImpl,
  );
  return result?.verification_status === 'SUCCESS';
}

/** For tests: forget the cached access token. */
export function resetPayPalToken() {
  token = null;
}
