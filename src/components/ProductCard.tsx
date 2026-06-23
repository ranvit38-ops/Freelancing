import site from "@/site.config";
import type { Product } from "@/lib/site-config.schema";
import { CheckoutButton } from "./CheckoutButton";

/** A pricing/service card. Buy button only renders when ecommerce is enabled. */
export function ProductCard({ product }: { product: Product }) {
  const configured = product.stripePriceId.trim().length > 0;

  return (
    <div
      className={`flex flex-col rounded-brand border bg-bg p-6 ${
        product.highlight ? "border-brand shadow-lg" : "border-border"
      }`}
    >
      {product.highlight && (
        <span className="mb-3 inline-flex w-fit rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
          Most popular
        </span>
      )}
      <h3 className="text-xl font-bold">{product.name}</h3>
      <p className="mt-2 text-sm text-muted">{product.description}</p>

      <p className="mt-4 text-3xl font-bold">
        {product.priceDisplay}
        {product.mode === "subscription" && (
          <span className="text-base font-normal text-muted"> billed monthly</span>
        )}
      </p>

      <ul className="mt-6 flex-1 space-y-2 text-sm">
        {product.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span aria-hidden="true" className="text-brand">
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {site.features.ecommerce ? (
          configured ? (
            <CheckoutButton
              productId={product.id}
              highlight={product.highlight}
              label={product.mode === "subscription" ? "Subscribe" : "Buy now"}
            />
          ) : (
            // Honest state: ecommerce on, but this product has no Stripe price yet.
            <div>
              <button type="button" disabled className="btn-secondary w-full opacity-60" title="Stripe price not configured">
                Checkout not configured
              </button>
              <p className="mt-2 text-xs text-muted">
                Add a Stripe Price ID in <code>site.config.ts</code> to enable purchase.
              </p>
            </div>
          )
        ) : (
          <a href="/contact" className={`w-full ${product.highlight ? "btn-primary" : "btn-secondary"}`}>
            Enquire
          </a>
        )}
      </div>
    </div>
  );
}
