'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Remembers who signed in on this browser, so next time is one click.
 *
 * Only the address, first name and how they signed in are kept, in this
 * browser's storage. Never the password: saving that is the browser's job
 * (its password manager offers to, because the form is marked up for it) or
 * Google's. "Not you?" forgets it, for a shared computer.
 */
export type LastSignIn = { email: string; name: string; method: 'password' | 'google' };

const KEY = 'lq-last-signin';
const CHANGED = 'lq-last-signin-changed';

function read(): LastSignIn | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw.email === 'string' && (raw.method === 'password' || raw.method === 'google')) {
      return { email: raw.email, name: typeof raw.name === 'string' ? raw.name : '', method: raw.method };
    }
  } catch {
    // Storage blocked or garbled: behave as a first visit.
  }
  return null;
}

let cache: { raw: string | null; value: LastSignIn | null } = { raw: null, value: null };
function snapshot(): LastSignIn | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw !== cache.raw) cache = { raw, value: read() };
  return cache.value;
}

export function saveLastSignIn(next: Partial<LastSignIn> & { email: string }) {
  try {
    const prev = read();
    const same = prev && prev.email.toLowerCase() === next.email.toLowerCase();
    const value: LastSignIn = {
      email: next.email,
      name: next.name ?? (same ? prev.name : ''),
      method: next.method ?? (same ? prev.method : 'password'),
    };
    localStorage.setItem(KEY, JSON.stringify(value));
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // Nothing to do: the next sign-in just is not prefilled.
  }
}

function forget() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(CHANGED));
  } catch {}
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useLastSignIn(): LastSignIn | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

const PENDING_GOOGLE = 'lq-pending-google';

/** "Dr Elena Marsh" → "Elena": the name you would greet them by, not their title. */
export function firstName(full: string): string {
  const words = full.trim().split(/\s+/).filter(Boolean);
  const rest = words.length > 1 && /^(dr|prof|professor|mr|mrs|ms|mx|miss|sir)\.?$/i.test(words[0]!) ? words.slice(1) : words;
  return rest[0] ?? '';
}

/** In the signed-in app: keeps the remembered name and address current. */
export function RememberSignedIn({ email, name }: { email: string; name: string }) {
  useEffect(() => {
    let google = false;
    try {
      google = sessionStorage.getItem(PENDING_GOOGLE) === '1';
      sessionStorage.removeItem(PENDING_GOOGLE);
    } catch {}
    saveLastSignIn({ email, name: firstName(name), ...(google ? { method: 'google' as const } : {}) });
  }, [email, name]);
  return null;
}

/** The "Continue with Google" link: notes that this sign-in went through Google. */
export function GoogleAnchor(props: React.ComponentProps<'a'>) {
  return (
    <a
      {...props}
      onClick={() => {
        try {
          sessionStorage.setItem(PENDING_GOOGLE, '1');
        } catch {}
      }}
    />
  );
}

/** The password form, on submit: this address, by password. */
export function markPasswordSignIn(email: string) {
  try {
    sessionStorage.removeItem(PENDING_GOOGLE);
  } catch {}
  if (email.includes('@')) saveLastSignIn({ email, method: 'password' });
}

/** On the login page: "Welcome back" with one button, when this browser has signed in before. */
export function WelcomeBack({ googleOn }: { googleOn: boolean }) {
  const last = useLastSignIn();
  if (!last) return null;
  const viaGoogle = last.method === 'google' && googleOn;
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft/60 p-3" data-welcome-back>
      <p className="text-sm font-medium">Welcome back{last.name ? `, ${last.name}` : ''}</p>
      {viaGoogle ? (
        <GoogleAnchor
          href={`/api/auth/google?hint=${encodeURIComponent(last.email)}`}
          className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent-hover"
        >
          Continue as {last.email}
        </GoogleAnchor>
      ) : (
        <p className="mt-0.5 text-xs text-muted">Your email is filled in below. Your browser can fill in the password.</p>
      )}
      <button type="button" onClick={forget} className="mt-2 text-xs text-muted underline underline-offset-2 hover:text-fg">
        Not you? Forget this browser
      </button>
    </div>
  );
}
