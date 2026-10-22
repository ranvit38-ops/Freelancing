'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { SubmitButton } from './submit-button';
import { FileDrop } from './file-drop';
import { fileUnderAction } from '@/server/actions/records';
import { noState } from '@/server/actions/types';

/** Folder names labs commonly use; any other name can be typed. */
export const FOLDER_SUGGESTIONS = ['Raw data', 'Code', 'Pictures', 'Metadata', 'Field', 'Reports'];

export type FilingTargets = {
  projects: { id: string; name: string }[];
  protocols: { id: string; name: string }[];
  experiments: { id: string; label: string }[];
};

/**
 * "File under…" for a file already in the lab: a project folder, a protocol,
 * or a run. Uploading first and organising later is how people actually work,
 * and before this a file uploaded in Files could never reach a project.
 */
export function FileUnder({ fileId, targets }: { fileId: string; targets: FilingTargets }) {
  const [state, action] = useFormState(fileUnderAction, noState);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted hover:border-accent/40 hover:text-fg"
      >
        File under…
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-raised px-3 py-2">
      <input type="hidden" name="fileId" value={fileId} />
      <label className="sr-only" htmlFor={`target-${fileId}`}>
        Where it goes
      </label>
      <select
        id={`target-${fileId}`}
        name="target"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm"
      >
        <option value="">Choose where it goes</option>
        {targets.projects.length > 0 ? (
          <optgroup label="Project folder">
            {targets.projects.map((p) => (
              <option key={p.id} value={`project:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {targets.protocols.length > 0 ? (
          <optgroup label="Protocol">
            {targets.protocols.map((p) => (
              <option key={p.id} value={`protocol:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {targets.experiments.length > 0 ? (
          <optgroup label="Experiment">
            {targets.experiments.map((e) => (
              <option key={e.id} value={`experiment:${e.id}`}>
                {e.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      {target.startsWith('project:') ? (
        <>
          <label className="sr-only" htmlFor={`folder-${fileId}`}>
            Folder
          </label>
          <input
            id={`folder-${fileId}`}
            name="folder"
            list="folder-suggestions"
            placeholder="Folder, e.g. Raw data"
            className="h-8 w-40 rounded-md border border-line bg-surface px-2 text-sm"
          />
          <datalist id="folder-suggestions">
            {FOLDER_SUGGESTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </>
      ) : null}
      <SubmitButton tone="secondary" size="sm" pendingLabel="Filing…">
        File it
      </SubmitButton>
      {state.ok ? (
        <span role="status" className="text-xs text-ok">
          {state.message}
        </span>
      ) : null}
      {state.error ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/** Upload straight into one of a project's folders. */
export function ProjectFolderDrop({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [folder, setFolder] = useState('');
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="project-folder" className="text-sm font-medium">
          Folder <span className="font-normal text-subtle">optional</span>
        </label>
        <input
          id="project-folder"
          list="project-folder-suggestions"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="Raw data, Code, Pictures…"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm"
        />
        <datalist id="project-folder-suggestions">
          {FOLDER_SUGGESTIONS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>
      <FileDrop
        members={[]}
        into={{ projectId, folder: folder.trim() || null, label: folder.trim() ? `${projectName} / ${folder.trim()}` : projectName }}
      />
    </div>
  );
}
