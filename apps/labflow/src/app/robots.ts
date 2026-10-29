import type { MetadataRoute } from 'next';

// Only the public marketing pages are worth indexing. Everything else is a
// signed-in lab's private record or an API, and a crawler gets a login wall.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/$', '/pricing', '/privacy', '/terms', '/guide', '/signup', '/login'],
      disallow: '/',
    },
  };
}
