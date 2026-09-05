'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { Card, Field, FormError, Input, Select, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import {
  addProtocolVersionAction,
  createProtocolAction,
  createSampleAction,
} from '@/server/actions/records';
import { noState } from '@/server/actions/types';

type ProjectOption = { id: string; name: string };

export function SampleForm({
  projects,
  parents,
}: {
  projects: ProjectOption[];
  parents: { id: string; code: string }[];
}) {
  const [state, action] = useFormState(createSampleAction, noState);
  return (
    <form action={action} className="space-y-5">
      <FormError>{state.error}</FormError>
      <Card className="space-y-4 p-5 sm:p-6">
        <Field
          label="Sample ID"
          htmlFor="code"
          hint="However your lab labels samples — S-104, BATCH-7, anything."
          error={state.fieldErrors?.code}
        >
          <Input id="code" name="code" placeholder="S-104" required autoFocus className="font-mono" />
        </Field>
        <Field label="Description" htmlFor="description" optional>
          <Input id="description" name="description" placeholder="Spiked groundwater matrix, 10 ppb PFOA" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" htmlFor="projectId" optional>
            <Select id="projectId" name="projectId" defaultValue="">
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Derived from" htmlFor="parentSampleId" optional>
            <Select id="parentSampleId" name="parentSampleId" defaultValue="">
              <option value="">No parent sample</option>
              {parents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes" htmlFor="notes" optional>
          <Textarea id="notes" name="notes" />
        </Field>
      </Card>
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Create sample</SubmitButton>
        <Link href="/samples" className="text-sm text-muted underline underline-offset-2 hover:text-fg">
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function ProtocolForm({ projects }: { projects: ProjectOption[] }) {
  const [state, action] = useFormState(createProtocolAction, noState);
  return (
    <form action={action} className="space-y-5">
      <FormError>{state.error}</FormError>
      <Card className="space-y-4 p-5 sm:p-6">
        <Field label="Protocol name" htmlFor="name" error={state.fieldErrors?.name}>
          <Input id="name" name="name" placeholder="PFAS Extraction" required autoFocus />
        </Field>
        <Field label="Description" htmlFor="description" optional>
          <Input id="description" name="description" />
        </Field>
        <Field label="Project" htmlFor="projectId" optional hint="Leave blank to share it across the workspace.">
          <Select id="projectId" name="projectId" defaultValue="">
            <option value="">Whole workspace</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Method (version 1)" htmlFor="body" optional>
          <Textarea id="body" name="body" className="min-h-[180px]" placeholder="Steps, reagents, instrument settings…" />
        </Field>
      </Card>
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Create protocol</SubmitButton>
        <Link href="/protocols" className="text-sm text-muted underline underline-offset-2 hover:text-fg">
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function ProtocolVersionForm({ protocolId }: { protocolId: string }) {
  const [state, action] = useFormState(addProtocolVersionAction, noState);
  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <input type="hidden" name="protocolId" value={protocolId} />
      <FormError>{state.error}</FormError>
      <Field
        label="What changed"
        htmlFor="changeNote"
        hint="This is what someone reads six months from now to understand the difference."
        error={state.fieldErrors?.changeNote}
      >
        <Input id="changeNote" name="changeNote" required placeholder="Increased rinse volume to 10 mL" />
      </Field>
      <Field label="Method" htmlFor="body" optional>
        <Textarea id="body" name="body" className="min-h-[160px]" />
      </Field>
      <SubmitButton tone="secondary" size="sm" pendingLabel="Saving…">
        Save new version
      </SubmitButton>
    </form>
  );
}
