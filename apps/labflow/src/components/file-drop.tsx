'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { AudiencePicker, useAudience, type Member } from './audience-picker';

/**
 * Upload straight to the lab's files, from the Files page.
 *
 * There was no way to do this at all: files could only be attached to an
 * experiment or a chat message. Sometimes a file is just a file — the
 * safety sheet, the grant, the slides from group meeting.
 */
export function FileDrop({ members }: { members: Member[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const audience = useAudience();
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setErrors([]);
    setNotice(null);
    if (audience.value === 'people' && audience.chosen.length === 0) {
      setErrors(['Pick at least one person to share with.']);
      return;
    }
    const failed: string[] = [];
    let sent = 0;
    for (const [i, file] of files.entries()) {
      setProgress(`Uploading ${file.name} (${i + 1} of ${files.length})…`);
      const body = new FormData();
      body.set('file', file);
      body.set('audience', audience.value);
      for (const id of audience.chosen) body.append('shareWith', id);
      // Tell the people it is for: #lab for everyone, a DM for chosen people.
      body.set('announce', '1');
      try {
        const response = await fetch('/api/team/files', { method: 'POST', body });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          failed.push(payload.error ?? `${file.name} could not be uploaded.`);
        } else {
          sent += 1;
        }
      } catch {
        failed.push(`${file.name} could not be uploaded. Check your connection.`);
      }
    }
    setProgress(null);
    setErrors(failed);
    if (sent > 0) {
      const names = members.filter((m) => audience.chosen.includes(m.id)).map((m) => m.name || m.email);
      setNotice(
        audience.value === 'everyone'
          ? `Shared with the lab and posted in #lab.`
          : audience.value === 'people'
            ? names.length === 1
              ? `Shared with ${names[0]}. They got it as a direct message.`
              : `Shared with ${names.join(', ')} in a group message.`
            : 'Saved. Only you can see it.',
      );
    }
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
      <AudiencePicker
        members={members}
        value={audience.value}
        onChange={audience.setValue}
        chosen={audience.chosen}
        onChoose={audience.setChosen}
      />
      {notice ? (
        <p role="status" className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">
          {notice}
        </p>
      ) : null}
      {errors.map((error) => (
        <p key={error} role="alert" className="rounded-lg bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ))}
    </div>
  );
}
