import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

// Only the public marketing pages are worth indexing. Everything else is a
// signed-in lab's private record or an API, and a crawler gets a login wall.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/$', '/pricing', '/privacy', '/terms', '/guide', '/signup', '/login', '/opengraph-image', '/icon', '/apple-icon'],
      disallow: '/',
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
