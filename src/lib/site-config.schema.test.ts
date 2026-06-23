import { describe, it, expect } from "vitest";
import { siteConfigSchema } from "@/lib/site-config.schema";
import site from "@/site.config";

describe("siteConfigSchema", () => {
  it("validates the shipped demo config", () => {
    expect(siteConfigSchema.safeParse(site).success).toBe(true);
  });

  it("rejects a hex color (must be 'R G B' channels)", () => {
    const bad = { ...site, theme: { ...site.theme, colors: { ...site.theme.colors, brand: "#2563eb" } } };
    expect(siteConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid company url", () => {
    const bad = { ...site, company: { ...site.company, url: "not-a-url" } };
    expect(siteConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("defaults a product's stripePriceId to an empty string", () => {
    const parsed = siteConfigSchema.parse(site);
    for (const item of parsed.products.items) {
      expect(typeof item.stripePriceId).toBe("string");
    }
  });
});
