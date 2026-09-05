'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, cx } from './ui';

/**
 * Drag a file onto the card, or click to choose. Several at once are uploaded
 * one after another rather than in parallel, so a slow connection does not
 * stall behind six simultaneous requests and each failure names its own file.
 */
export function FileUpload({ experimentId }: { experimentId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);

  async function uploadAll(list: FileList | File[]) {
    const chosen = Array.from(list);
    if (chosen.length === 0) return;
    setErrors([]);
    setNotices([]);

    const failed: string[] = [];
    const said: string[] = [];

    for (const file of chosen) {
      setBusy(file.name);
      try {
        const body = new FormData();
        body.set('file', file);
        const response = await fetch(`/api/experiments/${experimentId}/files`, {
          method: 'POST',
          body,
        });
        const payload = (await response.json()) as { error?: string; notice?: string | null };
        if (!response.ok) failed.push(`${file.name}: ${payload.error ?? 'Upload failed.'}`);
        else if (payload.notice) said.push(`${file.name}: ${payload.notice}`);
      } catch {
        failed.push(`${file.name}: upload failed — check your connection.`);
      }
    }

    setBusy(null);
    setErrors(failed);
    setNotices(said);
    if (inputRef.current) inputRef.current.value = '';
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {/* The drop zone is a label, so clicking or keyboard-activating it opens
          the picker without a click handler doing that job. */}
      <label
        htmlFor={`upload-${experimentId}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length > 0) void uploadAll(e.dataTransfer.files);
        }}
        className={cx(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-5 py-7 text-center transition-colors',
          dragging ? 'border-accent bg-accent-soft' : 'border-line bg-raised hover:border-accent/50',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        <span className="text-sm font-medium">
          {busy ? `Uploading ${busy}…` : 'Drop files here, or click to choose'}
        </span>
        <span className="text-xs text-muted">
          CSV, XLSX, PDF, DOCX, PPTX and images, up to 25&nbsp;MB each. CSV and Excel files are
          parsed into a dataset you can chart.
        </span>
        <input
          ref={inputRef}
          id={`upload-${experimentId}`}
          type="file"
          multiple
          className="sr-only"
          disabled={Boolean(busy)}
          onChange={(e) => {
            if (e.target.files) void uploadAll(e.target.files);
          }}
        />
      </label>

      {busy ? (
        <p role="status" className="text-sm text-muted">
          Uploading {busy}…
        </p>
      ) : null}
      {errors.map((message) => (
        <p key={message} role="alert" className="text-sm text-danger">
          {message}
        </p>
      ))}
      {notices.map((message) => (
        <p key={message} className="text-sm text-warn">
          {message}
        </p>
      ))}
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
