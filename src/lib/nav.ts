import site from "@/site.config";
import type { NavItem, SiteConfig } from "@/lib/site-config.schema";

/**
 * Maps nav hrefs to the feature flag that must be on for them to show.
 * Routes not listed here are always visible.
 */
const FEATURE_ROUTES: Record<string, keyof SiteConfig["features"]> = {
  "/services": "ecommerce",
  "/blog": "blog",
  "/booking": "booking",
  "/contact": "contactForm",
};

/**
 * Pure filter: given nav items and the feature flags, drop entries whose
 * route is gated behind a disabled feature. Exported for unit testing.
 */
export function filterNav(
  items: NavItem[],
  features: SiteConfig["features"]
): NavItem[] {
  return items.filter((item) => {
    const flag = FEATURE_ROUTES[item.href];
    return flag ? features[flag] : true;
  });
}

/** Nav items from config, with entries for disabled features removed. */
export function visibleNav(): NavItem[] {
  return filterNav(site.nav, site.features);
}
