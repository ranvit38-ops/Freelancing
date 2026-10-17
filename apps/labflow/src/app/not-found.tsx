import Link from 'next/link';

export const metadata = { title: 'Not found' };

/**
 * A mistyped or outdated link. Usually a record that was deleted, or one that
 * belongs to a different lab; either way the answer is the same.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-accent">Not found</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page isn&rsquo;t here</h1>
        <p className="mt-2 text-sm text-muted">
          It may have been deleted, or it belongs to a lab you are not in.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
