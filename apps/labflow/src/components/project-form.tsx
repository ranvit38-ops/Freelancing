'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { Card, Field, FormError, Input, Select, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import { createProjectAction, updateProjectAction } from '@/server/actions/records';
import { noState } from '@/server/actions/types';
import { projectStatusLabel } from '@/lib/display';
import type { ProjectStatus } from '@/db/schema';

export function ProjectForm({
  projectId,
  initial,
}: {
  projectId?: string;
  initial?: {
    name: string;
    description: string;
    researchQuestion: string;
    status: ProjectStatus;
    tags: string;
  };
}) {
  const [state, action] = useFormState(projectId ? updateProjectAction : createProjectAction, noState);
  const value = initial ?? {
    name: '',
    description: '',
    researchQuestion: '',
    status: 'active' as ProjectStatus,
    tags: '',
  };

  return (
    <form action={action} className="space-y-5">
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      <FormError>{state.error}</FormError>
      <Card className="space-y-4 p-5 sm:p-6">
        <Field label="Project name" htmlFor="name" error={state.fieldErrors?.name}>
          <Input id="name" name="name" defaultValue={value.name} placeholder="PFAS Removal Study" required autoFocus />
        </Field>
        <Field
          label="Research question"
          htmlFor="researchQuestion"
          optional
          hint="The question this whole project is trying to answer."
        >
          <Textarea
            id="researchQuestion"
            name="researchQuestion"
            defaultValue={value.researchQuestion}
            placeholder="Which sorbent achieves the longest PFOA breakthrough time under field-relevant conditions?"
          />
        </Field>
        <Field label="Description" htmlFor="description" optional>
          <Textarea id="description" name="description" defaultValue={value.description} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={value.status}>
              {(Object.keys(projectStatusLabel) as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>
                  {projectStatusLabel[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tags" htmlFor="tags" optional hint="Comma separated.">
            <Input id="tags" name="tags" defaultValue={value.tags} placeholder="pfas, sorption" />
          </Field>
        </div>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">
          {projectId ? 'Save changes' : 'Create project'}
        </SubmitButton>
        <Link
          href={projectId ? `/projects/${projectId}` : '/projects'}
          className="text-sm text-muted underline underline-offset-2 hover:text-fg"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
