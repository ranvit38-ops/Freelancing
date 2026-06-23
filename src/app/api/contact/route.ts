import { NextResponse } from "next/server";
import site from "@/site.config";
import { contactSchema } from "@/lib/contact-schema";
import { sendContactEmails } from "@/lib/emails";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSoftwareAdapter } from "@/software-adapter";

/**
 * Contact form handler:
 *   1. Re-validates input (never trust the client).
 *   2. Drops honeypot hits silently (pretend success so bots don't learn).
 *   3. Rate-limits by IP.
 *   4. Emails the business + autoreplies the user via Resend.
 *   5. Forwards the lead to the client's software via the adapter (mock default).
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!site.features.contactForm) {
    return NextResponse.json({ ok: false, error: "Contact form is disabled." }, { status: 404 });
  }

  // Rate limit (best-effort; see lib/rate-limit.ts for the honest caveat).
  const ip = getClientIp(req.headers);
  const limit = rateLimit(`contact:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many messages. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  let parsed;
  try {
    parsed = contactSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Please check the form and try again." }, { status: 400 });
  }

  // Honeypot tripped → looks like success to the bot, but we do nothing.
  if (parsed.company && parsed.company.length > 0) {
    return NextResponse.json({ ok: true });
  }

  try {
    await sendContactEmails({ name: parsed.name, email: parsed.email, message: parsed.message });
  } catch (err) {
    console.error("[contact] Email send failed:", err);
    // Honest error if Resend isn't configured or the send failed.
    return NextResponse.json(
      {
        ok: false,
        error:
          "We couldn't send your message right now. Please email us directly at " +
          (site.contact.inboxEmail ?? site.contact.email) +
          ".",
      },
      { status: 502 }
    );
  }

  // Forward to client's software (non-fatal — emails already went out).
  try {
    await getSoftwareAdapter().createLead({
      name: parsed.name,
      email: parsed.email,
      message: parsed.message,
      source: "website-contact-form",
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[contact] Lead forwarding failed:", err);
  }

  return NextResponse.json({ ok: true });
}
