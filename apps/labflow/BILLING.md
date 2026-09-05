# Connecting Stripe

LabFlow's payment code is already written. This is the account setup only, and
none of it can be done from the code — it needs someone with legal authority
over the bank account.

> **Before anything else.** Stripe requires the account holder to be 18 or over,
> or a registered business. If you are under 18 the account must be opened by a
> parent, guardian, or a company they set up. Money will land in whichever bank
> account is attached, so this decision is not a formality.

## 1. Create the account

Sign up at [dashboard.stripe.com/register](https://dashboard.stripe.com/register),
then complete **Activate payments**: legal entity, address, and the bank account
payouts go to. Until that is done you can only use test mode.

## 2. Create the three prices

**Products → Add product.** Make one product per plan, each with a **recurring
monthly** price:

| Product | Price | Notes |
|---|---|---|
| LabFlow Lab | 49.00 / month | |
| LabFlow Group | 99.00 / month | |
| LabFlow Department | 249.00 / month | |
| LabFlow extra seat | 9.00 / month | optional; used for seats beyond a plan |

Open each price and copy its ID — it starts with `price_`.

If you also want annual billing, add a second yearly price to the same product
(490 / 990 / 2490). The code uses whichever ID you put in the environment.

## 3. Put the keys in the environment

From **Developers → API keys**, copy the secret key. Use the **test** key
(`sk_test_…`) until you have taken a test payment.

```bash
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PRICE_LAB="price_..."
STRIPE_PRICE_GROUP="price_..."
STRIPE_PRICE_DEPARTMENT="price_..."
STRIPE_PRICE_SEAT="price_..."        # optional
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

Never commit these. `.env.local` is gitignored; on a host, use its environment
variable settings.

## 4. Point the webhook at LabFlow

**Developers → Webhooks → Add endpoint.**

- URL: `https://your-domain.com/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`

Copy the signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.

**This step is not optional.** The webhook is the only thing that writes
subscription state — without it a customer pays and nothing unlocks.

To test it locally, [install the Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

It prints a `whsec_…` for local use.

## 5. Turn on the customer portal

**Settings → Billing → Customer portal → Activate.** Allow customers to update
their card, see invoices and cancel. LabFlow's "Manage billing" button opens
this; without it, that button errors.

## 6. Take a test payment

With test keys, subscribe using card `4242 4242 4242 4242`, any future expiry,
any CVC. Then check:

- `/billing` shows the plan as active
- Stripe shows the subscription and an invoice
- Inviting people stops at the plan's seat limit

Only then swap in the live keys.

## What happens after that

Nothing manual. Stripe raises an invoice each month, charges the card, emails
the receipt, and retries a failed payment before anything lapses. Money reaches
your bank on Stripe's payout schedule (usually 2–7 days for a new account).

Stripe takes roughly 2.9% + 30¢ per transaction — about $1.72 of a $49 month.

## University buyers

Universities frequently pay by invoice or purchase order rather than card.
Checkout already collects a billing address and tax ID so the invoice satisfies
a finance office. For a department that cannot use a card at all, raise an
invoice manually in Stripe (**Invoices → Create**) and then comp the workspace
with the owner code below.

## Owner code

Setting `LABFLOW_OWNER_UNLOCK` to a long random string puts a redeem box on
`/billing`. Entering that code puts the current workspace on the Department
plan with no Stripe subscription — for your own workspace, a demo, or a
customer who paid by bank transfer.

It is compared in constant time against a SHA-256 digest, rate limited to five
attempts per ten minutes, requires a signed-in session, and logs every
redemption. Leave the variable unset and the box does not exist.
