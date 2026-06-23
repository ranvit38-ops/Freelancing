import { Resend } from "resend";
import { requireResend } from "@/lib/env";

/**
 * Lazily constructs the Resend client. Throws a clear error if email is used
 * before RESEND_API_KEY / EMAIL_FROM are configured — never silently no-ops.
 *
 * IMPORTANT: Emails will land in spam until the sending domain has SPF, DKIM,
 * and DMARC DNS records verified in Resend. See README "Email deliverability".
 */
let cached: Resend | null = null;

export function getResend(): { client: Resend; from: string } {
  const { apiKey, from } = requireResend();
  if (!cached) cached = new Resend(apiKey);
  return { client: cached, from };
}
