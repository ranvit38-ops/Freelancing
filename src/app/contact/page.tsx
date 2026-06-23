import type { Metadata } from "next";
import site from "@/site.config";
import { Section } from "@/components/Section";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with ${site.company.name}.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const addr = site.contact.address;
  const telHref = site.contact.phone ? site.contact.phone.replace(/[^\d+]/g, "") : null;

  return (
    <Section eyebrow="Contact" heading="Let's talk">
      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <p className="text-lg text-muted">
            Have a project in mind or a question? Send us a message and we&apos;ll get back to you.
          </p>

          <dl className="mt-8 space-y-4 text-sm">
            <div>
              <dt className="font-semibold">Email</dt>
              <dd>
                <a className="text-brand hover:underline" href={`mailto:${site.contact.email}`}>
                  {site.contact.email}
                </a>
              </dd>
            </div>
            {site.contact.phone && telHref && (
              <div>
                <dt className="font-semibold">Phone</dt>
                <dd>
                  {/* tel: click-to-call link */}
                  <a className="text-brand hover:underline" href={`tel:${telHref}`}>
                    {site.contact.phone}
                  </a>
                </dd>
              </div>
            )}
            {addr && (
              <div>
                <dt className="font-semibold">Address</dt>
                <dd className="text-muted">
                  {addr.line1}
                  {addr.line2 ? `, ${addr.line2}` : ""}
                  <br />
                  {addr.city}, {addr.region} {addr.postalCode}, {addr.country}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-brand border border-border bg-surface p-6 sm:p-8">
          {site.features.contactForm ? (
            <ContactForm />
          ) : (
            <p className="text-muted">
              The contact form is disabled. Email us at{" "}
              <a className="text-brand hover:underline" href={`mailto:${site.contact.email}`}>
                {site.contact.email}
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}
