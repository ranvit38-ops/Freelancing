/**
 * Paying, end to end, through the real interface and a stand-in PayPal.
 *
 * Needs a server that is NOT in pilot mode (a pilot never bills), with the
 * fakes running and PayPal pointed at them:
 *
 *   PAYPAL_API_BASE=http://127.0.0.1:4558 PAYPAL_CLIENT_ID=fake PAYPAL_CLIENT_SECRET=fake \
 *   PAYPAL_WEBHOOK_ID=WH-FAKE PAYPAL_PLAN_LAB_MONTHLY=P-LABM PAYPAL_PLAN_LAB_YEARLY=P-LABY \
 *   PAYPAL_PLAN_GROUP_MONTHLY=P-GRPM PAYPAL_PLAN_GROUP_YEARLY=P-GRPY \
 *   PAYPAL_PLAN_DEPARTMENT_MONTHLY=P-DEPM PAYPAL_PLAN_DEPARTMENT_YEARLY=P-DEPY  (plus the e2e basics)
 *   npm run e2e:billing
 *
 * Subscribe, get the terms by email, change plan, take a signed webhook and
 * refuse forged ones, cancel inside Labquill and keep the plan until the end
 * of the paid period, then subscribe again.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3001';
const MAIL = process.env.E2E_FAKE_MAIL ?? 'http://127.0.0.1:4556';
const PAYPAL = process.env.E2E_FAKE_PAYPAL ?? 'http://127.0.0.1:4558';
const email = `payer-${Date.now()}@labquill.test`;
const results = [];
let errors = [];

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// The app and the stand-ins only; "PayPal" here is the fake on :4558.
await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));

async function step(name, fn) {
  errors = [];
  try {
    await fn();
    if (errors.length) throw new Error(errors.join('\n      '));
    results.push(true);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push(false);
    console.log(`  ✗ ${name}\n      ${String(error?.message ?? error).split('\n').slice(0, 8).join('\n      ')}`);
  }
}
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const expectText = (text, timeout = 15_000) =>
  page.getByText(text, { exact: false }).and(page.locator(':visible')).first().waitFor({ timeout });
const mailTo = async () => (await (await fetch(`${MAIL}/__log`)).json()).filter((m) => JSON.stringify(m.body.to).includes(email));
const subscriptionId = async () => {
  const log = await (await fetch(`${PAYPAL}/__log`)).json();
  return [...JSON.stringify(log).matchAll(/subscriptions\/(I-FAKE\d+)/g)].map((m) => m[1]).at(-1);
};
const webhook = (body, sig) =>
  fetch(`${BASE}/api/paypal/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(sig ? { 'paypal-transmission-sig': sig, 'paypal-transmission-id': 't1', 'paypal-transmission-time': new Date().toISOString(), 'paypal-cert-url': 'https://api.paypal.com/cert', 'paypal-auth-algo': 'SHA256withRSA' } : {}),
    },
    body: JSON.stringify(body),
  });

console.log(`\nLabquill billing against ${BASE}\n`);

await step('a new lab signs up and sees the renewal terms beside the subscribe buttons', async () => {
  await page.goto(`${BASE}/signup`);
  await page.fill('#name', 'Pat Payer');
  await page.fill('#email', email);
  await page.fill('#password', 'a-very-long-password');
  if (await page.locator('#workspaceName').count()) await page.fill('#workspaceName', 'Paying Lab');
  await page.check('#agreeTerms');
  await page.click('button[type=submit]');
  await page.waitForURL(/dashboard|start/);
  await page.goto(`${BASE}/billing`);
  const terms = await page.locator('[data-renewal-terms]').innerText();
  assert(/renew automatically/.test(terms) && /Cancel plan/.test(terms), terms);
  assert(await page.locator('[data-renewal-terms] a[href="/terms"]').count(), 'no link to the Terms');
  await expectText('Lab, $49 a month');
  await expectText('Lab, $490 a year');
});

await step('leaving PayPal without subscribing says nothing was charged', async () => {
  await page.goto(`${BASE}/billing?checkout=cancelled`);
  await expectText('Nothing was charged');
});

await step('subscribing goes through PayPal and comes back on the plan', async () => {
  await page.goto(`${BASE}/billing`);
  await page.getByRole('button', { name: 'Lab, $49 a month' }).click();
  await page.waitForURL(/checkout=success/, { timeout: 20_000 });
  await expectText('Subscribed');
  await expectText('$49 a month, through PayPal');
  assert(await page.getByRole('button', { name: 'Your current plan, $49 a month' }).isDisabled(), 'can subscribe to the plan already held');
});

await step('the owner gets the renewal terms and how to cancel by email, once', async () => {
  const mails = await mailTo();
  const started = mails.filter((m) => /Lab plan/.test(m.body.subject));
  assert(started.length === 1, `${started.length} confirmation emails`);
  const text = started[0].body.text;
  assert(/renews automatically/.test(text) && /Cancel plan/.test(text) && /\$49 a month/.test(text), text);
  await page.getByRole('button', { name: /Refresh from PayPal/ }).click();
  await expectText('PayPal says');
  assert((await mailTo()).filter((m) => /Lab plan/.test(m.body.subject)).length === 1, 'refreshing sent the confirmation again');
});

await step('webhooks: forged and unsigned are refused, a signed one is handled once', async () => {
  const id = await subscriptionId();
  const event = { id: `WH-EVT-${Date.now()}`, event_type: 'PAYMENT.SALE.COMPLETED', resource_type: 'sale', resource: { billing_agreement_id: id } };
  assert((await webhook(event)).status === 400, 'unsigned accepted');
  assert((await webhook(event, 'forged')).status === 400, 'forged accepted');
  const first = await webhook(event, 'fake-good-signature');
  assert(first.status === 200 && (await first.json()).received, 'signed refused');
  const again = await (await webhook(event, 'fake-good-signature')).json();
  assert(again.duplicate === true, 'a replay was handled twice');
});

await step('changing plan goes back through PayPal and confirms the new price', async () => {
  await page.goto(`${BASE}/billing`);
  await page.getByRole('button', { name: 'Group, $990 a year' }).click();
  await page.waitForURL(/checkout=success/, { timeout: 20_000 });
  await expectText('$990 a year, through PayPal');
  assert((await mailTo()).some((m) => /Group plan/.test(m.body.subject) && /\$990 a year/.test(m.body.text)), 'no confirmation of the new price');
});

await step('cancelling inside Labquill stops payment but keeps the plan until the paid period ends', async () => {
  await page.goto(`${BASE}/billing`);
  // The box must be ticked: the browser will not send the form without it.
  assert(await page.locator('input[name=confirm][required]').count(), 'cancel needs no confirmation');
  await page.locator('input[name=confirm]').check();
  await page.getByRole('button', { name: 'Cancel plan' }).click();
  // The page redraws as cancelled: the form goes, and the notice says until when.
  await expectText('stays active until');
  await page.reload();
  await expectText('stays active until');
  assert(!(await page.getByRole('button', { name: 'Cancel plan' }).count()), 'still offers to cancel a cancelled plan');
  assert(!(await page.locator('body').innerText()).includes('read-only because'), 'cancelled lab went read-only at once');
  const cancelled = (await mailTo()).filter((m) => /is cancelled/.test(m.body.subject));
  assert(cancelled.length === 1 && /nothing more will be charged/.test(cancelled[0].body.text), 'no cancellation email');
});

await step('subscribing again after cancelling starts a new subscription', async () => {
  await page.getByRole('button', { name: 'Lab, $49 a month' }).click();
  await page.waitForURL(/checkout=success/, { timeout: 20_000 });
  await expectText('$49 a month, through PayPal');
});

await browser.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
