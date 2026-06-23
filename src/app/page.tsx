import Link from "next/link";
import site from "@/site.config";
import { Section } from "@/components/Section";
import { ProductCard } from "@/components/ProductCard";

/** Home page — all copy comes from site.config.ts (home + products blocks). */
export default function HomePage() {
  const { hero, features, featuresHeading } = site.home;

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-surface to-bg">
        <div className="container-page py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">{hero.headline}</h1>
            <p className="mt-6 text-lg text-muted sm:text-xl">{hero.subheadline}</p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href={hero.primaryCta.href} className="btn-primary">
                {hero.primaryCta.label}
              </Link>
              {hero.secondaryCta && (
                <Link href={hero.secondaryCta.href} className="btn-secondary">
                  {hero.secondaryCta.label}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      {features.length > 0 && (
        <Section heading={featuresHeading}>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-brand border border-border bg-surface p-6">
                {f.icon && (
                  <span aria-hidden="true" className="text-3xl">
                    {f.icon}
                  </span>
                )}
                <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted">{f.description}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Products / services preview (only if ecommerce on and items exist) */}
      {site.features.ecommerce && site.products.items.length > 0 && (
        <Section
          className="bg-surface"
          eyebrow="Pricing"
          heading={site.products.heading}
          subheading={site.products.subheading}
        >
          <div className="grid gap-6 lg:grid-cols-3">
            {site.products.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </Section>
      )}

      {/* Closing CTA */}
      <Section>
        <div className="rounded-brand bg-brand px-6 py-12 text-center text-brand-fg sm:py-16">
          <h2 className="text-3xl font-bold">Ready to get started?</h2>
          <p className="mx-auto mt-3 max-w-xl opacity-90">{site.company.tagline}</p>
          <div className="mt-8 flex justify-center gap-3">
            {site.features.booking && (
              <Link href="/booking" className="btn bg-brand-fg text-brand hover:opacity-90">
                {site.booking.heading}
              </Link>
            )}
            {site.features.contactForm && (
              <Link href="/contact" className="btn border border-brand-fg/40 text-brand-fg hover:bg-brand-fg/10">
                Contact us
              </Link>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
