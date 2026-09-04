import { notFound } from 'next/navigation';
import { ProjectAssistantPanel } from '@/components/ai-panels';
import { ProjectTabs } from '@/components/project-tabs';
import { PageHeader } from '@/components/ui';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getProject } from '@/server/queries';

export const metadata = { title: 'LabBot' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage({ params }: { params: { projectId: string } }) {
  const session = await requireSession();
  try {
    const project = await getProject(session, params.projectId);
    return (
      <>
        <PageHeader
          eyebrow={project.name}
          title="LabBot"
          description="Ask about this project. LabBot answers from your records and, when you ask it to, published work on PubMed — and names every source."
        />
        <ProjectTabs projectId={project.id} />
        <div className="max-w-3xl">
          <ProjectAssistantPanel projectId={project.id} />
        </div>
      </>
    );
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
}
