import Link from 'next/link';
import { NewExperiment } from '@/components/new-experiment';
import { ButtonLink, EmptyState, PageHeader } from '@/components/ui';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import {
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
  searchParams: { project?: string; file?: string };
}) {
  const session = await requireSession();
  const projects = await listProjects(session);

  if (projects.length === 0) {
    return (
      <>
        <PageHeader title="Record an experiment" />
        <EmptyState
          title="Make a project first"
          description="Every experiment belongs to a project, so it has something to be compared with. It takes ten seconds."
          action={<ButtonLink href="/projects/new">New project</ButtonLink>}
        />
      </>
    );
  }

  const project = projects.find((p) => p.id === searchParams.project) ?? projects[0]!;

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
        description="Drop the files you already have and Labvia fills in what it can read. Only the name is required."
      />

      {projects.length > 1 ? (
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
        key={`${project.id}:${fromFile?.file.id ?? ''}`}
        projectId={project.id}
        projectName={project.name}
        nextNumber={number}
        protocolVersions={protocolVersions}
        siblingExperiments={siblings.map((e) => ({ id: e.id, number: e.number, title: e.title }))}
        initialDraft={fromFile?.draft}
        storedFile={fromFile?.file}
      />
    </div>
  );
}
