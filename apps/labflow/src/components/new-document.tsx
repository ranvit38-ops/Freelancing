'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './ui';

/** Starts a blank document the whole lab can open, and goes straight to it. */
export function NewDocumentButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const response = await fetch('/api/docs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'Untitled document', body: '', private: false }),
          }).catch(() => null);
          const data = (await response?.json().catch(() => null)) as { href?: string; error?: string } | null;
          if (response?.ok && data?.href) router.push(data.href);
          else {
            setError(data?.error ?? 'Could not create a document. Try again.');
            setBusy(false);
          }
        }}
      >
        {busy ? 'Creating…' : 'New document'}
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
