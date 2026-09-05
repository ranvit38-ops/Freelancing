import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'LabFlow — turn experiments into a living research record',
    template: '%s · LabFlow',
  },
  description:
    'LabFlow connects experiments, protocols, samples, data, results and research updates in ' +
    'one place — with AI that helps researchers understand what happened and communicate it faster.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
