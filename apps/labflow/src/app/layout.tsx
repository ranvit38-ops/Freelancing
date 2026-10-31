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
        {children}
        <StaleTabGuard />
      </body>
    </html>
  );
}
