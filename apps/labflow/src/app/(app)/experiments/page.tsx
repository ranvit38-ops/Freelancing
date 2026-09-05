import { Card, EmptyState, PageHeader, ButtonLink } from '@/components/ui';
import { ExperimentList } from '@/components/records';
import { pluralise } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { listExperiments, listProjects } from '@/server/queries';

export const metadata = { title: 'Experiments' };
export const dynamic = 'force-dynamic';

export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams: { project?: string; status?: string };
}) {
  const session = await requireSession();
  const [projects, all] = await Promise.all([
    listProjects(session),
    listExperiments(session, { projectId: searchParams.project }),
  ]);
  const experiments = searchParams.status
    ? all.filter((e) => e.status === searchParams.status)
    : all;

  return (
    <>
      <PageHeader
        title="Experiments"
        description={`${pluralise(experiments.length, 'experiment')} across this workspace.`}
        actions={
          projects[0] ? (
            <ButtonLink href={`/projects/${projects[0].id}/experiments/new`}>
              New experiment
            </ButtonLink>
          ) : (
            <ButtonLink href="/projects/new">Create a project first</ButtonLink>
          )
        }
      />

      {/* A plain GET form: filtering works with or without client JS. */}
      <form className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1.5 block font-medium">Project</span>
          <select
            name="project"
            defaultValue={searchParams.project ?? ''}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block font-medium">Status</span>
          <select
            name="status"
            defaultValue={searchParams.status ?? ''}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm"
          >
            <option value="">Any status</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="repeated">Repeated</option>
            <option value="needs_investigation">Needs investigation</option>
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-raised"
        >
          Apply
        </button>
      </form>

      <Card>
        <ExperimentList
          experiments={experiments}
          showProject
          empty={
            <EmptyState
              title="No experiments match"
              description="Try clearing the filters, or record a new experiment."
            />
          }
        />
      </Card>
    </>
  );
}
