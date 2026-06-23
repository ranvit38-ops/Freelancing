import type { Metadata } from "next";
import site from "@/site.config";
import { Section } from "@/components/Section";
import { ProductCard } from "@/components/ProductCard";

export const metadata: Metadata = {
  title: "Services",
  description: site.products.subheading,
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <Section eyebrow="Services" heading={site.products.heading} subheading={site.products.subheading}>
      {site.products.items.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {site.products.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <p className="text-center text-muted">No services configured yet.</p>
      )}

      {site.features.ecommerce && (
        <p className="mt-10 text-center text-sm text-muted">
          Payments are processed securely by Stripe. Prices shown are illustrative until live
          Stripe Price IDs are configured.
        </p>
      )}
    </Section>
  );
}
