# Connecting PayPal

Labquill's payment code is already written. This is the account setup only. It
needs someone with legal authority over the money, so it cannot be done from
the code.

> **Before anything else.** PayPal requires the account holder to be 18 or over.
> If you are under 18, a parent or guardian, or a company they set up (an LLC is
> best), must open the PayPal Business account. Money lands in that account, and
> that person or company is who the Terms name, so this is not a formality.

## 1. Create the accounts

1. A **PayPal Business** account at [paypal.com/business](https://www.paypal.com/business),
   completed with the legal owner's details and a bank account for withdrawals.
2. At [developer.paypal.com](https://developer.paypal.com), log in with it and open
   **Apps & Credentials**. Stay on **Sandbox** for now and create an app. Copy its
   **Client ID** and **Secret**.

## 2. Set the keys (sandbox first)

In Render (or `.env.local` for local testing), never in a chat or a commit:

```
PAYPAL_ENV="sandbox"
PAYPAL_CLIENT_ID="..."
PAYPAL_CLIENT_SECRET="..."
```

`PAYPAL_ENV` is sandbox unless it says exactly `live`, so a half-finished setup
can never take real money.

## 3. Create the plans

From `apps/labflow`, with those three variables set:

```bash
npm run paypal:setup -- --create --webhook https://your-site.onrender.com/api/paypal/webhook
```

It creates the Labquill product and six plans (Lab, Group and Department, each
monthly and yearly) at exactly the prices on the Pricing page, plus the webhook,
and prints seven lines:

```
PAYPAL_PLAN_LAB_MONTHLY=P-...
PAYPAL_PLAN_LAB_YEARLY=P-...
PAYPAL_PLAN_GROUP_MONTHLY=P-...
PAYPAL_PLAN_GROUP_YEARLY=P-...
PAYPAL_PLAN_DEPARTMENT_MONTHLY=P-...
PAYPAL_PLAN_DEPARTMENT_YEARLY=P-...
PAYPAL_WEBHOOK_ID=WH-...
```

Paste all seven into Render and redeploy.

## 4. Check it

```bash
npm run paypal:setup
```

Without `--create` it changes nothing: it asks PayPal what each plan id really
is and compares the price and billing period with the Pricing page. Fix anything
it marks `FIX` before going further. `/billing` on the site also names anything
still missing.

## 5. Take a test payment

Turn off pilot mode for this (`LABFLOW_PILOT_MODE` empty), then on the deployed
site, signed in as a lab owner:

1. Billing, then **Lab, $49 a month**. PayPal opens.
2. Log in with a **sandbox personal account** (developer.paypal.com → Testing
   Tools → Sandbox Accounts) and approve.
3. You land back on Billing with the plan active, and the owner gets an email
   with the renewal terms and how to cancel.
4. **Cancel plan** on Billing: the plan stays active until the period ends, and a
   cancellation email arrives.

Only after that works end to end, repeat steps 1–4 of this file on the **Live**
tab with `PAYPAL_ENV="live"`. Live plan ids are different from sandbox ones.

## What happens after that

PayPal charges each month or year, emails its own receipts, and retries a failed
payment (three tries) before suspending. Labquill reads every change from
PayPal through the webhook, and the **Refresh from PayPal** button on Billing
re-reads it if a webhook was ever missed.

Labquill also emails, by law and by courtesy:

- the renewal terms and how to cancel, when a plan starts or changes;
- a confirmation when a plan is cancelled;
- a reminder about a month before a yearly plan renews.

These go to the lab's owners and admins, and need email (Resend) working.

PayPal's fees for US merchants are roughly 3.49% + 49¢ per payment, about
$2.20 of a $49 month. Check PayPal's current fee page; they change.

## University buyers

Universities often pay by invoice or purchase order rather than card. For a
department that cannot use PayPal, send an invoice from PayPal (**Invoicing →
Create invoice**), and once it is paid, comp the lab with the owner code below.

## Owner code

Setting `LABFLOW_OWNER_UNLOCK` to a long random string puts a redeem box on
`/billing`. Entering that code puts the current lab on the Department plan with
no PayPal subscription, for your own lab, a demo, or a customer who paid by
invoice.

It is compared in constant time against a SHA-256 digest, rate limited per
account, per address and across the whole server, requires a signed-in session,
and logs every redemption. Leave the variable unset and the box does not exist.
