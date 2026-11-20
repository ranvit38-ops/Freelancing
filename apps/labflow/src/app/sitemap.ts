import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';

// The public pages only, matching robots.ts. Read at request time because the
// site's address is set on the host.
export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return ['', '/pricing', '/guide', '/signup', '/privacy', '/terms'].map((path) => ({ url: `${base}${path}` }));
}
