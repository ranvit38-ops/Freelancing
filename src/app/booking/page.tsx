import type { Metadata } from "next";
import { notFound } from "next/navigation";
import site from "@/site.config";
import { Section } from "@/components/Section";

export const metadata: Metadata = {
  title: "Book a Call",
  description: site.booking.body,
  alternates: { canonical: "/booking" },
};

export default function BookingPage() {
  // If the feature is off, this route shouldn't exist.
  if (!site.features.booking) notFound();

  const { heading, body, embedUrl, provider } = site.booking;
  const configured = embedUrl.trim().length > 0 && provider !== "none";

  return (
    <Section eyebrow="Booking" heading={heading} subheading={body}>
      <div className="mx-auto max-w-3xl">
        {configured ? (
          // Real scheduler embed (Cal.com / Calendly). Loaded in an iframe.
          <div className="overflow-hidden rounded-brand border border-border">
            <iframe
              src={embedUrl}
              title={`Book a call with ${site.company.name}`}
              className="h-[700px] w-full"
              loading="lazy"
            />
          </div>
        ) : (
          // HONEST fallback — no fake calendar. Directs to contact instead.
          <div className="rounded-brand border border-dashed border-border bg-surface p-8 text-center">
            <h3 className="text-lg font-semibold">Online booking isn&apos;t set up yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              {/* SETUP REQUIRED: add a Cal.com or Calendly link to `booking.embedUrl`
                  in site.config.ts (and set `provider`) to enable scheduling. */}
              Add a Cal.com or Calendly link in <code>site.config.ts</code> to enable scheduling.
              In the meantime, reach us directly:
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a href={`mailto:${site.contact.email}`} className="btn-primary">
                Email us
              </a>
              {site.contact.phone && (
                <a
                  href={`tel:${site.contact.phone.replace(/[^\d+]/g, "")}`}
                  className="btn-secondary"
                >
                  Call {site.contact.phone}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
