import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/Section";
import site from "@/site.config";

export const metadata: Metadata = {
  title: "Order Confirmed",
  robots: { index: false },
};

/**
 * Stripe redirects here after successful checkout with ?session_id=...
 * We show a friendly confirmation. The order of record is established by the
 * signature-verified webhook — not by this page — so this stays display-only.
 */
export default function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  return (
    <Section>
      <div className="mx-auto max-w-lg rounded-brand border border-border bg-surface p-8 text-center">
        <p className="text-5xl" aria-hidden="true">
          ✅
        </p>
        <h1 className="mt-4 text-3xl font-bold">Thank you for your order!</h1>
        <p className="mt-3 text-muted">
          Your payment was successful. A confirmation email is on its way
          {site.features.contactForm ? "" : ""}. If anything looks off, contact us at{" "}
          <a className="text-brand hover:underline" href={`mailto:${site.contact.email}`}>
            {site.contact.email}
          </a>
          .
        </p>
        {searchParams.session_id && (
          <p className="mt-4 text-xs text-muted">
            Reference: <code>{searchParams.session_id}</code>
          </p>
        )}
        <div className="mt-8">
          <Link href="/" className="btn-primary">
            Back to home
          </Link>
        </div>
      </div>
    </Section>
  );
}
