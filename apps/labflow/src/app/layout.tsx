import { StaleTabGuard } from '@/components/stale-tab-guard';
import { ThemeScript } from '@/components/theme-toggle';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { siteUrl } from '@/lib/site-url';
import './globals.css';

const title = 'Labquill: know what your lab recorded, and what it left out';
const description =
  'Students record each run in one place. Whoever runs the lab sees whose records are thin, who changed ' +
  'what, and who has gone quiet, without opening a single file. Priced per lab.';

export async function generateMetadata(): Promise<Metadata> {
  // The public address is set on the host, not at build, and link previews
  // need it to build absolute URLs.
  await connection();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: title, template: '%s · Labquill' },
    description,
    openGraph: { type: 'website', siteName: 'Labquill', title, description },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        {/* The first thing a keyboard reaches: past the navigation, straight to the page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-fg focus:shadow-pop"
        >
          Skip to main content
        </a>
        {children}
        <StaleTabGuard />
      </body>
    </html>
  );
}
