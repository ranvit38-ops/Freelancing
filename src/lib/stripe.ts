import Stripe from "stripe";
import { requireStripe } from "@/lib/env";

/**
 * Lazily constructs the Stripe client so the app can boot without keys.
 * Calling this without STRIPE_SECRET_KEY set throws a clear, actionable error
 * (see requireStripe) rather than failing silently or faking success.
 *
 * Defaults to TEST mode keys — use sk_test_... until you're ready to go live.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const { secretKey } = requireStripe();
  cached = new Stripe(secretKey, {
    apiVersion: "2024-06-20",
    typescript: true,
    appInfo: { name: "reskinnable-business-site" },
  });
  return cached;
}
