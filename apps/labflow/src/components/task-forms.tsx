'use client';

import { useRef } from 'react';
import { useFormState } from 'react-dom';
import { Card, CardHeader, Field, FormError, Input, Select, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import { createTaskAction } from '@/server/actions/tasks';
import { noState } from '@/server/actions/types';
import { EVERYONE } from '@/lib/tasks';

type Member = { id: string; name: string | null; email: string };
type Project = { id: string; name: string };

/**
 * Adding a piece of work.
 *
 * Only the title is required, and it is the only field above the fold. A form
 * that demands an assignee and a date before it will accept "run the second
 * extraction" is a form nobody fills in, and the task that never got written
 * down is the one the next student repeats by accident.
 */
export function TaskComposer({
  members,
  projects,
  currentUserId,
}: {
  members: Member[];
  projects: Project[];
  currentUserId: string;
}) {
  const [state, action] = useFormState(createTaskAction, noState);
  const form = useRef<HTMLFormElement>(null);

  // Cleared on success so the next one can be typed straight away; a board is
  // usually filled in three at a time, right after a meeting.
  if (state.ok) form.current?.reset();

  return (
    <Card>
      <CardHeader title="Add a task" description="Everyone in the lab can add and assign." />
      <form ref={form} action={action} className="space-y-4 px-5 py-4">
        <FormError>{state.error}</FormError>
        {state.ok ? (
          <p role="status" className="rounded-lg border border-ok/25 bg-ok/5 px-3 py-2 text-sm text-ok">
            {state.message}
          </p>
        ) : null}

        <Field label="What needs doing" htmlFor="task-title" error={state.fieldErrors?.title}>
          <Input
            id="task-title"
            name="title"
            required
            maxLength={200}
            placeholder="Re-run the extraction on the June samples"
          />
        </Field>

        <Field label="Who" htmlFor="task-assignee" optional>
          <Select id="task-assignee" name="assignedTo" defaultValue="">
            <option value="">Nobody yet</option>
            <option value={EVERYONE}>Everyone in the lab</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? `${m.name ?? m.email} (you)` : (m.name ?? m.email)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Deadline" htmlFor="task-due" optional error={state.fieldErrors?.dueOn}>
          <Input id="task-due" name="dueOn" type="date" />
        </Field>

        <Field label="Project" htmlFor="task-project" optional>
          <Select id="task-project" name="projectId" defaultValue="">
            <option value="">Not project specific</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Anything they need to know"
          htmlFor="task-detail"
          hint="Which samples, which protocol, what went wrong last time."
          optional
        >
          <Textarea id="task-detail" name="detail" rows={3} />
        </Field>

        <SubmitButton className="w-full" pendingLabel="Adding…">
          Add task
        </SubmitButton>
      </form>
    </Card>
  );
}
