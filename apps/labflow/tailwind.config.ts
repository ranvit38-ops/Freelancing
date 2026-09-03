import type { Config } from 'tailwindcss';

/**
 * Design tokens are CSS variables (see src/app/globals.css) so the whole
 * surface can be re-themed without touching components. Never use raw hex
 * colours in components — always go through these tokens.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--lf-bg) / <alpha-value>)',
        surface: 'rgb(var(--lf-surface) / <alpha-value>)',
        raised: 'rgb(var(--lf-raised) / <alpha-value>)',
        line: 'rgb(var(--lf-line) / <alpha-value>)',
        fg: 'rgb(var(--lf-fg) / <alpha-value>)',
        muted: 'rgb(var(--lf-muted) / <alpha-value>)',
        subtle: 'rgb(var(--lf-subtle) / <alpha-value>)',
        accent: 'rgb(var(--lf-accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--lf-accent-fg) / <alpha-value>)',
        'accent-soft': 'rgb(var(--lf-accent-soft) / <alpha-value>)',
        ok: 'rgb(var(--lf-ok) / <alpha-value>)',
        warn: 'rgb(var(--lf-warn) / <alpha-value>)',
        danger: 'rgb(var(--lf-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { lg: '10px', xl: '14px' },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        pop: '0 8px 28px rgb(15 23 42 / 0.10)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: { 'fade-up': 'fade-up 180ms ease-out both' },
    },
  },
  plugins: [],
};
export default config;
