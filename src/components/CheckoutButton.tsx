"use client";

import { useState } from "react";

/**
 * Initiates Stripe Checkout for a product. Posts the product id to the
 * server route, which creates the session and returns a redirect URL.
 *
 * If Stripe isn't configured (no key / no price id), the server returns a
 * clear error which we surface honestly — we never fake a successful checkout.
 */
export function CheckoutButton({
  productId,
  label,
  highlight,
}: {
  productId: string;
  label: string;
  highlight?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout. Please try again.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
        className={`w-full ${highlight ? "btn-primary" : "btn-secondary"} disabled:opacity-60`}
      >
        {loading ? "Redirecting…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
