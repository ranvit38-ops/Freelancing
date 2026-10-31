import { deleteProjectAction, removeProjectFileAction } from '@/server/actions/records';
import { ProjectFolderDrop } from '@/components/file-under';
import { ConfirmSubmit } from '@/components/file-upload';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectTabs } from '@/components/project-tabs';
import { ExperimentList } from '@/components/records';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  DefinitionList,
  EmptyState,
  PageHeader,
  Prose,
} from '@/components/ui';
import { formatBytes, formatDate, pluralise, projectStatusLabel } from '@/lib/display';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getProject, listExperiments, listProjectFiles, listSamples } from '@/server/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  try {
    const session = await requireSession();
    return { title: (await getProject(session, params.projectId)).name };
  } catch {
    return { title: 'Project' };
  }
}

export default async function ProjectOverviewPage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const session = await requireSession();
  let project;
  try {
    project = await getProject(session, params.projectId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }

  const exampleNotice = project.isExample ? (
    <Card className="mb-5 border-accent/30 bg-accent-soft/40 p-5">
      <h2 className="text-sm font-semibold tracking-tight">This is the worked example</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Two runs of the same protocol that differ in one condition and one carbon lot. Open Compare
        to see both differences side by side, which is the question this product exists to answer.
        It does not count against your plan, and you can remove it whenever you like.
      </p>
      <form action={deleteProjectAction} className="mt-4">
        <input type="hidden" name="projectId" value={project.id} />
        <ConfirmSubmit
          tone="secondary"
          size="sm"
          message="Remove the example project and its two runs? Your own work is not affected."
        >
          Remove the example
        </ConfirmSubmit>
      </form>
    </Card>
  ) : null;

  const [experiments, samples, projectFileRows] = await Promise.all([
    listExperiments(session, { projectId: project.id }),
    listSamples(session, { projectId: project.id }),
    listProjectFiles(session, project.id),
  ]);

  const byStatus = experiments.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});
  const researchers = Array.from(
    new Set(experiments.map((e) => e.researcherName).filter((n): n is string => Boolean(n))),
  );

  return (
    <>
      <PageHeader
        eyebrow="Project"
        title={project.name}
        description={project.researchQuestion ?? project.description ?? undefined}
        actions={
          <>
            <ButtonLink href={`/projects/${project.id}/experiments/new`}>New experiment</ButtonLink>
            <ButtonLink href={`/projects/${project.id}/discussion`} tone="secondary">
              Discussion
            </ButtonLink>
            <ButtonLink href={`/projects/${project.id}/updates`} tone="secondary">
              Generate research update
            </ButtonLink>
            <ButtonLink href={`/projects/${project.id}/edit`} tone="secondary">
              Edit
            </ButtonLink>
          </>
        }
      />
      <ProjectTabs projectId={project.id} />
      {exampleNotice}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Experiments', value: String(experiments.length) },
          { label: 'Completed', value: String(byStatus.completed ?? 0) },
          { label: 'Needs investigation', value: String(byStatus.needs_investigation ?? 0) },
          { label: 'Files', value: String(projectFileRows.length) },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-subtle">
              {stat.label}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {stat.value}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader
            title="Experiments"
            description={pluralise(experiments.length, 'experiment')}
            action={
              <Link
                href={`/projects/${project.id}/timeline`}
                className="text-sm text-muted underline underline-offset-2 hover:text-fg"
              >
                Timeline
              </Link>
            }
          />
          <ExperimentList
            experiments={experiments}
            empty={
              <EmptyState
                title="No experiments in this project yet"
                description="Record the first one, a name is all it takes to start."
                action={
                  <ButtonLink href={`/projects/${project.id}/experiments/new`} size="sm">
                    New experiment
                  </ButtonLink>
                }
              />
            }
          />
        </Card>

        <Card>
          <CardHeader
            title="Project files"
            description="The project's folder: raw data, code, pictures, metadata. Organised however your lab likes."
          />
          {projectFileRows.length === 0 ? (
            <p className="px-5 text-sm text-muted">
              Nothing filed here yet. Upload below, or use “File under…” on anything already in{' '}
              <Link href="/files" className="underline underline-offset-2">
                Files
              </Link>
              .
            </p>
          ) : (
            <div className="divide-y divide-line">
              {[...new Set(projectFileRows.map((f) => f.folder ?? ''))].map((folder) => (
                <section key={folder} className="px-5 py-3">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">{folder || 'Unsorted'}</h3>
                  <ul className="mt-1.5 space-y-1.5">
                    {projectFileRows
                      .filter((f) => (f.folder ?? '') === folder)
                      .map((f) => (
                        <li key={f.id} className="flex items-center gap-3 text-sm">
                          <a
                            href={f.isDocument ? `/docs/${f.id}` : (f.sourceUrl ?? `/api/files/${f.id}`)}
                            className="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
                          >
                            {f.filename}
                          </a>
                          <span className="shrink-0 text-xs text-subtle">
                            {f.sourceUrl ? 'Link' : formatBytes(f.byteSize)}
                          </span>
                          {f.uploadedById === session.userId || session.role !== 'member' ? (
                            <form action={removeProjectFileAction} className="shrink-0">
                              <input type="hidden" name="projectId" value={project.id} />
                              <input type="hidden" name="fileId" value={f.id} />
                              <button type="submit" className="text-xs text-muted hover:text-fg">
                                Take out
                              </button>
                            </form>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <div className="border-t border-line px-5 py-4">
            <ProjectFolderDrop projectId={project.id} projectName={project.name} />
          </div>
        </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold tracking-tight">Details</h2>
            <DefinitionList
              items={[
                { term: 'Status', value: <Badge>{projectStatusLabel[project.status]}</Badge> },
                { term: 'Owner', value: project.ownerName ?? 'not recorded' },
                { term: 'Created', value: formatDate(project.createdAt) },
                { term: 'Last updated', value: formatDate(project.updatedAt) },
              ]}
            />
            {project.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {project.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold tracking-tight">Question and hypothesis</h2>
            <Prose text={project.researchQuestion} />
          </Card>

          {project.description ? (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-semibold tracking-tight">Description</h2>
              <Prose text={project.description} />
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold tracking-tight">Researchers</h2>
            {researchers.length === 0 ? (
              <p className="text-sm text-subtle">No experiments recorded yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {researchers.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
