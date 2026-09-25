'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

/**
 * Upload straight to the lab's files, from the Files page.
 *
 * There was no way to do this at all: files could only be attached to an
 * experiment or a chat message. Sometimes a file is just a file — the
 * safety sheet, the grant, the slides from group meeting.
 */
export function FileDrop() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [onlyMe, setOnlyMe] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setErrors([]);
    const failed: string[] = [];
    for (const [i, file] of files.entries()) {
      setProgress(`Uploading ${file.name} (${i + 1} of ${files.length})…`);
      const body = new FormData();
      body.set('file', file);
      if (onlyMe) body.set('private', '1');
      try {
        const response = await fetch('/api/team/files', { method: 'POST', body });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          failed.push(payload.error ?? `${file.name} could not be uploaded.`);
        }
      } catch {
        failed.push(`${file.name} could not be uploaded. Check your connection.`);
      }
    }
    setProgress(null);
    setErrors(failed);
    if (input.current) input.current.value = '';
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
        className={`rounded-xl border-2 border-dashed px-5 py-7 text-center transition-colors ${
          over ? 'border-accent bg-accent/5' : 'border-line bg-raised'
        }`}
      >
        <p className="text-sm font-medium">{progress ?? 'Drag files here to upload them'}</p>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={progress !== null}
          className="mt-3 h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose files to upload"
          onChange={(e) => void upload(Array.from(e.target.files ?? []))}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={onlyMe}
          onChange={(e) => setOnlyMe(e.target.checked)}
          className="h-4 w-4 accent-[rgb(var(--lf-accent))]"
        />
        Only me: keep these private instead of sharing them with the lab
      </label>
      {errors.map((error) => (
        <p key={error} role="alert" className="rounded-lg bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ))}
    </div>
  );
}
