import Link from 'next/link';
import { NewExperiment } from '@/components/new-experiment';
import { QuickProjectForm } from '@/components/simple-forms';
import { Card, PageHeader } from '@/components/ui';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { experimentCode } from '@/lib/display';
import { runAgainInitial } from '@/lib/run-again';
import {
  getExperimentRecord,
  listExperiments,
  listProjects,
  listProtocolVersionOptions,
  nextExperimentNumber,
} from '@/server/queries';
import { draftFromStoredFile } from '@/server/uploads';

export const metadata = { title: 'Record an experiment' };
export const dynamic = 'force-dynamic';

/**
 * Record an experiment from anywhere, not only from inside a project.
 *
 * The drop-your-files form used to be three clicks deep, and nobody found it.
 * This is the same form one click from Home, with the project chosen here, and
 * it can start from a file already in the lab's Files (?file=).
 */
export default async function RecordExperimentPage({
  searchParams,
}: {
  searchParams: { project?: string; file?: string; from?: string };
}) {
  const session = await requireSession();
  // The example project is there to be looked at. Real work never lands in it
  // by default, and it is not offered as a place to put a new record.
  const projects = (await listProjects(session)).filter((p) => !p.isExample);

  if (projects.length === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader
          title="Record an experiment"
          description="Experiments are grouped by the project they belong to, so related runs can be compared. Name yours and you are straight back here."
        />
        <Card className="p-5">
          <QuickProjectForm file={searchParams.file} />
        </Card>
      </div>
    );
  }

  // "Run again": an earlier run in this lab to start from. A stale link, or a
  // run in the example project, falls back to the ordinary blank form.
  let source: Awaited<ReturnType<typeof getExperimentRecord>> | null = null;
  if (searchParams.from) {
    try {
      source = await getExperimentRecord(session, searchParams.from);
    } catch (error) {
      if (!(error instanceof NotFoundInWorkspaceError)) throw error;
    }
  }
  const sourceProjectId = source?.experiment.projectId;
  const sourceProject = sourceProjectId ? projects.find((p) => p.id === sourceProjectId) : undefined;
  if (!sourceProject) source = null;

  const project =
    sourceProject ?? projects.find((p) => p.id === searchParams.project) ?? projects[0]!;

  // A file from the lab's Files. A stale or private link simply falls back to
  // the ordinary form rather than an error page.
  let fromFile: Awaited<ReturnType<typeof draftFromStoredFile>> | null = null;
  if (searchParams.file) {
    try {
      fromFile = await draftFromStoredFile(session, searchParams.file);
    } catch (error) {
      if (!(error instanceof NotFoundInWorkspaceError)) throw error;
    }
  }

  const [protocolVersions, siblings, number] = await Promise.all([
    listProtocolVersionOptions(session),
    listExperiments(session, { projectId: project.id }),
    nextExperimentNumber(session, project.id),
  ]);

  const keep = searchParams.file ? `&file=${encodeURIComponent(searchParams.file)}` : '';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Record an experiment"
        description="Say what you did in your own words, or drop your files, and LabLedger fills in the form for you to check. Only the name is required."
      />

      {projects.length > 1 && !source ? (
        <nav aria-label="Which project" className="mb-5">
          <p className="mb-2 text-sm font-medium">Which project is it for?</p>
          <ul className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/experiments/new?project=${p.id}${keep}`}
                  aria-current={p.id === project.id ? 'true' : undefined}
                  className={
                    p.id === project.id
                      ? 'inline-block rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent'
                      : 'inline-block rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted hover:text-fg'
                  }
                >
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <NewExperiment
        key={`${project.id}:${fromFile?.file.id ?? ''}:${source?.experiment.id ?? ''}`}
        projectId={project.id}
        projectName={project.name}
        nextNumber={number}
        protocolVersions={protocolVersions}
        aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
        siblingExperiments={siblings.map((e) => ({ id: e.id, number: e.number, title: e.title }))}
        initialDraft={fromFile?.draft}
        storedFile={fromFile?.file}
        initial={
          source
            ? runAgainInitial({
                ...source.experiment,
                conditions: source.conditions,
                samples: source.samples,
              })
            : undefined
        }
        repeatOf={
          source
            ? `${experimentCode(source.experiment.number)} ${source.experiment.title}`
            : undefined
        }
      />
    </div>
  );
}
