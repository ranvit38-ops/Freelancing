import type { Metadata } from "next";
import site from "@/site.config";
import { Section } from "@/components/Section";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" },
};

/**
 * SETUP REQUIRED: Replace with the client's real, lawyer-reviewed privacy
 * policy. This placeholder is NOT legal advice and must not ship as-is to a
 * production client — especially if collecting payments or personal data.
 */
export default function PrivacyPage() {
  return (
    <Section heading="Privacy Policy">
      <div className="mx-auto max-w-2xl space-y-4 text-muted">
        <p className="rounded-brand border border-dashed border-border bg-surface p-4 text-sm">
          ⚠️ Placeholder — replace with {site.company.legalName}&apos;s reviewed privacy policy
          before launch.
        </p>
        <p>
          {site.company.name} respects your privacy. This page should describe what data you
          collect (e.g. contact-form submissions, payment details handled by Stripe), how it is
          used, retained, and shared, and how visitors can exercise their rights.
        </p>
        <p>
          Questions? Contact{" "}
          <a className="text-brand hover:underline" href={`mailto:${site.contact.email}`}>
            {site.contact.email}
          </a>
          .
        </p>
      </div>
    </Section>
  );
}
