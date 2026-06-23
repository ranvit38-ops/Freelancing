import { z } from "zod";

/**
 * The single source of truth for what a client can configure.
 *
 * Everything brand-specific lives in `site.config.ts` (repo root) and is
 * validated against this schema at import time, so a malformed config fails
 * loudly during build/dev instead of rendering a broken site.
 *
 * To re-skin for a new client you edit `site.config.ts` only — never the
 * components. See RESKIN.md.
 */

/** A color expressed as "R G B" channels (e.g. "37 99 235"), used so we can
 *  emit `rgb(var(--brand) / <alpha-value>)` and keep Tailwind opacity utils. */
const rgbChannels = z
  .string()
  .regex(
    /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/,
    'Color must be "R G B" space-separated channels, e.g. "37 99 235"'
  );

const navItem = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
});

const socialLink = z.object({
  platform: z.enum([
    "twitter",
    "x",
    "facebook",
    "instagram",
    "linkedin",
    "youtube",
    "tiktok",
    "github",
  ]),
  url: z.string().url(),
});

const ctaSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
});

const featureSchema = z.object({
  /** Heading shown on cards/feature lists. */
  title: z.string().min(1),
  description: z.string().min(1),
  /** Optional emoji or icon name; components render text fallback if absent. */
  icon: z.string().optional(),
});

/**
 * A sellable product/service.
 *
 * `stripePriceId` links the product to a Stripe Price. Leave it empty while
 * developing; the checkout route will refuse to create a session and surface
 * a clear error rather than charging against a fake id.
 */
const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  /** Display price only — the REAL charged amount comes from Stripe. */
  priceDisplay: z.string().min(1),
  mode: z.enum(["payment", "subscription"]),
  // SETUP REQUIRED: paste the Stripe Price ID (price_...) for each product.
  stripePriceId: z.string().default(""),
  features: z.array(z.string()).default([]),
  highlight: z.boolean().default(false),
});

const blogPostMetaSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().min(1),
  date: z.string().min(1),
  author: z.string().min(1),
});

export const siteConfigSchema = z.object({
  /** Feature flags — toggle whole subsystems per client. */
  features: z.object({
    ecommerce: z.boolean(),
    contactForm: z.boolean(),
    booking: z.boolean(),
    blog: z.boolean(),
  }),

  company: z.object({
    name: z.string().min(1),
    legalName: z.string().min(1),
    tagline: z.string().min(1),
    description: z.string().min(1),
    /** Path under /public or absolute URL. */
    logo: z.string().min(1),
    logoDark: z.string().optional(),
    /** Used for absolute URLs in SEO/sitemap/OG and email links. */
    url: z.string().url(),
    foundedYear: z.number().int().optional(),
  }),

  contact: z.object({
    email: z.string().email(),
    /** E.164 or display string; rendered as a tel: link. */
    phone: z.string().optional(),
    address: z
      .object({
        line1: z.string(),
        line2: z.string().optional(),
        city: z.string(),
        region: z.string(),
        postalCode: z.string(),
        country: z.string(),
      })
      .optional(),
    /** Where contact-form submissions are emailed. Defaults to company email. */
    inboxEmail: z.string().email().optional(),
  }),

  social: z.array(socialLink).default([]),

  theme: z.object({
    colors: z.object({
      brand: rgbChannels,
      brandFg: rgbChannels,
      brandAccent: rgbChannels,
      bg: rgbChannels,
      surface: rgbChannels,
      fg: rgbChannels,
      muted: rgbChannels,
      border: rgbChannels,
    }),
    /** CSS font-family stacks; pair with a loaded font in layout if custom. */
    fonts: z.object({
      sans: z.string().min(1),
      heading: z.string().min(1),
    }),
    radius: z.string().default("0.5rem"),
  }),

  nav: z.array(navItem).default([]),

  seo: z.object({
    titleTemplate: z.string().min(1), // e.g. "%s · Acme"
    defaultTitle: z.string().min(1),
    defaultDescription: z.string().min(1),
    /**
     * Optional static OG image (path under /public or absolute URL).
     * By default the site generates a brand-colored OG image dynamically via
     * src/app/opengraph-image.tsx, so you usually don't need this. Provide it
     * only if a client wants a bespoke static social card; then reference it in
     * layout.tsx's metadata.openGraph.images.
     */
    ogImage: z.string().min(1).optional(),
    twitterHandle: z.string().optional(),
    locale: z.string().default("en_US"),
  }),

  /** Marketing copy for the home page — no copy is hardcoded in components. */
  home: z.object({
    hero: z.object({
      headline: z.string().min(1),
      subheadline: z.string().min(1),
      primaryCta: ctaSchema,
      secondaryCta: ctaSchema.optional(),
    }),
    features: z.array(featureSchema).default([]),
    featuresHeading: z.string().default("Why choose us"),
  }),

  about: z.object({
    heading: z.string().min(1),
    body: z.array(z.string().min(1)), // paragraphs
    values: z.array(featureSchema).default([]),
  }),

  /** Products/services section. Used for the services page and Stripe. */
  products: z.object({
    heading: z.string().min(1),
    subheading: z.string().min(1),
    items: z.array(productSchema).default([]),
  }),

  booking: z.object({
    heading: z.string().min(1),
    body: z.string().min(1),
    /**
     * SETUP REQUIRED (if booking enabled): a real scheduler embed URL such as
     * a Cal.com or Calendly link. If empty, the page shows an honest "not yet
     * configured" notice instead of a fake calendar.
     */
    embedUrl: z.string().default(""),
    provider: z.enum(["calcom", "calendly", "none"]).default("none"),
  }),

  blog: z.object({
    heading: z.string().min(1),
    subheading: z.string().min(1),
    posts: z.array(blogPostMetaSchema).default([]),
  }),

  legal: z.object({
    privacyUrl: z.string().default("/privacy"),
    termsUrl: z.string().default("/terms"),
  }),
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;
export type Product = z.infer<typeof productSchema>;
export type BlogPostMeta = z.infer<typeof blogPostMetaSchema>;
export type NavItem = z.infer<typeof navItem>;
export type SocialLink = z.infer<typeof socialLink>;
