'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PlannedEvent, PlannedExperiment, PlannedNote, PlannedSamples, PlannedTask } from '@/server/ai/assistant';
import { saveEventsAction, saveNoteAction, saveSamplesAction, saveTasksAction, type PlanState, type SaveResult } from '@/server/actions/assistant';
import { stashPrefill } from '@/lib/labbot-prefill';
import { Button } from './ui';

type Projects = { id: string; name: string }[];

/**
 * What LabBot prepared, as cards. Nothing here is saved until its button is
 * pressed, and a new experiment opens in the normal form to check first.
 */
export function FillResult({ state }: { state: PlanState }) {
  const plan = state.plan;
  if (!plan) return null;
  const projects = state.projects ?? [];
  const events = plan.events ?? [];
  const empty = !plan.experiments.length && !plan.notes.length && !plan.tasks.length && !plan.samples.length && !events.length;
  return (
    <div className="space-y-3">
      {plan.reply ? <p className="text-sm">{plan.reply}</p> : null}
      {plan.experiments.map((e, i) => (
        <ExperimentCard key={`e${i}`} experiment={e} projects={projects} />
      ))}
      {plan.notes.map((n, i) => (
        <NoteCard key={`n${i}`} note={n} label={state.labels?.[n.experimentId] ?? 'the experiment'} />
      ))}
      {plan.tasks.length ? <TasksCard tasks={plan.tasks} /> : null}
      {events.length ? <EventsCard events={events} /> : null}
      {plan.samples.map((g, i) => (
        <SamplesCard key={`s${i}`} group={g} projects={projects} />
      ))}
      {!empty ? (
        <p className="text-[11px] text-subtle">Nothing is saved until you press a button. Check each one first.</p>
      ) : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-line bg-bg p-3 text-sm">
      <h3 className="text-xs font-semibold text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Done({ result }: { result: SaveResult }) {
  return result.ok ? (
    <p role="status" className="text-xs text-ok">
      {result.message}{' '}
      {result.href ? (
        <a href={result.href} className="underline underline-offset-2">
          Open
        </a>
      ) : null}
    </p>
  ) : (
    <p role="alert" className="text-xs text-danger">
      {result.error}
    </p>
  );
}

function useSave() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  async function run(save: () => Promise<SaveResult>) {
    setBusy(true);
    setResult(await save().catch(() => ({ ok: false as const, error: 'Could not save. Check your connection and try again.' })));
    setBusy(false);
  }
  return { busy, result, run, saved: result?.ok === true };
}

function ProjectPicker({ id, value, onChange, projects }: { id: string; value: string; onChange: (v: string) => void; projects: Projects }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted" htmlFor={id}>
      Project
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg"
      >
        <option value="">Choose a project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExperimentCard({ experiment, projects }: { experiment: PlannedExperiment; projects: Projects }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(experiment.projectId);
  const lines = [
    experiment.performedOn && `Date: ${experiment.performedOn}`,
    experiment.conditions.length && `Conditions: ${experiment.conditions.map((c) => `${c.name} ${c.value}${c.unit ? ` ${c.unit}` : ''}`).join(', ')}`,
    experiment.notes && `Notes: ${experiment.notes}`,
    experiment.dataLocation && `Data: ${experiment.dataLocation}`,
    experiment.nextSteps && `Next: ${experiment.nextSteps}`,
  ].filter(Boolean) as string[];
  return (
    <Card title="New experiment">
      <p className="font-medium">{experiment.title}</p>
      {lines.length ? (
        <ul className="space-y-0.5 text-xs text-muted">
          {lines.map((l) => (
            <li key={l} className="break-words">
              {l}
            </li>
          ))}
        </ul>
      ) : null}
      <ProjectPicker id={`exp-project-${experiment.title}`} value={projectId} onChange={setProjectId} projects={projects} />
      <Button
        type="button"
        size="sm"
        disabled={!projectId}
        onClick={() => {
          stashPrefill(projectId, experiment);
          router.push(`/projects/${projectId}/experiments/new`);
        }}
      >
        Open in the form to check and save
      </Button>
    </Card>
  );
}

function NoteCard({ note, label }: { note: PlannedNote; label: string }) {
  const save = useSave();
  return (
    <Card title={`Note on ${label}`}>
      <p className="whitespace-pre-wrap break-words">{note.body}</p>
      {save.saved ? null : (
        <Button type="button" size="sm" disabled={save.busy} onClick={() => void save.run(() => saveNoteAction(note))}>
          {save.busy ? 'Saving…' : 'Add this note'}
        </Button>
      )}
      {save.result ? <Done result={save.result} /> : null}
    </Card>
  );
}

function TasksCard({ tasks }: { tasks: PlannedTask[] }) {
  const save = useSave();
  const [keep, setKeep] = useState(() => tasks.map(() => true));
  const chosen = tasks.filter((_, i) => keep[i]);
  return (
    <Card title={tasks.length === 1 ? 'Task' : `${tasks.length} tasks`}>
      <ul className="space-y-1">
        {tasks.map((t, i) => (
          <li key={i}>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={keep[i]}
                disabled={save.saved}
                onChange={(e) => setKeep((all) => all.map((k, j) => (j === i ? e.target.checked : k)))}
                className="mt-1"
              />
              <span>
                {t.title}
                {t.dueOn ? <span className="text-xs text-muted"> · due {t.dueOn}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {save.saved ? null : (
        <Button
          type="button"
          size="sm"
          disabled={save.busy || chosen.length === 0}
          onClick={() => void save.run(() => saveTasksAction({ tasks: chosen }))}
        >
          {save.busy ? 'Saving…' : chosen.length === 1 ? 'Add this task' : `Add ${chosen.length} tasks`}
        </Button>
      )}
      {save.result ? <Done result={save.result} /> : null}
    </Card>
  );
}

/** Calendar cards: the day and time can be fixed here before adding. */
function EventsCard({ events }: { events: PlannedEvent[] }) {
  const save = useSave();
  const [rows, setRows] = useState(() => events.map((e) => ({ ...e, keep: true })));
  const chosen = rows.filter((r) => r.keep);
  const missingDay = chosen.some((r) => !r.onDate);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Card title={events.length === 1 ? 'Calendar' : `${events.length} calendar events`}>
      <ul className="space-y-2" data-labbot-events>
        {rows.map((r, i) => (
          <li key={i} className="space-y-1">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={r.keep} disabled={save.saved} onChange={(e) => set(i, { keep: e.target.checked })} className="mt-1" />
              <span>
                {r.title}
                {r.notes ? <span className="block text-xs text-muted">{r.notes}</span> : null}
              </span>
            </label>
            <div className="flex gap-2 pl-6">
              <label className="sr-only" htmlFor={`ev-day-${i}`}>
                Day for {r.title}
              </label>
              <input
                id={`ev-day-${i}`}
                type="date"
                value={r.onDate}
                disabled={save.saved}
                onChange={(e) => set(i, { onDate: e.target.value })}
                className="h-8 rounded-md border border-line bg-surface px-2 text-xs"
              />
              <label className="sr-only" htmlFor={`ev-time-${i}`}>
                Time for {r.title}
              </label>
              <input
                id={`ev-time-${i}`}
                type="time"
                value={r.atTime}
                disabled={save.saved}
                onChange={(e) => set(i, { atTime: e.target.value })}
                className="h-8 rounded-md border border-line bg-surface px-2 text-xs"
              />
            </div>
          </li>
        ))}
      </ul>
      {missingDay && !save.saved ? <p className="text-xs text-warn">Pick a day for each one first.</p> : null}
      {save.saved ? null : (
        <Button
          type="button"
          size="sm"
          disabled={save.busy || chosen.length === 0 || missingDay}
          onClick={() => void save.run(() => saveEventsAction({ events: chosen.map(({ keep: _keep, ...e }) => e) }))}
        >
          {save.busy ? 'Adding…' : 'Add to calendar'}
        </Button>
      )}
      {save.result ? <Done result={save.result} /> : null}
    </Card>
  );
}

function SamplesCard({ group, projects }: { group: PlannedSamples; projects: Projects }) {
  const save = useSave();
  const [projectId, setProjectId] = useState(group.projectId);
  const shown = group.codes.slice(0, 12).join(', ') + (group.codes.length > 12 ? ` and ${group.codes.length - 12} more` : '');
  return (
    <Card title={group.codes.length === 1 ? 'Sample' : `${group.codes.length} samples`}>
      <p className="break-words font-mono text-xs">{shown}</p>
      {group.description ? <p className="text-xs text-muted">{group.description}</p> : null}
      <ProjectPicker id={`samples-project-${group.codes[0]}`} value={projectId} onChange={setProjectId} projects={projects} />
      {save.saved ? null : (
        <Button
          type="button"
          size="sm"
          disabled={save.busy}
          onClick={() => void save.run(() => saveSamplesAction({ ...group, projectId }))}
        >
          {save.busy ? 'Saving…' : group.codes.length === 1 ? 'Create this sample' : `Create ${group.codes.length} samples`}
        </Button>
      )}
      {save.result ? <Done result={save.result} /> : null}
    </Card>
  );
}
