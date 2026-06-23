import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/Section";

export const metadata: Metadata = {
  title: "Checkout Cancelled",
  robots: { index: false },
};

/** Stripe redirects here if the customer cancels checkout. No charge was made. */
export default function CheckoutCancelPage() {
  return (
    <Section>
      <div className="mx-auto max-w-lg rounded-brand border border-border bg-surface p-8 text-center">
        <p className="text-5xl" aria-hidden="true">
          🛒
        </p>
        <h1 className="mt-4 text-3xl font-bold">Checkout cancelled</h1>
        <p className="mt-3 text-muted">
          No worries — you haven&apos;t been charged. Your cart is still here whenever you&apos;re
          ready.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/services" className="btn-primary">
            Back to services
          </Link>
          <Link href="/contact" className="btn-secondary">
            Need help?
          </Link>
        </div>
      </div>
    </Section>
  );
}
