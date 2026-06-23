import site from "@/site.config";
import type { NavItem } from "@/lib/site-config.schema";

/**
 * Maps nav hrefs to the feature flag that must be on for them to show.
 * Routes not listed here are always visible.
 */
const FEATURE_ROUTES: Record<string, keyof typeof site.features> = {
  "/services": "ecommerce",
  "/blog": "blog",
  "/booking": "booking",
  "/contact": "contactForm",
};

/** Nav items from config, with entries for disabled features removed. */
export function visibleNav(): NavItem[] {
  return site.nav.filter((item) => {
    const flag = FEATURE_ROUTES[item.href];
    return flag ? site.features[flag] : true;
  });
}
