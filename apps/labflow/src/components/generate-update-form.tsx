'use client';

import { useFormState } from 'react-dom';
import { FormError } from './ui';
import { SubmitButton } from './submit-button';
import { generateUpdateAction } from '@/server/actions/updates';
import { noState } from '@/server/actions/types';
import { experimentCode, formatDate } from '@/lib/display';

export function GenerateUpdateForm({
  projectId,
  experiments,
  preselected = [],
}: {
  projectId: string;
  experiments: { id: string; number: number; title: string; performedOn: Date | string | null }[];
  preselected?: string[];
}) {
  const [state, action] = useFormState(generateUpdateAction, noState);

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <input type="hidden" name="projectId" value={projectId} />
      <FormError>{state.error}</FormError>
      <fieldset>
        <legend className="sr-only">Experiments to include</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {experiments.map((e) => (
            <label
              key={e.id}
              className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-raised"
            >
              <input
                type="checkbox"
                name="ids"
                value={e.id}
                defaultChecked={preselected.includes(e.id)}
                className="mt-0.5 h-4 w-4 accent-[rgb(var(--lf-accent))]"
              />
              <span className="min-w-0">
                <span className="block truncate">
                  <span className="font-mono text-xs text-subtle">{experimentCode(e.number)}</span>{' '}
                  {e.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{formatDate(e.performedOn)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton pendingLabel="Building draft…">Generate research update</SubmitButton>
      <p className="text-xs text-subtle">
        The draft is assembled from what you recorded. Nothing is invented, and you can edit every
        word before exporting.
      </p>
    </form>
  );
}
