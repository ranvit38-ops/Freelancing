/**
 * Noticing a tab that was opened before the site was updated.
 *
 * After a redeploy, a tab left open still runs the old build: the next form
 * it submits names a server action that no longer exists, and the page fails.
 * In production the browser is never told why (Next hides server error text),
 * so the error itself cannot be recognised. Instead the tab remembers which
 * build served it when it first loaded, and later asks whether that changed.
 */

let startedOn: string | null = null;

async function serverBuild(): Promise<string | null> {
  try {
    const response = await fetch('/api/version', { cache: 'no-store' });
    if (!response.ok) return null;
    const { build } = (await response.json()) as { build?: string };
    return build || null;
  } catch {
    // Offline tells us nothing either way.
    return null;
  }
}

/** Called once when the page first loads: the build this tab is running. */
export async function rememberBuild(): Promise<void> {
  if (startedOn === null) startedOn = await serverBuild();
}

/** True only when both builds are known and they differ. */
export async function tabIsStale(): Promise<boolean> {
  if (!startedOn) return false;
  const now = await serverBuild();
  return Boolean(now) && now !== startedOn;
}

const KEY = 'labvia:stale-reload';

/**
 * Reloads once. A second stale verdict within a minute means reloading did
 * not help, and a reload loop would be worse than the error screen.
 */
export function reloadOnceForStaleDeploy(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage blocked (private mode): reload anyway. Looping would need the
    // new build to be stale against itself, which cannot happen.
  }
  window.location.reload();
  return true;
}

/**
 * Whether reloading now would throw away something the person typed: text in
 * a field, or chat messages that have not gone out yet (the chat marks those
 * on the page). The guard waits rather than lose them.
 */
export function hasUnsavedWork(): boolean {
  if (document.querySelector('[data-unsent]')) return true;
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file])',
  );
  return Array.from(fields).some((field) => field.value !== field.defaultValue);
}
