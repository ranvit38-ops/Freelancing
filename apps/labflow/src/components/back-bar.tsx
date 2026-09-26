'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Back, and Home, on every page.
 *
 * The browser's own back button works, but people do not trust it inside an
 * app and it can leave the site entirely. This goes back to the previous page
 * only when that page was inside Labvia; arriving from an email link, it goes
 * to Home instead of out of the app.
 */
export function BackBar() {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname === '/dashboard') return null;

  function back() {
    let inApp = false;
    try {
      inApp = document.referrer !== '' && new URL(document.referrer).origin === window.location.origin;
    } catch {
      inApp = false;
    }
    if (inApp && window.history.length > 1) router.back();
    else router.push('/dashboard');
  }

  return (
    <div className="mb-5 flex items-center gap-2 text-sm">
      <button
        type="button"
        onClick={back}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-muted transition-colors hover:bg-raised hover:text-fg"
      >
        <span aria-hidden>←</span> Back
      </button>
      <span aria-hidden className="text-subtle">
        ·
      </span>
      <Link
        href="/dashboard"
        className="rounded-lg px-2 py-1 text-muted transition-colors hover:bg-raised hover:text-fg"
      >
        Home
      </Link>
    </div>
  );
}
