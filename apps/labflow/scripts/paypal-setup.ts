/**
 * Sets up, or checks, PayPal for Labquill.
 *
 *   npm run paypal:setup                       checks what is configured; changes nothing
 *   npm run paypal:setup -- --create           creates the product and the six plans
 *   npm run paypal:setup -- --create --webhook https://your-site/api/paypal/webhook
 *                                              also creates the webhook
 *
 * Creating prints the variables to paste into Render. Prices come from the
 * Pricing page (src/lib/plans.ts), so PayPal can never charge a different
 * amount from the one advertised. Checking asks PayPal what each plan id
 * really is and compares it with that price.
 *
 * Sandbox unless PAYPAL_ENV=live. Run it against the sandbox first.
 */
import { loadEnvConfig } from '@next/env';

import { PLANS } from '../src/lib/plans';
import { PAID_PLANS, apiBase, paypal, paypalLive, planEnvName, priceFor } from '../src/server/paypal';

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

type Interval = 'month' | 'year';
const INTERVALS: Interval[] = ['month', 'year'];
const args = process.argv.slice(2);
const create = args.includes('--create');
const webhookUrl = args.includes('--webhook') ? args[args.indexOf('--webhook') + 1] : null;

const EVENTS = [
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.RE-ACTIVATED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
  'PAYMENT.SALE.COMPLETED',
];

async function main() {
console.log(`\nPayPal ${paypalLive() ? 'LIVE (real money)' : 'sandbox (test money)'} at ${apiBase()}\n`);
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  console.log('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET first (from developer.paypal.com → Apps & Credentials).\n');
  process.exit(1);
}

if (create) {
  const product = await paypal<{ id: string }>('POST', '/v1/catalogs/products', {
    name: 'Labquill',
    description: 'Research workflow software for university labs',
    type: 'SERVICE',
    category: 'SOFTWARE',
  });
  console.log(`Created product ${product.id}. Paste these into Render:\n`);
  for (const plan of PAID_PLANS) {
    for (const interval of INTERVALS) {
      const created = await paypal<{ id: string }>('POST', '/v1/billing/plans', {
        product_id: product.id,
        name: `Labquill ${PLANS[plan].name} (${interval === 'month' ? 'monthly' : 'yearly'})`,
        status: 'ACTIVE',
        billing_cycles: [
          {
            frequency: { interval_unit: interval === 'month' ? 'MONTH' : 'YEAR', interval_count: 1 },
            tenure_type: 'REGULAR',
            sequence: 1,
            total_cycles: 0,
            pricing_scheme: { fixed_price: { value: String(priceFor(plan, interval)), currency_code: 'USD' } },
          },
        ],
        payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
      });
      console.log(`${planEnvName(plan, interval)}=${created.id}`);
    }
  }
  if (webhookUrl) {
    const hook = await paypal<{ id: string }>('POST', '/v1/notifications/webhooks', {
      url: webhookUrl,
      event_types: EVENTS.map((name) => ({ name })),
    });
    console.log(`PAYPAL_WEBHOOK_ID=${hook.id}`);
  } else {
    console.log('\nThen add a webhook (developer.paypal.com → your app → Webhooks) at');
    console.log('https://<your site>/api/paypal/webhook for these events, and put its id in PAYPAL_WEBHOOK_ID:');
    for (const name of EVENTS) console.log(`  ${name}`);
  }
  console.log('');
  process.exit(0);
}

let problems = 0;
for (const plan of PAID_PLANS) {
  for (const interval of INTERVALS) {
    const name = planEnvName(plan, interval);
    const id = process.env[name];
    if (!id) {
      problems += 1;
      console.log(`  FIX   ${name} is not set. Run with --create to make the plans.`);
      continue;
    }
    try {
      const found = await paypal<{
        status: string;
        billing_cycles: { frequency: { interval_unit: string }; pricing_scheme: { fixed_price: { value: string; currency_code: string } } }[];
      }>('GET', `/v1/billing/plans/${encodeURIComponent(id)}`);
      const cycle = found.billing_cycles.find((c) => c.pricing_scheme?.fixed_price) ?? found.billing_cycles[0]!;
      const price = Number(cycle.pricing_scheme.fixed_price.value);
      const unit = cycle.frequency.interval_unit;
      const wanted = priceFor(plan, interval);
      const issues = [
        found.status !== 'ACTIVE' ? `it is ${found.status}, not ACTIVE` : '',
        unit !== (interval === 'month' ? 'MONTH' : 'YEAR') ? `it bills every ${unit.toLowerCase()}` : '',
        price !== wanted || cycle.pricing_scheme.fixed_price.currency_code !== 'USD'
          ? `it charges ${price} ${cycle.pricing_scheme.fixed_price.currency_code}, but the Pricing page says ${wanted} USD`
          : '',
      ].filter(Boolean);
      if (issues.length) {
        problems += 1;
        console.log(`  FIX   ${name} (${id}): ${issues.join('; ')}.`);
      } else {
        console.log(`  OK    ${name}: $${wanted} a ${interval}`);
      }
    } catch (error) {
      problems += 1;
      console.log(`  FIX   ${name} (${id}): ${(error as Error).message}`);
    }
  }
}
if (!process.env.PAYPAL_WEBHOOK_ID) {
  problems += 1;
  console.log('  FIX   PAYPAL_WEBHOOK_ID is not set, so renewals and cancellations made in PayPal would not reach Labquill.');
}
console.log(problems ? `\n${problems} thing${problems === 1 ? '' : 's'} to fix.\n` : '\nPayPal is set up to match the Pricing page.\n');
process.exit(problems ? 1 : 0);
}

void main();
