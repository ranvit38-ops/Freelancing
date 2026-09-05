'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { Badge, Card, CardHeader, Field, FormError, Input, Select, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import { ConfirmSubmit } from './file-upload';
import { saveUpdateAction, deleteUpdateAction } from '@/server/actions/updates';
import { noState } from '@/server/actions/types';
import { sourceLabel, type SectionSource, type UpdateSection } from '@/lib/research-update';

const sourceTone: Record<SectionSource, 'neutral' | 'accent' | 'warn'> = {
  record: 'neutral',
  researcher: 'accent',
  ai: 'warn',
};

/**
 * Every word is editable before export, and every section keeps an explicit
 * attribution so the exported deck never blurs data into interpretation.
 */
export function UpdateEditor({
  updateId,
  title,
  status,
  sections,
}: {
  updateId: string;
  title: string;
  status: 'draft' | 'final';
  sections: UpdateSection[];
}) {
  const [state, action] = useFormState(saveUpdateAction, noState);
  const [rows, setRows] = useState(sections);

  const update = (i: number, patch: Partial<UpdateSection>) =>
    setRows((current) => current.map((row, index) => (index === i ? { ...row, ...patch } : row)));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="updateId" value={updateId} />
      <FormError>{state.error}</FormError>
      {state.ok ? (
        <p role="status" className="rounded-lg border border-ok/25 bg-ok/5 px-4 py-2 text-sm text-ok">
          {state.message}
        </p>
      ) : null}

      <Card className="space-y-4 p-5">
        <Field label="Title" htmlFor="title" error={state.fieldErrors?.title}>
          <Input id="title" name="title" defaultValue={title} required />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={status} className="max-w-xs">
            <option value="draft">Draft</option>
            <option value="final">Final</option>
          </Select>
        </Field>
      </Card>

      {rows.map((section, i) => (
        <Card key={i}>
          <CardHeader
            title={
              <input
                name="heading"
                value={section.heading}
                onChange={(e) => update(i, { heading: e.target.value })}
                aria-label={`Section ${i + 1} heading`}
                className="w-full bg-transparent text-sm font-semibold tracking-tight focus-visible:outline-none"
              />
            }
            action={<Badge tone={sourceTone[section.source]}>{sourceLabel[section.source]}</Badge>}
          />
          <div className="space-y-3 px-5 py-4">
            <label htmlFor={`body-${i}`} className="sr-only">
              {section.heading} content
            </label>
            <Textarea
              id={`body-${i}`}
              name="body"
              value={section.body}
              onChange={(e) => update(i, { body: e.target.value })}
              className="min-h-[120px]"
            />
            <label className="flex items-center gap-2 text-xs text-muted">
              Attribution
              <select
                name="source"
                value={section.source}
                onChange={(e) => update(i, { source: e.target.value as SectionSource })}
                className="h-8 rounded-lg border border-line bg-surface px-2 text-xs"
              >
                <option value="record">From the record</option>
                <option value="researcher">Researcher’s words</option>
                <option value="ai">AI-generated observation</option>
              </select>
            </label>
          </div>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Save update</SubmitButton>
        <a
          href={`/api/updates/${updateId}/pptx`}
          className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-raised"
        >
          Export as PowerPoint
        </a>
        <span className="text-xs text-subtle">Export uses the last saved version.</span>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold tracking-tight">Delete this update</h2>
        <p className="mt-1 text-sm text-muted">
          The experiments it was built from are not affected.
        </p>
      </Card>
    </form>
  );
}

export function DeleteUpdateForm({ updateId }: { updateId: string }) {
  return (
    <form action={deleteUpdateAction}>
      <input type="hidden" name="updateId" value={updateId} />
      <ConfirmSubmit tone="danger" size="sm" message="Delete this research update? This cannot be undone.">
        Delete update
      </ConfirmSubmit>
    </form>
  );
}
