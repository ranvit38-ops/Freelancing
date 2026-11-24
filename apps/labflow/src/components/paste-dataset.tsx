'use client';

import { useActionState } from 'react';
import { pasteDatasetAction } from '@/server/actions/datasets';
import { noState } from '@/server/actions/types';
import { SubmitButton } from './submit-button';
import { Field, FormError, Input, Textarea } from './ui';

/**
 * Results straight from the instrument spreadsheet: copy the cells, paste,
 * and the dataset opens with its checks and next step. No file to save first.
 */
export function PasteDataset({ experimentId }: { experimentId: string }) {
  const [state, action] = useActionState(pasteDatasetAction, noState);
  return (
    <details className="group border-t border-line" open={Boolean(state.error || state.fieldErrors)}>
      <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-accent hover:underline">
        + Paste a table from Excel or Sheets
      </summary>
      <form action={action} className="space-y-3 px-5 pb-4">
        <input type="hidden" name="experimentId" value={experimentId} />
        <FormError>{state.error}</FormError>
        <Field label="Name" htmlFor="paste-name" optional>
          <Input id="paste-name" name="name" maxLength={200} />
        </Field>
        <Field
          label="Table"
          htmlFor="paste-table"
          hint="Include the header row. qPCR Ct values, read counts, yields or any measurements work; you get checks and a suggested next step."
          error={state.fieldErrors?.table}
        >
          <Textarea data-no-format id="paste-table" name="table" rows={6} required className="font-mono text-xs" />
        </Field>
        <SubmitButton size="sm" pendingLabel="Checking…">
          Add and check it
        </SubmitButton>
      </form>
    </details>
  );
}
