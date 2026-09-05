import Link from 'next/link';
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { GenerateUpdateForm } from '@/components/generate-update-form';
import { formatDate, pluralise } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { listExperiments, listProjects, listResearchUpdates } from '@/server/queries';

export const metadata = { title: 'Research updates' };
export const dynamic = 'force-dynamic';

export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const session = await requireSession();
  const [projects, updates] = await Promise.all([
    listProjects(session),
    listResearchUpdates(session),
  ]);

  const projectId = searchParams.project ?? projects[0]?.id;
  const experiments = projectId ? await listExperiments(session, { projectId }) : [];
  const project = projects.find((p) => p.id === projectId);

  return (
    <>
      <PageHeader
        title="Research updates"
        description="Turn selected experiments into a structured update you can edit and export to PowerPoint."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Generate an update"
            description={project ? `From experiments in ${project.name}` : undefined}
          />
          {projects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="Create a project and record an experiment first."
            />
          ) : (
            <>
              {/* Plain GET form: switching project works without client JS. */}
              <form className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
                <label className="text-sm">
                  <span className="mb-1.5 block font-medium">Project</span>
                  <select
                    name="project"
                    defaultValue={projectId}
                    className="h-9 rounded-lg border border-line bg-surface px-3 text-sm"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="h-9 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-raised"
                >
                  Switch
                </button>
              </form>
              {experiments.length === 0 ? (
                <EmptyState title="This project has no experiments yet" />
              ) : (
                <GenerateUpdateForm projectId={projectId!} experiments={experiments} />
              )}
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Saved updates" description={pluralise(updates.length, 'update')} />
          {updates.length === 0 ? (
            <EmptyState title="No updates yet" description="Generated drafts appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {updates.map((u) => (
                <li key={u.id}>
                  <Link href={`/updates/${u.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-raised">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{u.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {u.projectName} · {pluralise(u.experimentIds.length, 'experiment')} ·{' '}
                        {formatDate(u.updatedAt)}
                      </span>
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
