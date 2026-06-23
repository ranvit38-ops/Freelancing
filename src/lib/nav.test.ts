import { describe, it, expect } from "vitest";
import { filterNav } from "@/lib/nav";
import type { NavItem, SiteConfig } from "@/lib/site-config.schema";

const items: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Services", href: "/services" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

const allOn: SiteConfig["features"] = {
  ecommerce: true,
  contactForm: true,
  booking: true,
  blog: true,
};

describe("filterNav", () => {
  it("keeps every item when all features are enabled", () => {
    expect(filterNav(items, allOn).map((i) => i.href)).toEqual([
      "/",
      "/about",
      "/services",
      "/blog",
      "/contact",
    ]);
  });

  it("drops feature-gated routes when their flag is off", () => {
    const hrefs = filterNav(items, { ...allOn, ecommerce: false, blog: false }).map(
      (i) => i.href
    );
    expect(hrefs).not.toContain("/services");
    expect(hrefs).not.toContain("/blog");
    expect(hrefs).toContain("/about");
    expect(hrefs).toContain("/contact");
  });

  it("always keeps ungated routes like / and /about", () => {
    const hrefs = filterNav(items, {
      ecommerce: false,
      contactForm: false,
      booking: false,
      blog: false,
    }).map((i) => i.href);
    expect(hrefs).toEqual(["/", "/about"]);
  });
});
