import { siteConfigSchema, type SiteConfig } from "@/lib/site-config.schema";

/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  THE ONLY FILE YOU EDIT TO RE-SKIN FOR A NEW CLIENT.                   │
 * │  (Plus dropping their assets in /public and swapping env vars.)        │
 * │  See RESKIN.md for the full per-client checklist.                     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * This demo brand ("Northwind Studio") is intentionally generic. Replace the
 * values below with the client's real content, colors, and Stripe price IDs.
 *
 * Colors are "R G B" channels (not hex) so Tailwind opacity utilities work.
 * Convert hex → channels at e.g. https://www.rapidtables.com/convert/color/hex-to-rgb.html
 */
const config: SiteConfig = siteConfigSchema.parse({
  features: {
    ecommerce: true,
    contactForm: true,
    booking: true,
    blog: true,
  },

  company: {
    name: "Northwind Studio",
    legalName: "Northwind Studio LLC",
    tagline: "Design and build that moves your business forward.",
    description:
      "Northwind Studio is a full-service design and development studio helping growing businesses launch beautiful, high-performing digital products.",
    logo: "/logo.svg",
    // SETUP REQUIRED: set this to the client's real production domain.
    url: "https://example.com",
    foundedYear: 2018,
  },

  contact: {
    email: "hello@example.com",
    phone: "+1 (555) 010-2024",
    address: {
      line1: "123 Market Street",
      line2: "Suite 400",
      city: "Davis",
      region: "CA",
      postalCode: "95616",
      country: "USA",
    },
    // Where contact-form messages are delivered. Defaults to company email.
    inboxEmail: "hello@example.com",
  },

  social: [
    { platform: "linkedin", url: "https://www.linkedin.com/company/example" },
    { platform: "instagram", url: "https://instagram.com/example" },
    { platform: "x", url: "https://x.com/example" },
  ],

  theme: {
    colors: {
      brand: "37 99 235", // blue-600
      brandFg: "255 255 255",
      brandAccent: "14 165 233", // sky-500
      bg: "255 255 255",
      surface: "248 250 252", // slate-50
      fg: "15 23 42", // slate-900
      muted: "100 116 139", // slate-500
      border: "226 232 240", // slate-200
    },
    fonts: {
      sans: "Inter",
      heading: "Inter",
    },
    radius: "0.625rem",
  },

  nav: [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Services", href: "/services" },
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: "/contact" },
  ],

  seo: {
    titleTemplate: "%s · Northwind Studio",
    defaultTitle: "Northwind Studio — Design & Development",
    defaultDescription:
      "We design and build beautiful, high-performing websites and digital products for growing businesses.",
    ogImage: "/og.png",
    twitterHandle: "@example",
    locale: "en_US",
  },

  home: {
    hero: {
      headline: "Digital products that grow your business",
      subheadline:
        "From brand to launch, we design and build websites, apps, and stores that customers love and that convert.",
      primaryCta: { label: "See our services", href: "/services" },
      secondaryCta: { label: "Book a call", href: "/booking" },
    },
    featuresHeading: "What we do best",
    features: [
      {
        title: "Brand & Design",
        description:
          "Distinctive visual identities and interfaces grounded in research and built to scale.",
        icon: "🎨",
      },
      {
        title: "Web & App Development",
        description:
          "Fast, accessible, SEO-ready builds on a modern stack your team can maintain.",
        icon: "⚙️",
      },
      {
        title: "E-commerce",
        description:
          "Conversion-focused storefronts with secure checkout and analytics baked in.",
        icon: "🛍️",
      },
    ],
  },

  about: {
    heading: "We build with intent",
    body: [
      "Northwind Studio started with a simple belief: great software should feel effortless to the people who use it and to the teams who maintain it.",
      "We partner with founders and marketing teams to ship work that is beautiful, measurable, and built to last — no throwaway templates, no surprises.",
    ],
    values: [
      {
        title: "Craft",
        description: "Details matter. We sweat the pixels and the performance budget alike.",
        icon: "✨",
      },
      {
        title: "Honesty",
        description: "Clear scope, clear pricing, and straight talk about trade-offs.",
        icon: "🤝",
      },
      {
        title: "Partnership",
        description: "We measure success by your outcomes, not our deliverables.",
        icon: "🚀",
      },
    ],
  },

  products: {
    heading: "Services & Packages",
    subheading: "Transparent, fixed-scope packages. Pick a starting point — we tailor from there.",
    items: [
      {
        id: "starter",
        name: "Starter Site",
        description: "A polished marketing site to establish your presence.",
        priceDisplay: "$2,500",
        mode: "payment",
        // SETUP REQUIRED: replace with a real Stripe Price ID (price_...).
        stripePriceId: "",
        features: ["Up to 5 pages", "Responsive & accessible", "Basic SEO", "2 rounds of revisions"],
        highlight: false,
      },
      {
        id: "growth",
        name: "Growth Package",
        description: "Everything in Starter plus e-commerce and integrations.",
        priceDisplay: "$6,000",
        mode: "payment",
        // SETUP REQUIRED: replace with a real Stripe Price ID (price_...).
        stripePriceId: "",
        features: ["Up to 12 pages", "Stripe storefront", "CRM integration", "Analytics setup"],
        highlight: true,
      },
      {
        id: "care",
        name: "Care Plan",
        description: "Ongoing updates, monitoring, and support.",
        priceDisplay: "$300/mo",
        mode: "subscription",
        // SETUP REQUIRED: replace with a real recurring Stripe Price ID (price_...).
        stripePriceId: "",
        features: ["Monthly updates", "Uptime monitoring", "Priority support", "Quarterly review"],
        highlight: false,
      },
    ],
  },

  booking: {
    heading: "Book a discovery call",
    body: "Tell us about your project and we'll map out the right approach. Calls run about 30 minutes.",
    // SETUP REQUIRED (booking enabled): paste a Cal.com or Calendly link.
    // Leave empty to show an honest "not yet configured" notice (no fake calendar).
    embedUrl: "",
    provider: "none",
  },

  blog: {
    heading: "Insights",
    subheading: "Notes on design, development, and growing a business online.",
    posts: [
      {
        slug: "why-performance-is-a-feature",
        title: "Why Performance Is a Feature",
        excerpt:
          "Speed isn't a nice-to-have. It shapes conversion, SEO, and how trustworthy your brand feels.",
        date: "2025-11-12",
        author: "Northwind Studio",
      },
      {
        slug: "accessible-by-default",
        title: "Accessible by Default",
        excerpt:
          "Building for accessibility from day one is cheaper, kinder, and better for everyone — including search engines.",
        date: "2026-01-20",
        author: "Northwind Studio",
      },
    ],
  },

  legal: {
    privacyUrl: "/privacy",
    termsUrl: "/terms",
  },
});

export default config;
