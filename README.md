# Re-skinnable Business Website

A production-grade, **re-skinnable** business website built with Next.js (App
Router), TypeScript, and Tailwind. Sell it to multiple clients by editing
**one config file** (`site.config.ts`) and dropping in assets — no component
changes required.

> **Honesty first.** This README and the inline `// SETUP REQUIRED:` markers
> call out everything that needs *your* manual setup or that genuinely can't
> work without per-client integration. Nothing is faked.

---

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Stripe** — Checkout + signature-verified webhooks
- **Resend** — transactional email (contact + receipts)
- **Zod** — env + form validation · **React Hook Form** — forms
- Deploy target: **Vercel**. Fully runnable locally.

## What's a feature vs. what needs setup

| Capability | State out of the box |
| --- | --- |
| Pages, theming, nav, SEO, sitemap/robots, OG image | ✅ Works immediately from config |
| Contact form (validation, honeypot, rate limit) | ✅ Works once **Resend** is configured |
| Stripe checkout + webhooks | ✅ Works once **Stripe keys + Price IDs** are set |
| Order/receipt + contact emails | ✅ Works once **Resend + verified domain** is set |
| Phone | ✅ `tel:` click-to-call link from config (no Twilio) |
| Booking | ⚠️ Needs a real **Cal.com/Calendly** link, else honest "not configured" notice |
| "Connect to their software" | ⚠️ **Per-client custom work** — typed mock adapter ships; real one needs their API docs |
| Marketing email | ❌ Out of scope — separate platform + list management per client |

---

## Run locally

Requirements: Node 18.17+ (or 20+).

```bash
npm install
cp .env.example .env.local   # fill in values (all optional for a first boot)
npm run dev                  # http://localhost:3000
```

The site boots **without any keys** — features that need credentials degrade to
clear, honest states (e.g. "Checkout not configured") rather than breaking.

Useful scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm test            # vitest (unit tests for pure logic)
npm run build       # production build
```

---

## Environment variables

All are validated at startup by `src/lib/env.ts` (Zod). A malformed value
**fails loudly**. See `.env.example` for the documented list. Summary:

| Var | Required when | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | always (defaults to localhost) | Absolute URLs for Stripe/SEO/email |
| `STRIPE_SECRET_KEY` | ecommerce on | `sk_test_…` in dev |
| `STRIPE_WEBHOOK_SECRET` | webhooks | `whsec_…` from Stripe CLI / dashboard |
| `RESEND_API_KEY` | email used | `re_…` |
| `EMAIL_FROM` | email used | Verified sender, `"Name <addr@domain>"` |
| `CONTACT_INBOX_EMAIL` | optional | Overrides where contact mail lands |
| `SOFTWARE_ADAPTER` | optional | `mock` (default) until a real adapter exists |

**Never commit secrets.** `.env*` is gitignored; only `.env.example` is tracked.

---

## Testing Stripe locally (Stripe CLI)

1. Use **test mode** keys (`sk_test_…`) in `.env.local`.
2. Create test products/prices in the Stripe dashboard and paste each
   **Price ID** (`price_…`) into `site.config.ts` → `products.items[].stripePriceId`.
3. Forward webhooks to your local server:

   ```bash
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   The CLI prints a `whsec_…` — put it in `STRIPE_WEBHOOK_SECRET` and restart dev.
4. Trigger a test purchase from `/services`, or simulate an event:

   ```bash
   stripe trigger checkout.session.completed
   ```

5. Use Stripe's [test cards](https://stripe.com/docs/testing) (e.g.
   `4242 4242 4242 4242`, any future expiry/CVC).

The webhook **verifies signatures** — requests without a valid signature are
rejected. Failed payments (`payment_intent.payment_failed`) are logged and never
recorded as orders.

---

## Email deliverability (SPF, DKIM, DMARC) — read this

> ⚠️ **Without these DNS records, your email will land in spam (or be rejected).**
> This is not a code bug — it's how email authentication works.

In Resend, add and **verify your sending domain**, then add the DNS records
Resend gives you at your domain registrar / DNS host:

1. **SPF** — a `TXT` record on the domain authorizing Resend to send, e.g.
   `v=spf1 include:_spf.resend.com ~all` (use the exact value Resend shows).
2. **DKIM** — one or more `CNAME`/`TXT` records Resend provides, which sign your
   mail so receivers can verify it wasn't tampered with.
3. **DMARC** — a `TXT` record at `_dmarc.yourdomain.com`, e.g.
   `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` (start with `p=none`,
   tighten to `quarantine`/`reject` once you've confirmed alignment).

Until the domain shows **Verified** in Resend and these records propagate,
expect mail to land in spam. `EMAIL_FROM` must use the verified domain.

---

## Deploy to Vercel

1. Push this repo to GitHub and **Import** it in Vercel (framework auto-detected
   as Next.js).
2. Add all environment variables from `.env.example` in
   **Project → Settings → Environment Variables** (use **live** Stripe keys only
   when you're ready to go live).
3. Set `NEXT_PUBLIC_SITE_URL` to the production domain.
4. After the first deploy, create a **Stripe webhook endpoint** pointing at
   `https://yourdomain.com/api/stripe/webhook`, subscribe at least to
   `checkout.session.completed` and `payment_intent.payment_failed`, then copy
   its signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.
5. Add your custom domain in Vercel and update DNS.

---

## Project structure

```
site.config.ts                 ← the ONLY brand/content file you edit
src/
  app/                         ← routes (App Router)
    api/checkout/route.ts      ← creates Stripe Checkout sessions
    api/stripe/webhook/route.ts← signature-verified webhook
    api/contact/route.ts       ← contact form → email + lead adapter
    opengraph-image.tsx        ← dynamic, brand-colored OG image
    sitemap.ts / robots.ts     ← SEO
  components/                  ← all generic; nothing brand-hardcoded
  lib/                         ← env, theme, stripe, resend, emails, rate-limit
  software-adapter/            ← typed boundary for the client's software (mock default)
  content/blog/                ← markdown post bodies
```

See **`RESKIN.md`** to spin up a new client.
