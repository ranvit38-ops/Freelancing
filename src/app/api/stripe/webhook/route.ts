import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { requireStripeWebhookSecret } from "@/lib/env";
import { sendReceiptEmail } from "@/lib/emails";
import { getSoftwareAdapter } from "@/software-adapter";

/**
 * Stripe webhook handler.
 *
 * SECURITY: every event is signature-verified against STRIPE_WEBHOOK_SECRET.
 * Unverified requests are rejected — never trust the body otherwise.
 *
 * Local testing:  stripe listen --forward-to localhost:3000/api/stripe/webhook
 * (the CLI prints a whsec_... — put it in STRIPE_WEBHOOK_SECRET). See README.
 */
export const runtime = "nodejs";
// We need the raw body for signature verification — disable any body parsing.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let secret: string;
  try {
    secret = requireStripeWebhookSecret(); // throws clearly if unset
  } catch (err) {
    console.error("[webhook]", err);
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    // Signature mismatch / tampering / wrong secret.
    console.error("[webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCompletedCheckout(session);
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        // Handle failed payments gracefully — log; no order is recorded.
        console.warn(
          `[webhook] Payment failed for intent ${intent.id}:`,
          intent.last_payment_error?.message ?? "unknown reason"
        );
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed":
        // Subscription lifecycle hooks — extend per client as needed.
        console.info(`[webhook] ${event.type} received.`);
        break;
      default:
        // Acknowledge unhandled events so Stripe stops retrying.
        console.info(`[webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    // Returning 500 makes Stripe retry — good for transient failures.
    console.error(`[webhook] Error handling ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCompletedCheckout(session: Stripe.Checkout.Session) {
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const productName = (session.metadata?.productName as string) ?? "your order";

  // 1) Send a receipt/order email (best-effort; never blocks the 200 response).
  if (email) {
    try {
      await sendReceiptEmail({
        to: email,
        productName,
        amountTotal: session.amount_total ?? 0,
        currency: session.currency ?? "usd",
        sessionId: session.id,
      });
    } catch (err) {
      // Honest: log if email isn't configured; don't fail the webhook.
      console.error("[webhook] Receipt email not sent:", err);
    }
  }

  // 2) Record the order in the client's software via the adapter (mock by default).
  try {
    await getSoftwareAdapter().recordOrder({
      orderId: session.id,
      email: email ?? "",
      amountTotal: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      items: [],
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[webhook] recordOrder failed:", err);
  }
}
