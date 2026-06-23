import type { SiteConfig } from "@/lib/site-config.schema";

/**
 * Turns the theme block of site.config.ts into CSS custom properties.
 * Injected once on <html> in layout.tsx so Tailwind's `brand`/`bg`/`fg`
 * tokens (see tailwind.config.ts) resolve to the client's palette.
 */
export function themeToCssVars(theme: SiteConfig["theme"]): Record<string, string> {
  return {
    "--brand": theme.colors.brand,
    "--brand-fg": theme.colors.brandFg,
    "--brand-accent": theme.colors.brandAccent,
    "--bg": theme.colors.bg,
    "--surface": theme.colors.surface,
    "--fg": theme.colors.fg,
    "--muted": theme.colors.muted,
    "--border": theme.colors.border,
    "--radius": theme.radius,
    "--font-sans": theme.fonts.sans,
    "--font-heading": theme.fonts.heading,
  };
}
