# Connecting Stripe

Labvia's payment code is already written. This is the account setup only, and
none of it can be done from the code, it needs someone with legal authority
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
| Labvia Lab | 49.00 / month | |
| Labvia Group | 99.00 / month | |
| Labvia Department | 249.00 / month | |

Open each price and copy its ID, it starts with `price_`.

If you also want annual billing, add a second yearly price to the same product
(490 / 990 / 2490). The code uses whichever ID you put in the environment.

## 3. Put the keys in the environment

From **Developers → API keys**, copy the secret key. Use the **test** key
(`sk_test_…`) until you have taken a test payment.

```bash
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."     # step 4 produces this
STRIPE_PRICE_LAB="price_..."
STRIPE_PRICE_GROUP="price_..."
STRIPE_PRICE_DEPARTMENT="price_..."
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

Never commit these. `.env.local` is gitignored; on a host, use its environment
variable settings.

Then check them before going further:

```bash
npm run stripe:check
```

It asks Stripe what each id actually is and compares it to what the pricing
page promises: right mode, recurring monthly, right amount, not archived. It
only reads, and charges nothing. A price created with Test mode switched off is
the most common mistake, and this is what catches it.

## 4. Point the webhook at Labvia

**Developers → Webhooks → Add endpoint.**

- URL: `https://your-domain.com/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`

Copy the signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.

**This step is not optional.** The webhook is the only thing that writes
subscription state, without it a customer pays and nothing unlocks.

### Locally, or in a Codespace

A dashboard endpoint needs a public URL. While the app is only running on your
own machine or in a Codespace, use the Stripe CLI instead. It logs in to your
account, listens for events, and forwards them to the app over the connection
it opened, so nothing has to be reachable from the internet.

```bash
# Install (Codespaces and most Linux):
curl -fsSL https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public \
  | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" \
  | sudo tee /etc/apt/sources.list.d/stripe.list
sudo apt update && sudo apt install stripe

stripe login          # opens a browser to authorise this machine
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

The `listen` command prints `Your webhook signing secret is whsec_…`. That is
the value for `STRIPE_WEBHOOK_SECRET`. It is a different secret from the one a
dashboard endpoint gives you, and it changes each time unless you pass
`--load-from-webhooks-api`.

Leave `stripe listen` running in its own terminal while you test. Restart
`npm run dev` after adding the secret, because the app reads it at startup.

## 5. Turn on the customer portal

**Settings → Billing → Customer portal → Activate.** Allow customers to update
their card, see invoices and cancel. Labvia's "Manage billing" button opens
this; without it, that button errors.

## 6. Take a test payment

With test keys, subscribe using card `4242 4242 4242 4242`, any future expiry,
any CVC. Then check:

- `/billing` shows the plan as active
- Stripe shows the subscription and an invoice
- Inviting people stops at the number of people the plan covers
- The terminal running `stripe listen` shows the events arriving with `200`

A `400` in that terminal means the signing secret does not match. A connection
error means the app is not running on port 3001.

Cards worth trying, all with any future expiry and any CVC:

| Card number | What it does |
|---|---|
| 4242 4242 4242 4242 | succeeds |
| 4000 0000 0000 9995 | declined, insufficient funds |
| 4000 0025 0000 3155 | asks for 3D Secure authentication |

Only then swap in the live keys.

## What happens after that

Nothing manual. Stripe raises an invoice each month, charges the card, emails
the receipt, and retries a failed payment before anything lapses. Money reaches
your bank on Stripe's payout schedule (usually 2–7 days for a new account).

Stripe takes roughly 2.9% + 30¢ per transaction, about $1.72 of a $49 month.

## University buyers

Universities frequently pay by invoice or purchase order rather than card.
Checkout already collects a billing address and tax ID so the invoice satisfies
a finance office. For a department that cannot use a card at all, raise an
invoice manually in Stripe (**Invoices → Create**) and then comp the workspace
with the owner code below.

## Owner code

Setting `LABFLOW_OWNER_UNLOCK` to a long random string puts a redeem box on
`/billing`. Entering that code puts the current workspace on the Department
plan with no Stripe subscription, for your own workspace, a demo, or a
customer who paid by bank transfer.

It is compared in constant time against a SHA-256 digest, rate limited to five
attempts per ten minutes, requires a signed-in session, and logs every
redemption. Leave the variable unset and the box does not exist.
