import { z } from "zod";

/**
 * Server-side environment validation.
 *
 * Design choice: vars tied to optional features (Stripe, Resend) are validated
 * for *format* if present, but are not globally required — so a fresh clone
 * runs locally before you have any keys. When a feature actually needs a var,
 * use the `require*` helpers below, which throw a loud, specific error.
 *
 * NEXT_PUBLIC_* vars are the only ones safe to read in the browser.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Public — safe in the browser. Used for absolute URLs (Stripe redirects, etc.)
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url()
    .default("http://localhost:3000"),

  // Stripe (optional until ecommerce is wired up)
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^sk_(test|live)_/, "Must start with sk_test_ or sk_live_")
    .optional(),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .regex(/^whsec_/, "Must start with whsec_")
    .optional(),

  // Resend transactional email (optional until email is wired up)
  RESEND_API_KEY: z
    .string()
    .regex(/^re_/, "Must start with re_")
    .optional(),
  // The verified sender address, e.g. "Acme <hello@acme.com>".
  EMAIL_FROM: z.string().min(3).optional(),
  // Where contact submissions go. Falls back to site.config contact.inboxEmail.
  CONTACT_INBOX_EMAIL: z.string().email().optional(),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail loudly and clearly — this only triggers when a present var is malformed.
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables. See messages above and .env.example.");
}

export const env = parsed.data;

class MissingEnvError extends Error {
  constructor(varName: string, feature: string) {
    super(
      `Missing required env var "${varName}" needed for ${feature}. ` +
        `Add it to your .env (see .env.example) or disable the feature in site.config.ts.`
    );
    this.name = "MissingEnvError";
  }
}

/** Returns Stripe creds or throws a clear error if checkout/webhooks are used unconfigured. */
export function requireStripe() {
  if (!env.STRIPE_SECRET_KEY) throw new MissingEnvError("STRIPE_SECRET_KEY", "Stripe checkout");
  return { secretKey: env.STRIPE_SECRET_KEY };
}

export function requireStripeWebhookSecret() {
  if (!env.STRIPE_WEBHOOK_SECRET)
    throw new MissingEnvError("STRIPE_WEBHOOK_SECRET", "Stripe webhook verification");
  return env.STRIPE_WEBHOOK_SECRET;
}

/** Returns Resend creds or throws a clear error if email is sent unconfigured. */
export function requireResend() {
  if (!env.RESEND_API_KEY) throw new MissingEnvError("RESEND_API_KEY", "transactional email");
  if (!env.EMAIL_FROM) throw new MissingEnvError("EMAIL_FROM", "transactional email");
  return { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM };
}
