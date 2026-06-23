import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import site from "@/site.config";
import { Section } from "@/components/Section";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description: site.blog.subheading,
  alternates: { canonical: "/blog" },
};

export default function BlogIndexPage() {
  if (!site.features.blog) notFound();
  const posts = getAllPosts();

  return (
    <Section eyebrow="Blog" heading={site.blog.heading} subheading={site.blog.subheading}>
      {posts.length > 0 ? (
        <ul className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="block h-full rounded-brand border border-border bg-surface p-6 transition hover:border-brand"
              >
                <p className="text-xs uppercase tracking-wide text-muted">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </p>
                <h2 className="mt-2 text-xl font-bold">{post.title}</h2>
                <p className="mt-2 text-sm text-muted">{post.excerpt}</p>
                <span className="mt-4 inline-block text-sm font-semibold text-brand">
                  Read more →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-muted">No posts yet.</p>
      )}
    </Section>
  );
}
