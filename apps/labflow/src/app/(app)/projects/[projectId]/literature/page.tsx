import { notFound } from 'next/navigation';
import { LiteratureSearch } from '@/components/literature';
import { ProjectTabs } from '@/components/project-tabs';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/display';
import { removeLiteratureAction } from '@/server/actions/collab';
import { requireSession } from '@/server/authz';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { getProject, listLiterature } from '@/server/queries';

export const metadata = { title: 'Literature' };
export const dynamic = 'force-dynamic';

export default async function LiteraturePage({ params }: { params: { projectId: string } }) {
  const session = await requireSession();
  let project;
  try {
    project = await getProject(session, params.projectId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
  const saved = await listLiterature(session, project.id);

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Literature"
        description="Papers from PubMed, kept with the project. The AI assistant cites only papers it was handed — never one it invented."
      />
      <ProjectTabs projectId={project.id} />

      <div className="grid gap-5 lg:grid-cols-2">
        <LiteratureSearch projectId={project.id} />

        <Card>
          <CardHeader title="Saved to this project" description={`${saved.length} papers`} />
          {saved.length === 0 ? (
            <EmptyState
              title="Nothing saved yet"
              description="Search on the left and save the papers this project builds on."
            />
          ) : (
            <ul className="divide-y divide-line">
              {saved.map((ref) => (
                <li key={ref.id} className="px-5 py-4">
                  <a
                    href={`https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm font-medium underline underline-offset-2"
                  >
                    {ref.title}
                  </a>
                  <p className="mt-1 text-xs text-muted">
                    {[ref.authors, ref.journal, ref.year].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge>PMID {ref.pmid}</Badge>
                    <span className="text-xs text-subtle">
                      {ref.addedByName ?? 'Unknown'} · {formatDate(ref.createdAt)}
                    </span>
                    <form action={removeLiteratureAction} className="ml-auto">
                      <input type="hidden" name="refId" value={ref.id} />
                      <input type="hidden" name="projectId" value={project.id} />
                      <Button type="submit" tone="ghost" size="sm" className="px-1 text-xs">
                        Remove
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
