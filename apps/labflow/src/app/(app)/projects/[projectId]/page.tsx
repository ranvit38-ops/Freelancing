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
import { formatDate, pluralise, projectStatusLabel } from '@/lib/display';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getProject, listExperiments, listSamples } from '@/server/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { projectId: string } }) {
  try {
    const session = await requireSession();
    return { title: (await getProject(session, params.projectId)).name };
  } catch {
    return { title: 'Project' };
  }
}

export default async function ProjectOverviewPage({ params }: { params: { projectId: string } }) {
  const session = await requireSession();
  let project;
  try {
    project = await getProject(session, params.projectId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }

  const [experiments, samples] = await Promise.all([
    listExperiments(session, { projectId: project.id }),
    listSamples(session, { projectId: project.id }),
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

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Experiments', value: String(experiments.length) },
          { label: 'Completed', value: String(byStatus.completed ?? 0) },
          { label: 'Needs investigation', value: String(byStatus.needs_investigation ?? 0) },
          { label: 'Samples', value: String(samples.length) },
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

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
                description="Record the first one — a name is all it takes to start."
                action={
                  <ButtonLink href={`/projects/${project.id}/experiments/new`} size="sm">
                    New experiment
                  </ButtonLink>
                }
              />
            }
          />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold tracking-tight">Details</h2>
            <DefinitionList
              items={[
                { term: 'Status', value: <Badge>{projectStatusLabel[project.status]}</Badge> },
                { term: 'Owner', value: project.ownerName ?? '—' },
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
            <h2 className="mb-2 text-sm font-semibold tracking-tight">Research question</h2>
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
