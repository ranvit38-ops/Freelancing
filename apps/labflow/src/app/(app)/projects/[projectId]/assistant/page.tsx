import { notFound } from 'next/navigation';
import { ProjectAssistantPanel } from '@/components/ai-panels';
import { ProjectTabs } from '@/components/project-tabs';
import { PageHeader } from '@/components/ui';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getProject } from '@/server/queries';

export const metadata = { title: 'AI assistant' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage({ params }: { params: { projectId: string } }) {
  const session = await requireSession();
  try {
    const project = await getProject(session, params.projectId);
    return (
      <>
        <PageHeader
          eyebrow={project.name}
          title="AI assistant"
          description="Ask about this project. Every answer names the experiment records it came from."
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
