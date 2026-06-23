import type { Metadata } from "next";
import site from "@/site.config";
import { Section } from "@/components/Section";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "/terms" },
};

/**
 * SETUP REQUIRED: Replace with the client's real, lawyer-reviewed terms of
 * service. Placeholder only — not legal advice.
 */
export default function TermsPage() {
  return (
    <Section heading="Terms of Service">
      <div className="mx-auto max-w-2xl space-y-4 text-muted">
        <p className="rounded-brand border border-dashed border-border bg-surface p-4 text-sm">
          ⚠️ Placeholder — replace with {site.company.legalName}&apos;s reviewed terms before launch.
        </p>
        <p>
          These terms should set out the rules for using {site.company.name}&apos;s website and
          services, including payment terms, refunds, liability, and governing law.
        </p>
      </div>
    </Section>
  );
}
