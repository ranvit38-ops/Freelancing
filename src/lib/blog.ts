import fs from "node:fs";
import path from "node:path";
import site from "@/site.config";
import type { BlogPostMeta } from "@/lib/site-config.schema";

/**
 * Blog content lives in two places, by design:
 *   - Post METADATA (title, slug, date, excerpt) → site.config.ts `blog.posts`
 *   - Post BODY (markdown) → src/content/blog/<slug>.md
 *
 * This keeps listings/SEO config-driven while letting writers edit prose in
 * plain markdown files. Body rendering is intentionally minimal (paragraphs +
 * "## " headings) to avoid extra markdown dependencies; swap in MDX/remark if
 * a client needs richer formatting.
 */
const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog");

export function getAllPosts(): BlogPostMeta[] {
  return [...site.blog.posts].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostMeta(slug: string): BlogPostMeta | undefined {
  return site.blog.posts.find((p) => p.slug === slug);
}

/** Returns the raw markdown body for a slug, or null if the file is missing. */
export function getPostBody(slug: string): string | null {
  const file = path.join(BLOG_DIR, `${slug}.md`);
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
