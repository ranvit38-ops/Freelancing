import type { Metadata } from "next";
import { notFound } from "next/navigation";
import site from "@/site.config";
import { Section } from "@/components/Section";
import { getAllPosts, getPostMeta, getPostBody } from "@/lib/blog";

/** Pre-render every configured post at build time. */
export function generateStaticParams() {
  if (!site.features.blog) return [];
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getPostMeta(params.slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

/** Render the minimal markdown body: "## " → h2, blank lines split paragraphs. */
function renderBody(md: string) {
  const blocks = md.trim().split(/\n{2,}/);
  return blocks.map((block, i) => {
    if (block.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-8 text-2xl font-bold">
          {block.slice(3)}
        </h2>
      );
    }
    return (
      <p key={i} className="mt-4 leading-relaxed text-fg/90">
        {block}
      </p>
    );
  });
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  if (!site.features.blog) notFound();
  const post = getPostMeta(params.slug);
  if (!post) notFound();
  const body = getPostBody(params.slug);

  return (
    <Section>
      <article className="mx-auto max-w-2xl">
        <header className="mb-8">
          <p className="text-sm text-muted">
            <time dateTime={post.date}>
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>{" "}
            · {post.author}
          </p>
          <h1 className="mt-2 text-4xl font-bold">{post.title}</h1>
        </header>
        <div className="prose-content">
          {body ? (
            renderBody(body)
          ) : (
            // Honest fallback: metadata exists but the markdown file is missing.
            <p className="text-muted">
              This post&apos;s content file (<code>src/content/blog/{post.slug}.md</code>) is
              missing.
            </p>
          )}
        </div>
      </article>
    </Section>
  );
}
