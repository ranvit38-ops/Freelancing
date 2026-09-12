import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectTabs } from '@/components/project-tabs';
import { StatusBadge } from '@/components/records';
import { ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { experimentCode, formatDate } from '@/lib/display';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getProject, listExperiments } from '@/server/queries';

export const metadata = { title: 'Timeline' };
export const dynamic = 'force-dynamic';

export default async function TimelinePage({ params }: { params: { projectId: string } }) {
  const session = await requireSession();
  let project;
  try {
    project = await getProject(session, params.projectId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }

  const experiments = (await listExperiments(session, { projectId: project.id })).slice().reverse();
  const byId = new Map(experiments.map((e) => [e.id, e]));

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Timeline"
        description="Every experiment in order, with repeats linked to the run they revisit."
        actions={
          <ButtonLink href={`/projects/${project.id}/experiments/new`}>New experiment</ButtonLink>
        }
      />
      <ProjectTabs projectId={project.id} />

      {experiments.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing on the timeline yet"
            description="It fills in as you record experiments."
          />
        </Card>
      ) : (
        <ol className="relative space-y-3 border-l border-line pl-6">
          {experiments.map((e) => {
            const repeated = e.repeatsExperimentId ? byId.get(e.repeatsExperimentId) : undefined;
            return (
              <li key={e.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[1.8125rem] top-5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-accent"
                />
                <Card className="p-4 transition-colors hover:border-accent/40">
                  <Link href={`/experiments/${e.id}`} className="block">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="font-mono text-xs text-subtle">
                        {experimentCode(e.number)}
                      </span>
                      <span className="font-medium">{e.title}</span>
                      <span className="ml-auto">
                        <StatusBadge status={e.status} />
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-muted">
                      {[
                        formatDate(e.performedOn),
                        e.researcherName,
                        e.protocolName ? `${e.protocolName} v${e.protocolVersion}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {e.objective ? (
                      <p className="mt-1.5 line-clamp-2 text-sm text-muted">{e.objective}</p>
                    ) : null}
                  </Link>
                  {repeated ? (
                    <p className="mt-2 border-t border-line pt-2 text-xs text-muted">
                      Repeats{' '}
                      <Link
                        href={`/experiments/${repeated.id}`}
                        className="underline underline-offset-2"
                      >
                        {experimentCode(repeated.number)} · {repeated.title}
                      </Link>
                    </p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
