import site from "@/site.config";
import { getResend } from "@/lib/resend";

/**
 * Transactional email senders (Resend). Each throws if Resend isn't configured
 * (RESEND_API_KEY / EMAIL_FROM) — callers decide whether that's fatal. We never
 * pretend an email was sent.
 *
 * ⚠️ Deliverability: until the sending domain has SPF, DKIM, and DMARC verified
 * in Resend, these emails will likely land in spam. See README.
 */

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** Notifies the business of a new contact-form submission + autoreplies to user. */
export async function sendContactEmails(input: {
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  const { client, from } = getResend();
  const inbox = site.contact.inboxEmail ?? site.contact.email;

  // 1) Notification to the business.
  await client.emails.send({
    from,
    to: inbox,
    reply_to: input.email,
    subject: `New contact form message from ${input.name}`,
    text: `Name: ${input.name}\nEmail: ${input.email}\n\n${input.message}`,
  });

  // 2) Autoreply to the visitor.
  await client.emails.send({
    from,
    to: input.email,
    subject: `Thanks for contacting ${site.company.name}`,
    text:
      `Hi ${input.name},\n\n` +
      `Thanks for reaching out to ${site.company.name}. We've received your message ` +
      `and will get back to you shortly.\n\n` +
      `For reference, here's what you sent:\n"${input.message}"\n\n` +
      `— The ${site.company.name} team`,
  });
}

/** Sends an order/receipt email after a successful Stripe checkout. */
export async function sendReceiptEmail(input: {
  to: string;
  productName: string;
  amountTotal: number;
  currency: string;
  sessionId: string;
}): Promise<void> {
  const { client, from } = getResend();
  await client.emails.send({
    from,
    to: input.to,
    subject: `Your ${site.company.name} order confirmation`,
    text:
      `Thank you for your purchase!\n\n` +
      `Item: ${input.productName}\n` +
      `Amount: ${formatMoney(input.amountTotal, input.currency)}\n` +
      `Reference: ${input.sessionId}\n\n` +
      `If you have any questions, reply to this email or contact ${site.contact.email}.\n\n` +
      `— ${site.company.name}`,
  });
}
