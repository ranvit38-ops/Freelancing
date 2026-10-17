'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { Button, Card, Field, FormError, Input, Select, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import { PendingFiles } from './experiment-dropzone';
import { createExperimentAction, updateExperimentAction } from '@/server/actions/records';
import { noState } from '@/server/actions/types';
import { experimentCode, experimentStatusLabel } from '@/lib/display';
import type { ExperimentStatus } from '@/db/schema';

import { draftFromFormData, readDraft, writeDraft, type ConditionRow, type FormDraft } from '@/lib/form-draft';

export type { ConditionRow };

export type ExperimentFormProps = {
  mode: 'create' | 'edit';
  /**
   * Files dropped on the create screen, submitted with the form so the
   * experiment and its data are saved in one action rather than two.
   */
  pendingFiles?: File[];
  /** A file already in the lab's Files, attached on save. */
  storedFileId?: string;
  projectId: string;
  projectName: string;
  experimentId?: string;
  nextNumber?: number;
  protocolVersions: { id: string; version: number; protocolName: string }[];
  siblingExperiments: { id: string; number: number; title: string }[];
  initial?: {
    title: string;
    performedOn: string;
    status: ExperimentStatus;
    objective: string;
    hypothesis: string;
    dataLocation: string;
    protocolVersionId: string;
    protocolNotes: string;
    repeatsExperimentId: string;
    conditions: ConditionRow[];
    sampleCodes: string;
    summary: string;
    observations: string;
    conclusion: string;
    nextSteps: string;
  };
};

const emptyRow: ConditionRow = { name: '', value: '', unit: '' };

const blank: NonNullable<ExperimentFormProps['initial']> = {
  title: '',
  performedOn: '',
  status: 'in_progress',
  objective: '',
  hypothesis: '',
  dataLocation: '',
  protocolVersionId: '',
  protocolNotes: '',
  repeatsExperimentId: '',
  conditions: [emptyRow, emptyRow, emptyRow],
  sampleCodes: '',
  summary: '',
  observations: '',
  conclusion: '',
  nextSteps: '',
};

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

export function ExperimentForm(props: ExperimentFormProps) {
  const initial = props.initial ?? blank;
  const action = props.mode === 'create' ? createExperimentAction : updateExperimentAction;
  const [state, formAction] = useFormState(action, noState);
  const [conditions, setConditions] = useState<ConditionRow[]>(
    initial.conditions.length > 0 ? initial.conditions : [emptyRow],
  );

  // A new record with no date means today, in the researcher's own time zone.
  // Filled here rather than on the server, which runs on UTC and would date
  // an evening run tomorrow.
  const dateRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = dateRef.current;
    if (props.mode === 'create' && input && !input.value) input.value = localToday();
  }, [props.mode]);

  // Unsaved text is kept on this device as it is typed, and offered back if
  // the page is reopened before saving. Keyed per record, or per project and
  // starting point for a new one.
  const formRef = useRef<HTMLFormElement>(null);
  const draftKey = `labvia:experiment-draft:${
    props.experimentId ?? `new:${props.projectId}:${initial.repeatsExperimentId}`
  }`;
  const [unsaved, setUnsaved] = useState<FormDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    setUnsaved(readDraft(draftKey));
    return () => clearTimeout(timer.current);
  }, [draftKey]);

  function remember() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (formRef.current) writeDraft(draftKey, draftFromFormData(new FormData(formRef.current), Date.now()));
    }, 400);
  }

  function restore(draft: FormDraft) {
    const form = formRef.current;
    if (!form) return;
    for (const [name, value] of Object.entries(draft.fields)) {
      const el = form.elements.namedItem(name);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        el.value = value;
      }
    }
    if (draft.conditions.length > 0) setConditions(draft.conditions);
    setUnsaved(null);
  }

  function discard() {
    clearTimeout(timer.current);
    writeDraft(draftKey, null);
    setUnsaved(null);
  }

  const updateRow = (index: number, patch: Partial<ConditionRow>) =>
    setConditions((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <form
      ref={formRef}
      action={formAction}
      onInput={remember}
      onSubmit={() => {
        clearTimeout(timer.current);
        writeDraft(draftKey, null);
      }}
      className="space-y-5"
    >
      {unsaved ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm"
        >
          <span className="min-w-0 flex-1">
            You have unsaved text from {new Date(unsaved.savedAt).toLocaleString()} on this device.
          </span>
          <Button type="button" size="sm" onClick={() => restore(unsaved)}>
            Put it back
          </Button>
          <Button type="button" tone="ghost" size="sm" onClick={discard}>
            Discard
          </Button>
        </div>
      ) : null}
      <input type="hidden" name="projectId" value={props.projectId} />
      {props.storedFileId ? (
        <input type="hidden" name="existingFileId" value={props.storedFileId} />
      ) : null}
      {props.pendingFiles && props.pendingFiles.length > 0 ? (
        <PendingFiles files={props.pendingFiles} />
      ) : null}
      {props.experimentId ? (
        <input type="hidden" name="experimentId" value={props.experimentId} />
      ) : null}

      <FormError>{state.error}</FormError>

      <SectionCard
        title="Basics"
        description={
          props.mode === 'create' && props.nextNumber
            ? `Will be recorded as ${experimentCode(props.nextNumber)} in ${props.projectName}. Only a name is required, fill in the rest whenever you like.`
            : `In ${props.projectName}.`
        }
      >
        <Field label="Experiment name" htmlFor="title" error={state.fieldErrors?.title}>
          <Input
            id="title"
            name="title"
            defaultValue={initial.title}
            placeholder="Column breakthrough at 30 °C"
            required
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date performed" htmlFor="performedOn" error={state.fieldErrors?.performedOn}>
            <Input
              ref={dateRef}
              id="performedOn"
              name="performedOn"
              type="date"
              defaultValue={initial.performedOn}
            />
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={initial.status}>
              {(Object.keys(experimentStatusLabel) as ExperimentStatus[]).map((value) => (
                <option key={value} value={value}>
                  {experimentStatusLabel[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Purpose of this run"
          htmlFor="objective"
          optional
          hint="The project holds the question and hypothesis. Say what this run is for."
          error={state.fieldErrors?.objective}
        >
          <Textarea
            id="objective"
            name="objective"
            defaultValue={initial.objective}
            placeholder="Surface tension of the new soil extract batch before the field trial."
          />
        </Field>

        {/* Hypotheses moved to the project; older runs that recorded one keep it editable. */}
        {initial.hypothesis ? (
          <Field label="Hypothesis" htmlFor="hypothesis" optional>
            <Textarea id="hypothesis" name="hypothesis" defaultValue={initial.hypothesis} />
          </Field>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Protocol"
        description="Recording the exact version is what makes later comparisons meaningful."
      >
        <Field label="Protocol version" htmlFor="protocolVersionId" optional>
          <Select id="protocolVersionId" name="protocolVersionId" defaultValue={initial.protocolVersionId}>
            <option value="">No protocol linked</option>
            {props.protocolVersions.map((pv) => (
              <option key={pv.id} value={pv.id}>
                {pv.protocolName}: v{pv.version}
              </option>
            ))}
          </Select>
        </Field>
        {props.protocolVersions.length === 0 ? (
          <p className="text-xs text-muted">
            No protocols in this lab yet. Already uploaded the PDF or Word file? Open{' '}
            <Link href="/files" className="underline underline-offset-2">
              Files
            </Link>{' '}
            and choose “Use as a protocol”, or{' '}
            <Link href="/protocols/new" className="underline underline-offset-2">
              write one here
            </Link>
            .
          </p>
        ) : null}
        <Field label="Deviations from the protocol" htmlFor="protocolNotes" optional>
          <Textarea
            id="protocolNotes"
            name="protocolNotes"
            defaultValue={initial.protocolNotes}
            placeholder="Anything you did differently this time."
          />
        </Field>
      </SectionCard>

      <SectionCard
        title="Conditions"
        description="Whatever variables matter in your field. Add as many rows as you need."
      >
        <div className="space-y-2">
          <div className="hidden gap-2 px-1 text-xs font-medium uppercase tracking-wider text-subtle sm:grid sm:grid-cols-[1fr_1fr_120px_40px]">
            <span>Condition</span>
            <span>Value</span>
            <span>Unit</span>
            <span className="sr-only">Remove</span>
          </div>
          {conditions.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_40px]">
              <Input
                name="conditionName"
                value={row.name}
                onChange={(e) => updateRow(i, { name: e.target.value })}
                aria-label={`Condition ${i + 1} name`}
                placeholder="Temperature"
              />
              <Input
                name="conditionValue"
                value={row.value}
                onChange={(e) => updateRow(i, { value: e.target.value })}
                aria-label={`Condition ${i + 1} value`}
                placeholder="25"
              />
              <Input
                name="conditionUnit"
                value={row.unit}
                onChange={(e) => updateRow(i, { unit: e.target.value })}
                aria-label={`Condition ${i + 1} unit`}
                placeholder="°C"
              />
              <Button
                type="button"
                tone="ghost"
                size="sm"
                aria-label={`Remove condition row ${i + 1}`}
                onClick={() =>
                  setConditions((rows) =>
                    rows.length === 1 ? [emptyRow] : rows.filter((_, index) => index !== i),
                  )
                }
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" tone="secondary" size="sm" onClick={() => setConditions((r) => [...r, emptyRow])}>
          Add condition
        </Button>
      </SectionCard>

      <SectionCard
        title="Samples"
        description="Paste or type sample IDs. Anything new is created in this lab automatically."
      >
        <Field
          label="Sample IDs"
          htmlFor="sampleCodes"
          optional
          hint="Paste rows straight from Excel: the first column is taken as the ID. Put the sheet with the measured values under Original data."
        >
          <Textarea
            id="sampleCodes"
            name="sampleCodes"
            defaultValue={initial.sampleCodes}
            placeholder="S-104, S-105, S-106"
            className="min-h-[64px] font-mono text-sm"
          />
        </Field>
      </SectionCard>

      <SectionCard
        title="Original data"
        description="Where the raw files from this run are kept, so anyone can find them later."
      >
        <Field
          label="Location"
          htmlFor="dataLocation"
          optional
          hint="Specific enough that someone else could open it: computer, drive or folder, and file name."
          error={state.fieldErrors?.dataLocation}
        >
          <Textarea
            id="dataLocation"
            name="dataLocation"
            defaultValue={initial.dataLocation}
            placeholder="Plate reader PC, D:\Data\2026-10\run12.xlsx"
            className="min-h-[64px] font-mono text-sm"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Notes" description="Anything worth remembering while it is fresh.">
        <Field
          label={props.mode === 'edit' ? 'Add a note' : 'Notes'}
          htmlFor="notes"
          optional
          hint={props.mode === 'edit' ? 'Saved as a new dated note; earlier notes are kept.' : undefined}
        >
          <Textarea id="notes" name="notes" className="min-h-[140px]" placeholder="What you saw, problems, anything that differed from last time…" />
        </Field>
        <Field
          label="Next steps"
          htmlFor="nextSteps"
          optional
          hint="For whoever picks this up next: what is left to do."
        >
          <Textarea id="nextSteps" name="nextSteps" defaultValue={initial.nextSteps} className="min-h-[64px]" />
        </Field>
      </SectionCard>

      <details
        className="rounded-xl border border-line bg-surface shadow-card"
        open={Boolean(initial.summary || initial.conclusion || initial.observations)}
      >
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium sm:px-6">
          Results and conclusions <span className="font-normal text-muted">(optional)</span>
        </summary>
        <div className="space-y-4 border-t border-line px-5 py-4 sm:px-6">
          <p className="text-xs text-muted">
            Analysis usually happens in your own code or software. If you write it up, link the report under
            Files and data instead of copying it here.
          </p>
          <Field label="Result summary" htmlFor="summary" optional>
            <Textarea id="summary" name="summary" defaultValue={initial.summary} />
          </Field>
          {initial.observations ? (
            <Field label="Observations" htmlFor="observations" optional>
              <Textarea id="observations" name="observations" defaultValue={initial.observations} />
            </Field>
          ) : null}
          <Field label="Conclusion" htmlFor="conclusion" optional>
            <Textarea id="conclusion" name="conclusion" defaultValue={initial.conclusion} />
          </Field>
        </div>
      </details>

      {props.siblingExperiments.length > 0 ? (
        <SectionCard title="Relationship" description="Link this run to the one it repeats, so the timeline shows it.">
          <Field label="Repeats" htmlFor="repeatsExperimentId" optional>
            <Select id="repeatsExperimentId" name="repeatsExperimentId" defaultValue={initial.repeatsExperimentId}>
              <option value="">Not a repeat</option>
              {props.siblingExperiments
                .filter((e) => e.id !== props.experimentId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {experimentCode(e.number)}: {e.title}
                  </option>
                ))}
            </Select>
          </Field>
        </SectionCard>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">
          {props.mode === 'create' ? 'Save experiment' : 'Save changes'}
        </SubmitButton>
        <Link
          href={props.experimentId ? `/experiments/${props.experimentId}` : `/projects/${props.projectId}`}
          className="text-sm text-muted underline underline-offset-2 hover:text-fg"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
