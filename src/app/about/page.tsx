import type { Metadata } from "next";
import site from "@/site.config";
import { Section } from "@/components/Section";

export const metadata: Metadata = {
  title: "About",
  description: site.about.heading,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <Section eyebrow="About" heading={site.about.heading}>
        <div className="mx-auto max-w-2xl space-y-4 text-lg text-muted">
          {site.about.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </Section>

      {site.about.values.length > 0 && (
        <Section className="bg-surface" heading="What we value">
          <div className="grid gap-6 sm:grid-cols-3">
            {site.about.values.map((v) => (
              <div key={v.title} className="rounded-brand border border-border bg-bg p-6">
                {v.icon && (
                  <span aria-hidden="true" className="text-3xl">
                    {v.icon}
                  </span>
                )}
                <h3 className="mt-4 text-lg font-bold">{v.title}</h3>
                <p className="mt-2 text-sm text-muted">{v.description}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
