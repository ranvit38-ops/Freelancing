import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  billingProblem,
  mapPayPalStatus,
  planEnvName,
  planForPayPalPlan,
  resetPayPalToken,
  verifyWebhook,
} from './paypal';

const saved = { ...process.env };
const ids = {
  PAYPAL_PLAN_LAB_MONTHLY: 'P-LABM',
  PAYPAL_PLAN_LAB_YEARLY: 'P-LABY',
  PAYPAL_PLAN_GROUP_MONTHLY: 'P-GRPM',
  PAYPAL_PLAN_GROUP_YEARLY: 'P-GRPY',
  PAYPAL_PLAN_DEPARTMENT_MONTHLY: 'P-DEPM',
  PAYPAL_PLAN_DEPARTMENT_YEARLY: 'P-DEPY',
};
beforeEach(() => {
  resetPayPalToken();
  Object.assign(process.env, { PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_WEBHOOK_ID: 'WH-1', ...ids });
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe('PayPal plans', () => {
  it('names one variable per plan and period, and maps ids back', () => {
    expect(planEnvName('group', 'year')).toBe('PAYPAL_PLAN_GROUP_YEARLY');
    expect(planForPayPalPlan('P-DEPY')).toEqual({ plan: 'department', interval: 'year' });
    expect(planForPayPalPlan('P-unknown')).toBeNull();
  });

  it('acts only on statuses that mean something', () => {
    expect(mapPayPalStatus('ACTIVE')).toBe('active');
    expect(mapPayPalStatus('SUSPENDED')).toBe('past_due');
    expect(mapPayPalStatus('CANCELLED')).toBe('canceled');
    expect(mapPayPalStatus('EXPIRED')).toBe('canceled');
    expect(mapPayPalStatus('APPROVAL_PENDING')).toBe('none');
  });

  it('says exactly what is missing before it will take a payment', () => {
    expect(billingProblem()).toBeNull();
    delete process.env.PAYPAL_PLAN_GROUP_YEARLY;
    expect(billingProblem()).toMatch(/PAYPAL_PLAN_GROUP_YEARLY is not set/);
    process.env.PAYPAL_PLAN_GROUP_YEARLY = 'P-GRPY';
    delete process.env.PAYPAL_WEBHOOK_ID;
    expect(billingProblem()).toMatch(/PAYPAL_WEBHOOK_ID/);
    delete process.env.PAYPAL_CLIENT_SECRET;
    expect(billingProblem()).toMatch(/PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET/);
  });
});

describe('PayPal webhooks', () => {
  /** A PayPal that signs in, then answers verification with `status`. */
  function paypalSays(status: string) {
    const sent: { url: string; body: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      sent.push({ url: String(url), body: String(init?.body ?? '') });
      if (String(url).endsWith('/v1/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ verification_status: status }), { status: 200 });
    }) as typeof fetch;
    return { fetchImpl, sent };
  }
  const headers = new Headers({
    'paypal-transmission-sig': 'sig',
    'paypal-transmission-id': 'tid',
    'paypal-transmission-time': '2026-10-29T00:00:00Z',
    'paypal-cert-url': 'https://api.paypal.com/cert',
    'paypal-auth-algo': 'SHA256withRSA',
  });

  it('trusts an event only when PayPal verifies it, passing the body back untouched', async () => {
    const ok = paypalSays('SUCCESS');
    expect(await verifyWebhook(headers, '{"id":"WH-EVT"}', ok.fetchImpl)).toBe(true);
    const asked = JSON.parse(ok.sent.at(-1)!.body);
    expect(asked.webhook_id).toBe('WH-1');
    expect(asked.webhook_event).toEqual({ id: 'WH-EVT' });
    expect(await verifyWebhook(headers, '{"id":"WH-EVT"}', paypalSays('FAILURE').fetchImpl)).toBe(false);
  });

  it('refuses without asking when the signature, the body or the webhook id is missing', async () => {
    const never = paypalSays('SUCCESS');
    expect(await verifyWebhook(new Headers(), '{}', never.fetchImpl)).toBe(false);
    expect(await verifyWebhook(headers, 'not json', never.fetchImpl)).toBe(false);
    delete process.env.PAYPAL_WEBHOOK_ID;
    expect(await verifyWebhook(headers, '{}', never.fetchImpl)).toBe(false);
    expect(never.sent).toHaveLength(0);
  });
});
