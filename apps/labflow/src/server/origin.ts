import { headers } from 'next/headers';
import { absoluteUrl, publicBaseUrl } from './mailer';

/**
 * A link to show the person who is looking at the page.
 *
 * absoluteUrl() refuses to run in production without NEXT_PUBLIC_APP_URL, and
 * that is right for what it was built for: a payment redirect or an emailed
 * link built from the wrong address is broken for someone else, somewhere you
 * cannot see. But a link rendered back to the viewer is different. Crashing
 * the whole page because a setting is missing turned "Create a join link" into
 * an application error on a first deploy.
 *
 * So when the setting is absent, this uses the address the viewer's own
 * browser just asked for. That is safe precisely because it only ever goes
 * back to that same viewer: a forged Host header can mislead nobody but the
 * person forging it. Anything that leaves the page — an email, a redirect to
 * a payment provider — must keep using absoluteUrl() directly.
 */
export function linkForViewer(path: string): string {
  if (publicBaseUrl()) return absoluteUrl(path);

  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return absoluteUrl(path);

  const proto =
    h.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return `${proto}://${host}${path}`;
}
