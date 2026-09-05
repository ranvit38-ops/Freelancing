import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectTabs } from '@/components/project-tabs';
import { Card, CardHeader, PageHeader, Prose } from '@/components/ui';
import { buildResearchMemory } from '@/lib/memory';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getProject, memoryInputs } from '@/server/queries';

export const metadata = { title: 'Research memory' };
export const dynamic = 'force-dynamic';

export default async function MemoryPage({ params }: { params: { projectId: string } }) {
  const session = await requireSession();
  let project;
  try {
    project = await getProject(session, params.projectId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }

  const inputs = await memoryInputs(session, project.id);
  const sections = buildResearchMemory(inputs.experiments, inputs.protocolChanges);

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Research memory"
        description="Assembled from the structured record. Every line is something a researcher wrote, linked back to where they wrote it."
      />
      <ProjectTabs projectId={project.id} />

      <div className="max-w-3xl space-y-5">
        <Card className="p-5">
          <h2 className="text-sm font-semibold tracking-tight">Research question</h2>
          <div className="mt-2">
            <Prose text={project.researchQuestion} />
          </div>
        </Card>

        {sections.map((section) => (
          <Card key={section.key}>
            <CardHeader title={section.title} description={section.description} />
            {section.entries.length === 0 ? (
              <p className="px-5 py-4 text-sm text-subtle">{section.emptyHint}</p>
            ) : (
              <ul className="divide-y divide-line">
                {section.entries.map((item, i) => (
                  <li key={i} className="px-5 py-3">
                    <p className="text-sm leading-6">{item.text}</p>
                    {item.sourceId ? (
                      <Link
                        href={`/experiments/${item.sourceId}`}
                        className="mt-1 inline-block text-xs text-muted underline underline-offset-2 hover:text-fg"
                      >
                        {item.sourceLabel}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
