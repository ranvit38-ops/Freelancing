import type { MetadataRoute } from "next";
import site from "@/site.config";
import { getAllPosts } from "@/lib/blog";

/** Generates /sitemap.xml from config + enabled features. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = site.company.url.replace(/\/$/, "");
  const now = new Date();

  const routes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];

  if (site.features.ecommerce) {
    routes.push({ url: `${base}/services`, lastModified: now, changeFrequency: "monthly", priority: 0.8 });
  }
  if (site.features.contactForm) {
    routes.push({ url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.6 });
  }
  if (site.features.booking) {
    routes.push({ url: `${base}/booking`, lastModified: now, changeFrequency: "yearly", priority: 0.6 });
  }
  if (site.features.blog) {
    routes.push({ url: `${base}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
    for (const post of getAllPosts()) {
      routes.push({
        url: `${base}/blog/${post.slug}`,
        lastModified: new Date(post.date),
        changeFrequency: "yearly",
        priority: 0.5,
      });
    }
  }

  return routes;
}
