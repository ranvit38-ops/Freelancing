'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from './ui';

/**
 * Uploads go through fetch rather than a server action so the browser can
 * stream a large file and we can report per-file errors precisely.
 */
export function FileUpload({ experimentId }: { experimentId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function upload(file: File) {
    setStatus('uploading');
    setError(null);
    setNotice(null);
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch(`/api/experiments/${experimentId}/files`, {
        method: 'POST',
        body,
      });
      const payload = (await response.json()) as { error?: string; notice?: string | null };
      if (!response.ok) {
        setError(payload.error ?? 'Upload failed.');
        return;
      }
      if (payload.notice) setNotice(payload.notice);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch {
      setError('Upload failed — check your connection and try again.');
    } finally {
      setStatus('idle');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={`upload-${experimentId}`}
          type="file"
          aria-label="Choose a file to attach"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
          disabled={status === 'uploading'}
          className="block w-full max-w-sm text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg hover:file:bg-raised"
        />
        {status === 'uploading' ? (
          <span className="text-sm text-muted" role="status">
            Uploading…
          </span>
        ) : null}
      </div>
      <p className="text-xs text-subtle">
        CSV, XLSX, PDF, DOCX, PPTX and images, up to 25&nbsp;MB. CSV files are parsed into a dataset.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-warn">{notice}</p> : null}
    </div>
  );
}

/** Confirms before a destructive submit; the server still re-checks access. */
export function ConfirmSubmit({
  children,
  message,
  ...props
}: React.ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
