import { workspacePlan } from '@/server/paywall';
import { UpgradePanel } from '@/components/upgrade-panel';
import { notFound } from 'next/navigation';
import { Discussion } from '@/components/discussion';
import { ProjectTabs } from '@/components/project-tabs';
import { PageHeader } from '@/components/ui';
import { requireSession } from '@/server/authz';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { getProject, listDiscussion } from '@/server/queries';

export const metadata = { title: 'Discussion' };
export const dynamic = 'force-dynamic';

export default async function DiscussionPage({ params }: { params: { projectId: string } }) {
  const session = await requireSession();
  const { limits } = await workspacePlan(session);
  if (!limits.discussion) {
    return (
      <>
        <PageHeader title="Project discussion" back={{ href: '/projects', label: 'Projects' }} />
        <UpgradePanel
          title="Project discussion"
          what="A thread attached to the project and to individual runs, so a decision is recorded next to the experiment it changed."
          why="It keeps the reasoning out of chat apps, where it is lost the moment someone leaves the lab."
        />
      </>
    );
  }
  let project;
  try {
    project = await getProject(session, params.projectId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
  const messages = await listDiscussion(session, { projectId: project.id });

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Discussion"
        description="Project-wide conversation. For a specific run, use the discussion on that experiment."
      />
      <ProjectTabs projectId={project.id} />
      <div className="max-w-3xl">
        <Discussion
          messages={messages}
          projectId={project.id}
          currentUserId={session.userId}
          returnTo={`/projects/${project.id}/discussion`}
        />
      </div>
    </>
  );
}
