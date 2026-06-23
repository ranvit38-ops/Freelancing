# RESKIN.md — Spin up a new client

Everything brand-specific lives in **`site.config.ts`** plus a few assets and
env vars. You should never edit components to re-brand. Budget ~30–60 minutes
per client for the config + assets, plus external account setup (Stripe, domain,
email DNS) which depends on the client.

---

## 1. Edit `site.config.ts`

Open `site.config.ts` (repo root) and replace the demo "Northwind Studio"
values. It's validated by Zod at startup, so anything malformed fails loudly.

- [ ] **`features`** — toggle `ecommerce`, `contactForm`, `booking`, `blog`
      on/off for this client. Disabled features drop from nav, sitemap, and
      routes automatically.
- [ ] **`company`** — name, legalName, tagline, description, `logo` path,
      `url` (the real production domain), foundedYear.
- [ ] **`contact`** — email, `phone` (rendered as a `tel:` link), address,
      `inboxEmail` (where contact-form mail goes).
- [ ] **`social`** — platform + URL for each social profile.
- [ ] **`theme.colors`** — brand palette as **"R G B" channels** (not hex).
      Convert hex → channels (e.g. `#2563eb` → `37 99 235`). These drive every
      `brand`/`bg`/`fg` Tailwind token site-wide.
- [ ] **`theme.fonts`** — font-family names. If using a custom web font, also
      load it (e.g. `next/font`) in `src/app/layout.tsx` and point
      `--font-sans`/`--font-heading` at it.
- [ ] **`nav`** — header/footer links.
- [ ] **`seo`** — titleTemplate, default title/description, locale, twitter
      handle. (OG image is generated automatically from the brand.)
- [ ] **`home` / `about`** — all marketing copy (hero, features, values, body).
- [ ] **`products.items`** — each service/product, its `priceDisplay`, `mode`
      (`payment` or `subscription`), `features`, and **`stripePriceId`**
      (see step 4).
- [ ] **`booking`** — heading/body and a real `embedUrl` + `provider`
      (`calcom`/`calendly`) if you have one; otherwise leave empty for the
      honest "not configured" notice.
- [ ] **`blog.posts`** — metadata for each post (see step 3).
- [ ] **`legal`** — privacy/terms URLs.

---

## 2. Swap assets (in `public/`)

- [ ] Replace **`public/logo.svg`** with the client's logo (update the path in
      `company.logo` if the filename differs; PNG/SVG both fine).
- [ ] Optional: add `company.logoDark` for dark backgrounds.
- [ ] Optional `favicon`: drop `src/app/icon.png` (Next picks it up).
- [ ] Optional custom social card: add an image to `public/` and reference it
      in `layout.tsx` `metadata.openGraph.images` (otherwise the dynamic OG
      image is used).

---

## 3. Blog content (if `features.blog`)

For each entry in `blog.posts`, create a matching markdown file at
`src/content/blog/<slug>.md`. Minimal formatting: blank lines split paragraphs,
`## ` starts a subheading. Delete the demo posts + their `.md` files if unused.

---

## 4. Per-client external accounts (checklist)

These can't be templated — each client needs their own accounts.

### Stripe (if `features.ecommerce`)
- [ ] Create/locate the client's **Stripe account**.
- [ ] Create **Products + Prices** (one-time or recurring). Recurring prices
      must pair with `mode: "subscription"`.
- [ ] Paste each **Price ID** (`price_…`) into `products.items[].stripePriceId`.
- [ ] Set `STRIPE_SECRET_KEY` (test first, live at launch).
- [ ] After deploy, create a **webhook endpoint** →
      `https://<domain>/api/stripe/webhook`, subscribe to
      `checkout.session.completed` + `payment_intent.payment_failed`, and put its
      `whsec_…` in `STRIPE_WEBHOOK_SECRET`.

### Domain
- [ ] Point the client's domain at Vercel; set `NEXT_PUBLIC_SITE_URL` and
      `company.url` to it.

### Email (if contact form / receipts)
- [ ] Create a **Resend** account + API key (`RESEND_API_KEY`).
- [ ] Verify the client's sending domain in Resend.
- [ ] Add **SPF, DKIM, DMARC** DNS records (see README → *Email deliverability*).
      ⚠️ Mail lands in spam until these are verified.
- [ ] Set `EMAIL_FROM` to a verified-domain address.

### Software integration (if the client wants it)
- [ ] Get the client's **API docs + credentials**. If none exist, this is
      **custom per-client engineering** — keep `SOFTWARE_ADAPTER=mock` until
      access is provided. See `src/software-adapter/README.md`.
- [ ] Implement `src/software-adapter/<vendor>.ts`, register it in
      `index.ts`, and set `SOFTWARE_ADAPTER=<vendor>` + its credentials.

### Legal
- [ ] Replace the placeholder `/privacy` and `/terms` pages with the client's
      reviewed legal text. **Do not ship the placeholders to production.**

---

## 5. Verify before launch

- [ ] `npm run typecheck && npm run lint && npm test && npm run build` all pass.
- [ ] Click every nav item; check responsive + keyboard navigation.
- [ ] Test a Stripe purchase end-to-end in test mode (receipt email arrives).
- [ ] Submit the contact form (business notification + autoreply arrive).
- [ ] Confirm OG image + metadata via a social card validator.
- [ ] Swap Stripe to **live** keys and flip `NEXT_PUBLIC_SITE_URL` to prod.
