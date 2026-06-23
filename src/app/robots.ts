import type { MetadataRoute } from "next";
import site from "@/site.config";

/** Generates /robots.txt, pointing crawlers at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  const base = site.company.url.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Don't index transactional/checkout pages.
      disallow: ["/checkout/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
