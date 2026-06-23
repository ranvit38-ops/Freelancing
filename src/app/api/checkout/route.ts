import { NextResponse } from "next/server";
import { z } from "zod";
import site from "@/site.config";
import { getStripe } from "@/lib/stripe";
import { env } from "@/lib/env";

/**
 * Creates a Stripe Checkout Session for a configured product and returns the
 * hosted-checkout URL. Server-side only — the secret key never reaches the
 * browser. Uses Stripe TEST mode while STRIPE_SECRET_KEY is an sk_test_ key.
 */
export const runtime = "nodejs";

const bodySchema = z.object({ productId: z.string().min(1) });

export async function POST(req: Request) {
  // Guard: feature must be enabled.
  if (!site.features.ecommerce) {
    return NextResponse.json({ error: "E-commerce is not enabled." }, { status: 404 });
  }

  let productId: string;
  try {
    const json = await req.json();
    productId = bodySchema.parse(json).productId;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const product = site.products.items.find((p) => p.id === productId);
  if (!product) {
    return NextResponse.json({ error: "Unknown product." }, { status: 404 });
  }

  // Honest guard: refuse rather than charge against a missing/placeholder price.
  if (!product.stripePriceId.trim()) {
    return NextResponse.json(
      {
        error:
          "This product has no Stripe Price ID configured yet. " +
          "Add one in site.config.ts to enable checkout.",
      },
      { status: 503 }
    );
  }

  try {
    const stripe = getStripe(); // throws clearly if STRIPE_SECRET_KEY is unset
    const origin = env.NEXT_PUBLIC_SITE_URL;

    const session = await stripe.checkout.sessions.create({
      mode: product.mode, // "payment" | "subscription" from config
      line_items: [{ price: product.stripePriceId, quantity: 1 }],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      // Collect email so receipts/order emails can be sent from the webhook.
      ...(product.mode === "payment" ? { customer_creation: "always" } : {}),
      metadata: { productId: product.id, productName: product.name },
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Surface the real reason in server logs; keep client message generic but honest.
    console.error("[checkout] Failed to create session:", err);
    const message =
      err instanceof Error && err.message.includes("STRIPE_SECRET_KEY")
        ? "Payments are not configured on the server yet."
        : "Could not start checkout. Please try again later.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
