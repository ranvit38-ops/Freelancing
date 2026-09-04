import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CompletenessPanel } from '@/components/completeness-panel';
import { AttachLink } from '@/components/attach-link';
import { Discussion } from '@/components/discussion';
import { ConfirmSubmit, FileUpload } from '@/components/file-upload';
import { StatusBadge } from '@/components/records';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  DefinitionList,
  EmptyState,
  PageHeader,
  Prose,
  Select,
  Textarea,
} from '@/components/ui';
import { checkCompleteness } from '@/lib/completeness';
import { experimentCode, experimentStatusLabel, formatBytes, formatDate } from '@/lib/display';
import { embedUrl, providerLabel } from '@/lib/links';
import type { ExperimentStatus } from '@/db/schema';
import {
  addNoteAction,
  deleteExperimentAction,
  deleteNoteAction,
  setExperimentStatusAction,
} from '@/server/actions/records';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getExperimentRecord, listDiscussion } from '@/server/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { experimentId: string } }) {
  try {
    const session = await requireSession();
    const { experiment } = await getExperimentRecord(session, params.experimentId);
    return { title: `${experimentCode(experiment.number)} · ${experiment.title}` };
  } catch {
    return { title: 'Experiment' };
  }
}

export default async function ExperimentPage({ params }: { params: { experimentId: string } }) {
  const session = await requireSession();
  let record;
  try {
    record = await getExperimentRecord(session, params.experimentId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }

  const { experiment, conditions, samples, result, notes, files, datasets } = record;
  const messages = await listDiscussion(session, { experimentId: experiment.id });

  const report = checkCompleteness({
    objective: experiment.objective,
    hypothesis: experiment.hypothesis,
    protocolName: experiment.protocolName,
    protocolVersion: experiment.protocolVersion,
    conditionCount: conditions.length,
    sampleCount: samples.length,
    datasetCount: datasets.length,
    fileCount: files.length,
    summary: result?.summary ?? null,
    observations: result?.observations ?? null,
    conclusion: result?.conclusion ?? null,
    nextSteps: result?.nextSteps ?? null,
    noteCount: notes.length,
  });

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/projects/${experiment.projectId}`} className="hover:text-fg">
            {experiment.projectName}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-base text-subtle">
              {experimentCode(experiment.number)}
            </span>
            {experiment.title}
          </span>
        }
        description={experiment.objective ?? undefined}
        actions={
          <>
            <ButtonLink href={`/experiments/${experiment.id}/edit`}>Edit</ButtonLink>
            <ButtonLink href={`/projects/${experiment.projectId}/compare?ids=${experiment.id}`} tone="secondary">
              Compare
            </ButtonLink>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusBadge status={experiment.status} />
        {experiment.repeatsExperimentId ? (
          <Link
            href={`/experiments/${experiment.repeatsExperimentId}`}
            className="text-sm text-muted underline underline-offset-2 hover:text-fg"
          >
            Repeats an earlier experiment
          </Link>
        ) : null}
        <form action={setExperimentStatusAction} className="ml-auto flex items-center gap-2">
          <input type="hidden" name="experimentId" value={experiment.id} />
          <label htmlFor="status-change" className="text-sm text-muted">
            Set status
          </label>
          <Select id="status-change" name="status" defaultValue={experiment.status} className="w-48">
            {(Object.keys(experimentStatusLabel) as ExperimentStatus[]).map((s) => (
              <option key={s} value={s}>
                {experimentStatusLabel[s]}
              </option>
            ))}
          </Select>
          <Button type="submit" tone="secondary" size="sm">
            Update
          </Button>
        </form>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold tracking-tight">Record</h2>
            <DefinitionList
              items={[
                { term: 'Date performed', value: formatDate(experiment.performedOn) },
                { term: 'Researcher', value: experiment.researcherName ?? '—' },
                {
                  term: 'Protocol',
                  value: experiment.protocolName ? (
                    <Link
                      href={`/protocols/${experiment.protocolId}`}
                      className="underline underline-offset-2"
                    >
                      {experiment.protocolName} v{experiment.protocolVersion}
                    </Link>
                  ) : (
                    <span className="text-subtle">None linked</span>
                  ),
                },
                { term: 'Recorded', value: formatDate(experiment.createdAt) },
              ]}
            />
            <div className="mt-5 space-y-4 border-t border-line pt-5">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">Objective</h3>
                <div className="mt-1">
                  <Prose text={experiment.objective} />
                </div>
              </div>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">Hypothesis</h3>
                <div className="mt-1">
                  <Prose text={experiment.hypothesis} />
                </div>
              </div>
              {experiment.protocolNotes ? (
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">
                    Protocol deviations
                  </h3>
                  <div className="mt-1">
                    <Prose text={experiment.protocolNotes} />
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Conditions" description={`${conditions.length} recorded`} />
            {conditions.length === 0 ? (
              <EmptyState
                title="No conditions recorded"
                description="Temperature, pH, concentration, duration — whatever you controlled."
                action={
                  <ButtonLink href={`/experiments/${experiment.id}/edit`} size="sm" tone="secondary">
                    Add conditions
                  </ButtonLink>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
                      <th scope="col" className="px-5 py-2 font-medium">Condition</th>
                      <th scope="col" className="px-5 py-2 font-medium">Value</th>
                      <th scope="col" className="px-5 py-2 font-medium">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {conditions.map((c) => (
                      <tr key={c.id}>
                        <td className="px-5 py-2.5">{c.name}</td>
                        <td className="px-5 py-2.5 font-mono tabular-nums">{c.value}</td>
                        <td className="px-5 py-2.5 text-muted">{c.unit ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Result" />
            <div className="space-y-4 px-5 py-4">
              {[
                { label: 'Summary', value: result?.summary ?? null },
                { label: 'Observations', value: result?.observations ?? null },
                { label: 'Conclusion', value: result?.conclusion ?? null },
                { label: 'Next steps', value: result?.nextSteps ?? null },
              ].map((section) => (
                <div key={section.label}>
                  <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">
                    {section.label}
                  </h3>
                  <div className="mt-1">
                    <Prose text={section.value} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Files and data" description={`${files.length} attached`} />
            <div className="space-y-5 px-5 py-4">
              <FileUpload experimentId={experiment.id} />
              <div className="border-t border-line pt-5">
                <AttachLink experimentId={experiment.id} />
              </div>
            </div>
            {files.length > 0 ? (
              <ul className="divide-y divide-line border-t border-line">
                {files.map((f) => {
                  const embed = f.sourceUrl ? embedUrl(f.sourceUrl, f.provider ?? 'web') : null;
                  return (
                    <li key={f.id} className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <a
                          href={f.sourceUrl ?? `/api/files/${f.id}`}
                          target={f.sourceUrl ? '_blank' : undefined}
                          rel={f.sourceUrl ? 'noreferrer noopener' : undefined}
                          className="min-w-0 flex-1 truncate text-sm underline underline-offset-2"
                        >
                          {f.filename}
                        </a>
                        <span className="shrink-0 text-xs text-subtle">
                          {f.sourceUrl
                            ? providerLabel[f.provider ?? 'web']
                            : formatBytes(f.byteSize)}
                        </span>
                      </div>
                      {embed ? (
                        <div className="mt-2 aspect-video w-full max-w-xl overflow-hidden rounded-lg border border-line">
                          <iframe
                            src={embed}
                            title={f.filename}
                            allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                            allowFullScreen
                            loading="lazy"
                            className="h-full w-full"
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {datasets.length > 0 ? (
              <ul className="divide-y divide-line border-t border-line">
                {datasets.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                    <Link
                      href={`/datasets/${d.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium underline underline-offset-2"
                    >
                      {d.name}
                    </Link>
                    <Badge tone="accent">{d.rowCount} rows</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Notes" description={`${notes.length} recorded`} />
            <form action={addNoteAction} className="space-y-3 px-5 py-4">
              <input type="hidden" name="experimentId" value={experiment.id} />
              <label htmlFor="note-body" className="sr-only">
                Add a note
              </label>
              <Textarea
                id="note-body"
                name="body"
                required
                placeholder="Something worth remembering about this run…"
              />
              <Button type="submit" tone="secondary" size="sm">
                Add note
              </Button>
            </form>
            {notes.length > 0 ? (
              <ul className="divide-y divide-line border-t border-line">
                {notes.map((note) => (
                  <li key={note.id} className="px-5 py-4">
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs text-subtle">
                      <span>
                        {note.authorName ?? 'Unknown'} · {formatDate(note.createdAt)}
                      </span>
                      <form action={deleteNoteAction}>
                        <input type="hidden" name="experimentId" value={experiment.id} />
                        <input type="hidden" name="noteId" value={note.id} />
                        <ConfirmSubmit
                          tone="ghost"
                          size="sm"
                          message="Delete this note? This cannot be undone."
                        >
                          Delete
                        </ConfirmSubmit>
                      </form>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6">{note.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Discussion
            messages={messages}
            experimentId={experiment.id}
            currentUserId={session.userId}
            returnTo={`/experiments/${experiment.id}`}
          />
        </div>

        <div className="space-y-5">
          <CompletenessPanel report={report} />

          <Card>
            <CardHeader title="Samples" description={`${samples.length} used`} />
            {samples.length === 0 ? (
              <EmptyState title="No samples attached" />
            ) : (
              <ul className="divide-y divide-line">
                {samples.map((s) => (
                  <li key={s.id}>
                    <Link href={`/samples/${s.id}`} className="block px-5 py-2.5 hover:bg-raised">
                      <span className="font-mono text-sm">{s.code}</span>
                      {s.description ? (
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {s.description}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="LabBot" />
            <div className="px-5 py-4">
              <p className="text-sm text-muted">
                LabBot reads this experiment against its own record and the related runs in this project.
              </p>
              <ButtonLink
                href={`/experiments/${experiment.id}/analysis`}
                tone="secondary"
                size="sm"
                className="mt-3"
              >
                Analyse with LabBot
              </ButtonLink>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold tracking-tight">Danger zone</h2>
            <p className="mt-1 text-sm text-muted">
              Deleting removes this experiment and everything attached to it.
            </p>
            <form action={deleteExperimentAction} className="mt-3">
              <input type="hidden" name="experimentId" value={experiment.id} />
              <ConfirmSubmit
                tone="danger"
                size="sm"
                message={`Delete ${experimentCode(experiment.number)} and all of its conditions, notes and data? This cannot be undone.`}
              >
                Delete experiment
              </ConfirmSubmit>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
