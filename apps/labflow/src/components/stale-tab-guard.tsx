'use client';

import { useEffect } from 'react';
import { hasUnsavedWork, rememberBuild, reloadOnceForStaleDeploy, tabIsStale } from '@/lib/stale-deploy';

/**
 * Two things every page needs and no page should have to remember.
 *
 * A tab left open across a redeploy loads the new version as soon as you come
 * back to it, before anything can be clicked in the old one. Checked on return
 * rather than on a timer, so nobody is reloaded out from under their typing.
 *
 * A file dropped a little outside a drop zone would otherwise make the browser
 * open the file itself and leave Labvia. Drop zones handle their own drops
 * first (React listens below the window), so this only catches the misses.
 */
export function StaleTabGuard() {
  useEffect(() => {
    void rememberBuild();
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 30_000) return;
      last = Date.now();
      if (!hasUnsavedWork() && (await tabIsStale())) reloadOnceForStaleDeploy();
    };
    const swallow = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);
  return null;
}
