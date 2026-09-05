import Link from 'next/link';
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { formatDate, pluralise, projectStatusLabel } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { listProjects } from '@/server/queries';

export const metadata = { title: 'Projects' };
export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const session = await requireSession();
  const projects = await listProjects(session);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project holds a research question and the experiments run against it."
        actions={<ButtonLink href="/projects/new">New project</ButtonLink>}
      />
      {projects.length === 0 ? (
        <Card>
          <EmptyState
            title="No projects yet"
            description="A project is a research question plus the experiments you run against it."
            action={<ButtonLink href="/projects/new" size="sm">Create your first project</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="group">
              <Card className="h-full p-5 transition-colors group-hover:border-accent/40">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium tracking-tight">{p.name}</h2>
                  <Badge tone={p.status === 'active' ? 'accent' : 'neutral'}>
                    {projectStatusLabel[p.status]}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted">
                  {p.researchQuestion ?? p.description ?? 'No research question recorded yet.'}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                  <span>{pluralise(p.experimentCount, 'experiment')}</span>
                  <span aria-hidden>·</span>
                  <span>Updated {formatDate(p.updatedAt)}</span>
                </div>
                {p.tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
