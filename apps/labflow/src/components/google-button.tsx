import { googleConfigured } from '@/server/google';

const ERRORS: Record<string, string> = {
  google_unconfigured: 'Google sign-in is not set up on this deployment yet.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_state: 'That sign-in attempt expired or did not start here. Try again.',
  google_failed: 'Google could not complete the sign-in. Nothing was changed.',
};

/**
 * Rendered only when Google sign-in is actually configured, a button that
 * cannot work is worse than no button.
 */
export function GoogleButton({ invite, error }: { invite?: string; error?: string }) {
  const message = error ? ERRORS[error] : undefined;

  if (!googleConfigured()) {
    return message ? (
      <p role="alert" className="rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-sm text-warn">
        {message}
      </p>
    ) : null;
  }

  return (
    <div className="space-y-3">
      {message ? (
        <p role="alert" className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger">
          {message}
        </p>
      ) : null}
      <a
        href={invite ? `/api/auth/google?invite=${encodeURIComponent(invite)}` : '/api/auth/google'}
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface text-sm font-medium text-fg transition-colors hover:bg-raised"
      >
        <svg aria-hidden viewBox="0 0 18 18" className="h-4 w-4">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
          <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
        </svg>
        Continue with Google
      </a>
      <div className="flex items-center gap-3 text-xs text-subtle">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
