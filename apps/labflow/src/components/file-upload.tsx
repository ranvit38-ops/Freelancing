'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, cx } from './ui';

type Progress = { name: string; percent: number };

/**
 * Uploads one file with progress. fetch cannot report upload progress, so this
 * is the one place XHR earns its keep: without it a 200 MB video looks frozen.
 */
function upload(
  experimentId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ error?: string; notice?: string | null }> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open('POST', `/api/experiments/${experimentId}/files`);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      try {
        const payload = JSON.parse(request.responseText) as { error?: string; notice?: string | null };
        resolve(request.status >= 200 && request.status < 300 ? payload : { error: payload.error ?? 'Upload failed.' });
      } catch {
        resolve({ error: 'The server returned something unreadable.' });
      }
    });
    request.addEventListener('error', () => resolve({ error: 'Upload failed. Check your connection.' }));
    request.addEventListener('abort', () => resolve({ error: 'Upload cancelled.' }));
    const body = new FormData();
    body.set('file', file);
    request.send(body);
  });
}

/**
 * Drop files anywhere on the page, onto the card, or click to choose. Several
 * at once upload one after another rather than in parallel, so a slow
 * connection does not stall behind six simultaneous requests and each failure
 * names its own file.
 */
export function FileUpload({ experimentId }: { experimentId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [queued, setQueued] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);

  const uploadAll = useCallback(
    async (list: FileList | File[]) => {
      const chosen = Array.from(list);
      if (chosen.length === 0) return;
      setErrors([]);
      setNotices([]);

      const failed: string[] = [];
      const said: string[] = [];

      for (let i = 0; i < chosen.length; i++) {
        const file = chosen[i]!;
        setQueued(chosen.length - i - 1);
        setProgress({ name: file.name, percent: 0 });
        const payload = await upload(experimentId, file, (percent) =>
          setProgress({ name: file.name, percent }),
        );
        if (payload.error) failed.push(`${file.name}: ${payload.error}`);
        else if (payload.notice) said.push(`${file.name}: ${payload.notice}`);
      }

      setProgress(null);
      setQueued(0);
      setErrors(failed);
      setNotices(said);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    },
    [experimentId, router],
  );

  // Dropping anywhere on the page counts. Without this the target is a small
  // rectangle people have to find, which is the thing that makes file upload
  // feel like a form instead of a drive.
  useEffect(() => {
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      void uploadAll(event.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [uploadAll]);

  const busy = progress !== null;

  return (
    <div className="space-y-2">
      {dragging && !busy ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm"
        >
          <div className="rounded-2xl border-2 border-dashed border-accent bg-raised px-10 py-8 text-center">
            <p className="text-base font-medium">Drop to attach to this experiment</p>
            <p className="mt-1 text-sm text-muted">Data, papers, images, video, slides.</p>
          </div>
        </div>
      ) : null}

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
          {busy ? `Uploading ${progress.name}` : 'Drop files here, or click to choose'}
        </span>
        <span className="text-xs text-muted">
          Data, papers, images, slides and video. 25&nbsp;MB per file, 250&nbsp;MB for video. CSV
          and Excel files are parsed into a dataset you can chart.
        </span>
        <input
          ref={inputRef}
          id={`upload-${experimentId}`}
          type="file"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files) void uploadAll(e.target.files);
          }}
        />
      </label>

      {progress ? (
        <div role="status" aria-live="polite" className="space-y-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="min-w-0 truncate text-muted">{progress.name}</span>
            <span className="ml-3 shrink-0 tabular-nums text-subtle">
              {progress.percent}%{queued > 0 ? ` · ${queued} to go` : ''}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
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
