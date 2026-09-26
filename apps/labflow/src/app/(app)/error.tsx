'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { reloadOnceForStaleDeploy, tabIsStale } from '@/lib/stale-deploy';

/**
 * What anyone sees if a page inside the app fails.
 *
 * Next's default is a blank page reading "Application error: a server-side
 * exception has occurred", which to a professor trying the product means
 * "this is broken" and ends the trial. This keeps them inside the app, says
 * what to do, and offers the two ways out that almost always work: try the
 * page again, or go Home. The sidebar stays, so nothing feels lost.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A tab opened before the site was updated: reload into the new version
  // rather than showing an error for something the reader did not do.
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    // Still reported to the server log, where the digest ties it to the cause.
    console.error(error);
    void tabIsStale().then((stale) => {
      if (stale && reloadOnceForStaleDeploy()) setReloading(true);
    });
  }, [error]);

  if (reloading) {
    return <p className="py-16 text-center text-sm text-muted">Labvia was just updated. Loading the new version…</p>;
  }

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div aria-hidden className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-warn/10 text-xl text-warn">
        !
      </div>
      <h1 className="text-xl font-semibold tracking-tight">That page didn&rsquo;t load</h1>
      <p className="mt-2 text-sm text-muted">
        Nothing you saved has been lost. This usually clears up if you try again. If the site had
        been idle, it may just have been waking up.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          Try again
        </button>
        <Link href="/dashboard" className="inline-flex h-9 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-raised">
          Go home
        </Link>
      </div>
      {error.digest ? <p className="mt-6 text-xs text-subtle">Reference: {error.digest}</p> : null}
    </div>
  );
}
