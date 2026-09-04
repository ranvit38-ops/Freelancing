'use client';

import { useFormState } from 'react-dom';
import { Field, FormError, Input } from './ui';
import { SubmitButton } from './submit-button';
import { attachLinkAction } from '@/server/actions/collab';
import { noState } from '@/server/actions/types';

/**
 * Paste any URL — Drive, Dropbox, SharePoint, a DOI, a raw file.
 *
 * LabFlow records the link; it does not copy the file. Reading a private Drive
 * document needs OAuth per deployment, and almost every lab file is private.
 */
export function AttachLink({ experimentId }: { experimentId: string }) {
  const [state, action] = useFormState(attachLinkAction, noState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="experimentId" value={experimentId} />
      <FormError>{state.error}</FormError>
      {state.ok ? (
        <p role="status" className="text-sm text-ok">
          {state.message}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <Field label="Link" htmlFor="link-url" error={state.fieldErrors?.url}>
          <Input
            id="link-url"
            name="url"
            type="url"
            required
            placeholder="https://drive.google.com/… or https://youtu.be/…"
          />
        </Field>
        <Field label="Label" htmlFor="link-label" optional>
          <Input id="link-label" name="label" placeholder="Raw LC-MS export" />
        </Field>
        <SubmitButton tone="secondary" size="sm" pendingLabel="Attaching…">
          Attach link
        </SubmitButton>
      </div>
      <p className="text-xs text-subtle">
        Google Drive, Docs, Dropbox, OneDrive, Notion, figshare, Zenodo, a DOI, a YouTube or Vimeo
        walkthrough — or any URL. LabFlow stores the link next to this experiment rather than
        copying the file, so your sharing permissions stay exactly as you set them. Videos play
        inline.
      </p>
    </form>
  );
}
