'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import { Button, Card, Field, FormError, Input, Select, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import { createExperimentAction, updateExperimentAction } from '@/server/actions/records';
import { noState } from '@/server/actions/types';
import { experimentCode, experimentStatusLabel } from '@/lib/display';
import type { ExperimentStatus } from '@/db/schema';

export type ConditionRow = { name: string; value: string; unit: string };

export type ExperimentFormProps = {
  mode: 'create' | 'edit';
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
  performedOn: new Date().toISOString().slice(0, 10),
  status: 'in_progress',
  objective: '',
  hypothesis: '',
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

  const updateRow = (index: number, patch: Partial<ConditionRow>) =>
    setConditions((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="projectId" value={props.projectId} />
      {props.experimentId ? (
        <input type="hidden" name="experimentId" value={props.experimentId} />
      ) : null}

      <FormError>{state.error}</FormError>

      <SectionCard
        title="Basics"
        description={
          props.mode === 'create' && props.nextNumber
            ? `Will be recorded as ${experimentCode(props.nextNumber)} in ${props.projectName}. Only a name is required — fill in the rest whenever you like.`
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
            <Input id="performedOn" name="performedOn" type="date" defaultValue={initial.performedOn} />
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

        <Field label="Objective" htmlFor="objective" optional error={state.fieldErrors?.objective}>
          <Textarea
            id="objective"
            name="objective"
            defaultValue={initial.objective}
            placeholder="What is this run meant to find out?"
          />
        </Field>

        <Field label="Hypothesis" htmlFor="hypothesis" optional>
          <Textarea
            id="hypothesis"
            name="hypothesis"
            defaultValue={initial.hypothesis}
            placeholder="What do you expect to happen, and why?"
          />
        </Field>
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
                {pv.protocolName} — v{pv.version}
              </option>
            ))}
          </Select>
        </Field>
        {props.protocolVersions.length === 0 ? (
          <p className="text-xs text-muted">
            No protocols in this workspace yet.{' '}
            <Link href="/protocols/new" className="underline underline-offset-2">
              Add one
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
        description="Paste or type sample IDs. Anything new is created in this workspace automatically."
      >
        <Field label="Sample IDs" htmlFor="sampleCodes" optional hint="Separated by commas, spaces or new lines.">
          <Textarea
            id="sampleCodes"
            name="sampleCodes"
            defaultValue={initial.sampleCodes}
            placeholder="S-104, S-105, S-106"
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
          <Textarea id="notes" name="notes" className="min-h-[140px]" placeholder="Observations, problems, things to check next time…" />
        </Field>
      </SectionCard>

      <SectionCard title="Result" description="Fill this in when the run is done. Nothing here is required to save.">
        <Field label="Result summary" htmlFor="summary" optional>
          <Textarea id="summary" name="summary" defaultValue={initial.summary} />
        </Field>
        <Field label="Observations" htmlFor="observations" optional>
          <Textarea id="observations" name="observations" defaultValue={initial.observations} />
        </Field>
        <Field label="Conclusion" htmlFor="conclusion" optional>
          <Textarea id="conclusion" name="conclusion" defaultValue={initial.conclusion} />
        </Field>
        <Field label="Next steps" htmlFor="nextSteps" optional>
          <Textarea id="nextSteps" name="nextSteps" defaultValue={initial.nextSteps} />
        </Field>
      </SectionCard>

      {props.siblingExperiments.length > 0 ? (
        <SectionCard title="Relationship" description="Link this run to the one it repeats, so the timeline shows it.">
          <Field label="Repeats" htmlFor="repeatsExperimentId" optional>
            <Select id="repeatsExperimentId" name="repeatsExperimentId" defaultValue={initial.repeatsExperimentId}>
              <option value="">Not a repeat</option>
              {props.siblingExperiments
                .filter((e) => e.id !== props.experimentId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {experimentCode(e.number)} — {e.title}
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
