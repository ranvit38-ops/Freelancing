import type { Config } from "tailwindcss";

/**
 * Theme tokens map to CSS variables that are injected at runtime from
 * site.config.ts (see src/lib/theme.ts and src/app/layout.tsx).
 *
 * This is what makes the site re-skinnable WITHOUT touching components:
 * change the colors/fonts in site.config.ts and every `bg-brand`,
 * `text-brand-fg`, `font-sans`, etc. updates automatically.
 */
const config: Config = {
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    "./site.config.ts",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          fg: "rgb(var(--brand-fg) / <alpha-value>)",
          accent: "rgb(var(--brand-accent) / <alpha-value>)",
        },
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        brand: "var(--radius)",
      },
    },
  },
  plugins: [],
};

export default config;
