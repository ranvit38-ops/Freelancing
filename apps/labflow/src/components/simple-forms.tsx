'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { Card, Field, FormError, Input, Select, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import {
  addProtocolVersionAction,
  createProjectAction,
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
          hint="However your lab labels samples: S-104, BATCH-7, anything."
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

export function ProtocolForm({
  projects,
  file,
}: {
  projects: ProjectOption[];
  /** The uploaded PDF or Word file this protocol is, when made from Files. */
  file?: { id: string; filename: string } | null;
}) {
  const [state, action] = useFormState(createProtocolAction, noState);
  return (
    <form action={action} className="space-y-5">
      <FormError>{state.error}</FormError>
      <Card className="space-y-4 p-5 sm:p-6">
        {file ? (
          <>
            <input type="hidden" name="fileId" value={file.id} />
            <p className="rounded-lg border border-line bg-raised px-3 py-2 text-sm">
              Version 1 is <span className="font-medium">{file.filename}</span>. When it is revised, upload the new
              file and add it as version 2; experiments keep pointing at the version they used.
            </p>
          </>
        ) : null}
        <Field label="Protocol name" htmlFor="name" error={state.fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            defaultValue={file ? file.filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') : undefined}
            placeholder="PFAS Extraction"
            required
            autoFocus
          />
        </Field>
        <Field label="Description" htmlFor="description" optional>
          <Input id="description" name="description" />
        </Field>
        <Field label="Project" htmlFor="projectId" optional hint="Leave blank to share it across the lab.">
          <Select id="projectId" name="projectId" defaultValue="">
            <option value="">Whole lab</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {file ? null : (
          <Field
            label="The protocol file"
            htmlFor="protocolFile"
            optional
            hint="The Word or PDF your lab already uses. Add photos, manuals and blank tables on the next page."
          >
            <input
              id="protocolFile"
              name="protocolFile"
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm"
            />
          </Field>
        )}
        <Field label={file ? 'Notes on this version' : 'Method, or notes on it'} htmlFor="body" optional>
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

export function ProtocolVersionForm({
  protocolId,
  files = [],
}: {
  protocolId: string;
  /** Shared PDFs and Word files, newest first, to pick the revised protocol from. */
  files?: { id: string; filename: string }[];
}) {
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
      {files.length > 0 ? (
        <Field
          label="Revised file"
          htmlFor="fileId"
          optional
          hint="Upload the new PDF or Word file in Files first, then pick it here."
        >
          <Select id="fileId" name="fileId" defaultValue="">
            <option value="">No file</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.filename}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Method" htmlFor="body" optional>
        <Textarea id="body" name="body" className="min-h-[160px]" />
      </Field>
      <SubmitButton tone="secondary" size="sm" pendingLabel="Saving…">
        Save new version
      </SubmitButton>
    </form>
  );
}

/**
 * The one question standing between a new lab and its first real record.
 * Asked on the record screen itself, so nobody's first experiment is filed
 * under the example project for want of somewhere else to put it.
 */
export function QuickProjectForm({ file }: { file?: string }) {
  const [state, action] = useFormState(createProjectAction, noState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="then" value="record" />
      {file ? <input type="hidden" name="file" value={file} /> : null}
      <FormError>{state.error}</FormError>
      <Field
        label="What is this work part of?"
        htmlFor="name"
        hint="A thesis chapter, a grant aim, a paper in progress. You can rename it later."
        error={state.fieldErrors?.name}
      >
        <Input id="name" name="name" placeholder="Biofilm growth on PDMS" required autoFocus />
      </Field>
      <SubmitButton pendingLabel="Creating…">Continue</SubmitButton>
    </form>
  );
}
