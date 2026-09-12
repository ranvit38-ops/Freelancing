/**
 * Checks the Stripe setup without charging anything.
 *
 * Getting payments wrong is quiet. The keys look fine, checkout opens, and the
 * first real customer lands on the wrong price or a webhook that never fires.
 * This asks Stripe directly what each id actually is and compares it to what
 * the pricing page promises.
 *
 * Run it from the app directory:  npm run stripe:check
 *
 * It only ever reads. It creates nothing, charges nothing, cancels nothing.
 */
import { loadEnvConfig } from '@next/env';
import { PLANS, type PlanId } from '../src/lib/plans';

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

let failures = 0;
let warnings = 0;

const pass = (m: string) => console.log(`  OK    ${m}`);
const note = (m: string) => console.log(`        ${m}`);
/** Checked nothing, and said why. Not a failure: it needs Stripe to answer. */
const skip = (m: string) => console.log(`  ?     ${m}`);
const fail = (m: string, fix?: string) => {
  failures += 1;
  console.log(`  FIX   ${m}`);
  if (fix) note(fix);
};
const warn = (m: string, fix?: string) => {
  warnings += 1;
  console.log(`  WARN  ${m}`);
  if (fix) note(fix);
};

const key = process.env.STRIPE_SECRET_KEY;

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
  });
  // A network in the way (a company proxy, a captive portal) answers with HTML
  // or plain text. Parsing that as JSON turns a routing problem into a
  // baffling syntax error, so keep the raw text and let the caller say so.
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: null, raw: text.trim().slice(0, 120) };
  }
}

async function main() {

  console.log('\nStripe check\n');

  // The secret key.
  console.log('Secret key');
  if (!key) {
    fail(
      'STRIPE_SECRET_KEY is not set.',
      'Add it to .env.local in this folder, then run this again.',
    );
  } else if (key.startsWith('pk_')) {
    fail(
      'That is a publishable key, not a secret key.',
      'The secret key starts with sk_. A pk_ key cannot do any of this.',
    );
  } else if (key.startsWith('sk_live_')) {
    warn(
      'This is a LIVE key. Real cards will be charged.',
      'Use a key starting sk_test_ until a full test payment has gone through.',
    );
  } else if (key.startsWith('sk_test_')) {
    pass('Test-mode secret key found. Nothing here can charge a real card.');
  } else {
    warn('The key starts with neither sk_test_ nor sk_live_. It may be a restricted key.');
  }


  // Reaching the account tells us which mode the key is really in.
  let liveMode: boolean | null = null;
  if (key && !key.startsWith('pk_')) {
    console.log('\nAccount');
    try {
      const { status, body, raw } = await stripeGet('balance');
      if (raw !== undefined) {
        fail(
          `Something other than Stripe answered (HTTP ${status}): ${raw}`,
          'A proxy or network filter is intercepting the request. The key is probably fine.',
        );
      } else if (status === 401) {
        fail(
          'Stripe rejected the key.',
          'It may have been rolled, or copied with a character missing. Copy it again from the dashboard.',
        );
      } else if (status >= 400) {
        fail(`Stripe returned ${status}: ${body?.error?.message ?? 'unknown error'}`);
      } else {
        liveMode = body.livemode === true;
        pass(`Connected to Stripe in ${liveMode ? 'LIVE' : 'test'} mode.`);
      }
    } catch (error) {
      fail(
        `Could not reach api.stripe.com: ${(error as Error).message}`,
        'This machine has no route to Stripe. Nothing is wrong with the key if this is the only failure.',
      );
    }
  }

  // The plan prices, compared against what the pricing page claims.
  const PRICE_ENV: Record<Exclude<PlanId, 'free'>, string> = {
    lab: 'STRIPE_PRICE_LAB',
    group: 'STRIPE_PRICE_GROUP',
    department: 'STRIPE_PRICE_DEPARTMENT',
  };

  {
    console.log('\nPlan prices');
    for (const planId of Object.keys(PRICE_ENV) as Exclude<PlanId, 'free'>[]) {
      const envName = PRICE_ENV[planId];
      const plan = PLANS[planId];
      const id = process.env[envName];

      if (!id) {
        fail(
          `${envName} is not set, so the ${plan.name} plan cannot be bought.`,
          `Create a $${plan.monthly} per month recurring price in Stripe and paste its id here.`,
        );
        continue;
      }
      if (!id.startsWith('price_')) {
        fail(
          `${envName} is "${id}", which is not a price id.`,
          'A product id starts prod_ and will not work. Open the product and copy the id from the price row underneath it.',
        );
        continue;
      }
      if (liveMode === null) {
        skip(`${plan.name}: ${envName} looks like a price id, but Stripe could not be asked what it is.`);
        continue;
      }

      const { status, body } = await stripeGet(`prices/${id}`);
      if (status === 404) {
        fail(
          `${envName}: Stripe has no price ${id} in ${liveMode ? 'live' : 'test'} mode.`,
          liveMode
            ? 'It was probably created in test mode. Switch the dashboard to live mode and create it there.'
            : 'It was probably created in live mode. Turn on Test mode in the dashboard and create it again there.',
        );
        continue;
      }
      if (status >= 400) {
        fail(`${envName}: Stripe returned ${status}: ${body?.error?.message ?? 'unknown error'}`);
        continue;
      }

      const problems: string[] = [];
      if (!body.active) problems.push('it is archived in Stripe');
      if (body.recurring?.interval !== 'month') {
        problems.push(`it bills ${body.recurring?.interval ?? 'once, not on a schedule'}`);
      }
      if (body.unit_amount !== plan.monthly * 100) {
        problems.push(
          `Stripe charges ${(body.unit_amount / 100).toFixed(2)} but the pricing page says ${plan.monthly}`,
        );
      }
      if (body.currency !== 'usd') problems.push(`the currency is ${body.currency.toUpperCase()}`);

      if (problems.length === 0) {
        pass(`${plan.name}: $${plan.monthly} per month, matches the pricing page.`);
      } else {
        fail(`${plan.name} (${envName}): ${problems.join('; ')}.`);
      }
    }
  }

  // The webhook secret.
  console.log('\nWebhook');
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whsec) {
    fail(
      'STRIPE_WEBHOOK_SECRET is not set.',
      'Without it a payment succeeds in Stripe but this app never hears about it, so the customer pays and stays on the free plan.',
    );
  } else if (!whsec.startsWith('whsec_')) {
    fail(
      `STRIPE_WEBHOOK_SECRET is "${whsec.slice(0, 12)}...", which is not a webhook secret.`,
      'It starts whsec_.',
    );
  } else {
    pass('Webhook signing secret found.');
    note('This cannot tell whether Stripe can actually reach your server.');
    note('Only a test payment proves that. BILLING.md has the steps.');
  }

  console.log('');
  if (failures > 0) {
    console.log(
      `${failures} problem${failures === 1 ? '' : 's'} to fix before anyone can pay.` +
        (warnings ? ` ${warnings} warning${warnings === 1 ? '' : 's'} as well.` : ''),
    );
    console.log('');
    process.exit(1);
  }
  console.log('Stripe is configured. Now make one test payment end to end: see BILLING.md.');
  if (warnings) console.log(`${warnings} warning${warnings === 1 ? '' : 's'} above.`);
  console.log('');
}

main();
