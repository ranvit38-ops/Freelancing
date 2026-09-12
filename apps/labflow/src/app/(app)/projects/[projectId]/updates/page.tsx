import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GenerateUpdateForm } from '@/components/generate-update-form';
import { ProjectTabs } from '@/components/project-tabs';
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { formatDate, pluralise } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { getProject, listExperiments, listResearchUpdates } from '@/server/queries';

export const metadata = { title: 'Research updates' };
export const dynamic = 'force-dynamic';

export default async function ProjectUpdatesPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { ids?: string };
}) {
  const session = await requireSession();
  let project;
  try {
    project = await getProject(session, params.projectId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }

  const [experiments, updates] = await Promise.all([
    listExperiments(session, { projectId: project.id }),
    listResearchUpdates(session, { projectId: project.id }),
  ]);
  const preselected = (searchParams.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Research updates"
        description="Select the experiments to report on. The draft is assembled from their records."
      />
      <ProjectTabs projectId={project.id} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Generate an update" />
          {experiments.length === 0 ? (
            <EmptyState title="No experiments in this project yet" />
          ) : (
            <GenerateUpdateForm
              projectId={project.id}
              experiments={experiments}
              preselected={preselected}
            />
          )}
        </Card>
        <Card>
          <CardHeader title="Saved updates" description={pluralise(updates.length, 'update')} />
          {updates.length === 0 ? (
            <EmptyState title="No updates yet" />
          ) : (
            <ul className="divide-y divide-line">
              {updates.map((u) => (
                <li key={u.id}>
                  <Link href={`/updates/${u.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-raised">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{u.title}</span>
                      <span className="mt-0.5 block text-xs text-muted">{formatDate(u.updatedAt)}</span>
                    </span>
                    <Badge tone={u.status === 'final' ? 'ok' : 'neutral'}>{u.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
