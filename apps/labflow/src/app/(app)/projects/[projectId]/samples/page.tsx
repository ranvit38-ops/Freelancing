import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectTabs } from '@/components/project-tabs';
import { ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { pluralise } from '@/lib/display';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getProject, listSamples } from '@/server/queries';

export const metadata = { title: 'Project samples' };
export const dynamic = 'force-dynamic';

export default async function ProjectSamplesPage({ params }: { params: { projectId: string } }) {
  const session = await requireSession();
  try {
    const project = await getProject(session, params.projectId);
    const samples = await listSamples(session, { projectId: project.id });
    return (
      <>
        <PageHeader
          eyebrow={project.name}
          title="Samples"
          description="Samples recorded against this project."
          actions={<ButtonLink href="/samples/new" tone="secondary">New sample</ButtonLink>}
        />
        <ProjectTabs projectId={project.id} />
        <Card>
          {samples.length === 0 ? (
            <EmptyState
              title="No samples in this project"
              description="Typing new sample IDs into an experiment creates them here automatically."
            />
          ) : (
            <ul className="divide-y divide-line">
              {samples.map((s) => (
                <li key={s.id}>
                  <Link href={`/samples/${s.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-raised">
                    <span className="w-28 shrink-0 font-mono text-sm">{s.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                      {s.description ?? 'No description'}
                    </span>
                    <span className="shrink-0 text-xs text-subtle">
                      {pluralise(s.experimentCount, 'experiment')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>
    );
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
}
