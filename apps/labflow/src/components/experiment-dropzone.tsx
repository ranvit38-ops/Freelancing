'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader } from './ui';
import { formatBytes } from '@/lib/display';
import type { ExperimentDraft } from '@/lib/experiment-draft';

/**
 * Drop your files, get the form filled in.
 *
 * The blank experiment form is where people give up. They already have the
 * data — the CSV off the instrument, the spreadsheet of conditions — and the
 * form asks them to type it all again in a different shape.
 *
 * Nothing is stored while reading. The files are held here in the browser and
 * uploaded only when the experiment is actually saved, so dropping the wrong
 * folder costs a moment rather than a cleanup.
 */
export function ExperimentDropzone({
  onDraft,
  files,
  onFiles,
}: {
  onDraft: (draft: ExperimentDraft) => void;
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [source, setSource] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  async function read(dropped: File[]) {
    if (dropped.length === 0) return;
    setReading(true);
    setError(null);
    setSkipped([]);

    try {
      const body = new FormData();
      for (const file of dropped) body.append('files', file);
      const response = await fetch('/api/experiments/draft', { method: 'POST', body });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? 'Those files could not be read.');
        return;
      }
      onFiles(dropped);
      setSkipped(payload.skipped ?? []);
      setSource(payload.draft?.source ?? []);
      onDraft(payload.draft);
    } catch {
      setError('Those files could not be read. Check your connection and try again.');
    } finally {
      setReading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Start from your files"
        description="Drop the data you already have. Labvia fills in what it can read and you correct the rest — nothing is saved until you press the button at the bottom."
      />
      <div className="space-y-3 px-5 py-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void read(Array.from(e.dataTransfer.files));
          }}
          className={`rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors ${
            over ? 'border-accent bg-accent/5' : 'border-line bg-raised'
          }`}
        >
          <p className="text-sm font-medium">
            {reading ? 'Reading your files…' : 'Drag your files here'}
          </p>
          <p className="mt-1 text-xs text-muted">
            CSV and Excel are read for conditions and samples. Anything else is attached as it is.
          </p>
          {/* Dragging is not available to everyone, and a dropzone with no
              other way in is a dropzone some people cannot use at all. */}
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="mt-3 h-8 rounded-lg border border-line bg-surface px-3 text-xs font-medium transition-colors hover:bg-raised"
          >
            or choose files
          </button>
          <input
            ref={input}
            type="file"
            multiple
            className="sr-only"
            aria-label="Choose files to read"
            onChange={(e) => void read(Array.from(e.target.files ?? []))}
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {files.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-fg">
              {files.length} file{files.length === 1 ? '' : 's'} will be attached when you save
            </p>
            <ul className="mt-1.5 space-y-1">
              {files.map((file) => (
                <li key={file.name} className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 tabular-nums">{formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                onFiles([]);
                setSource([]);
                setSkipped([]);
              }}
              className="mt-2 text-xs text-muted underline underline-offset-2 hover:text-fg"
            >
              Clear these
            </button>
          </div>
        ) : null}

        {/* Saying what was read, rather than asking for trust. Every line here
            names a file and a fact from it, so a wrong guess is visible. */}
        {source.length > 0 ? (
          <div className="rounded-lg border border-line bg-raised px-3 py-2">
            <p className="text-xs font-medium">What was read</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {source.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {skipped.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-warn">
            {skipped.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Carries the held files into the form's own submission.
 *
 * A file input is the only element whose value a form post will include, and
 * its value cannot be set from a string. DataTransfer is the one way to put
 * File objects into one, which is why this exists rather than a hidden field.
 */
export function PendingFiles({ files }: { files: File[] }) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!input.current) return;
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    input.current.files = transfer.files;
  }, [files]);

  return <input ref={input} type="file" name="files" multiple className="sr-only" tabIndex={-1} aria-hidden />;
}
