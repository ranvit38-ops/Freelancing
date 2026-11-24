'use client';

import { useActionState, useState } from 'react';
import { setExperimentAccessAction } from '@/server/actions/sharing';
import { noState } from '@/server/actions/types';
import { SubmitButton } from './submit-button';
import { Card, CardHeader, FormError } from './ui';

type Person = { id: string; name: string; role: string };

/**
 * Who sees one experiment. Open to the lab by default; limited, only the
 * chosen people see it at all: the record, its notes, files, data and its
 * discussion. Owners and admins always see everything, and say so, rather
 * than the page pretending otherwise.
 */
export function ExperimentAccess({
  experimentId,
  restricted,
  memberIds,
  people,
  canManage,
  currentUserId,
}: {
  experimentId: string;
  restricted: boolean;
  memberIds: string[];
  people: Person[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [state, action] = useActionState(setExperimentAccessAction, noState);
  const [mode, setMode] = useState<'everyone' | 'people'>(restricted ? 'people' : 'everyone');
  const names = people.filter((p) => memberIds.includes(p.id)).map((p) => (p.id === currentUserId ? 'you' : p.name));
  const leads = people.filter((p) => p.role !== 'member');

  return (
    <Card data-experiment-access>
      <CardHeader
        title={restricted ? '🔒 Private experiment' : 'Who can see this'}
        description={
          restricted
            ? `Only ${names.join(', ') || 'the people on it'}, and the lab's owners and admins.`
            : 'Everyone in the lab.'
        }
      />
      {canManage ? (
        <form action={action} className="space-y-3 px-5 py-4">
          <input type="hidden" name="experimentId" value={experimentId} />
          <FormError>{state.error}</FormError>
          <fieldset className="space-y-1.5">
            <legend className="sr-only">Who can see this experiment</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="access" value="everyone" checked={mode === 'everyone'} onChange={() => setMode('everyone')} />
              Everyone in the lab
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="access" value="people" checked={mode === 'people'} onChange={() => setMode('people')} />
              Only the people I choose
            </label>
          </fieldset>
          {mode === 'people' ? (
            <fieldset className="space-y-1.5 rounded-lg border border-line p-3">
              <legend className="px-1 text-xs text-muted">Who is on this experiment</legend>
              {people
                .filter((p) => p.role === 'member' || p.id === currentUserId)
                .map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="people"
                      value={p.id}
                      defaultChecked={p.id === currentUserId || memberIds.includes(p.id)}
                      disabled={p.id === currentUserId}
                    />
                    {p.id === currentUserId ? `${p.name} (you, always on it)` : p.name}
                  </label>
                ))}
              {leads.length ? (
                <p className="pt-1 text-xs text-muted">
                  Always included as owner or admin: {leads.filter((p) => p.id !== currentUserId).map((p) => p.name).join(', ') || 'only you'}.
                </p>
              ) : null}
            </fieldset>
          ) : null}
          <p className="text-xs text-muted">
            Its notes, files, data and discussion go with it. Nobody else finds it in lists, search, the calendar or LabBot.
          </p>
          <SubmitButton size="sm" tone="secondary" pendingLabel="Saving…">
            Save
          </SubmitButton>
          {state.ok ? (
            <p role="status" className="text-sm text-ok">
              {state.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </Card>
  );
}
