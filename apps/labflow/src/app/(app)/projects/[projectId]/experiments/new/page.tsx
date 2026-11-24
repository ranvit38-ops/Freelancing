import { notFound } from 'next/navigation';
import { labAiReady } from '@/server/ai/access';
import { NewExperiment } from '@/components/new-experiment';
import { PageHeader } from '@/components/ui';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import {
  getProject,
  listExperiments,
  listProtocolVersionOptions,
  nextExperimentNumber,
} from '@/server/queries';

export const metadata = { title: 'New experiment' };
export const dynamic = 'force-dynamic';

export default async function NewExperimentPage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const session = await requireSession();
  try {
    const project = await getProject(session, params.projectId);
    const [protocolVersions, siblings, number] = await Promise.all([
      listProtocolVersionOptions(session),
      listExperiments(session, { projectId: project.id }),
      nextExperimentNumber(session, project.id),
    ]);

    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow={project.name}
          title="New experiment"
          description="Say what you did in your own words, or drop your files, and Labquill fills in the form for you to check. Everything except the name is optional either way."
        />
        <NewExperiment
          projectId={project.id}
          projectName={project.name}
          nextNumber={number}
          protocolVersions={protocolVersions}
          aiConfigured={await labAiReady(session)}
          siblingExperiments={siblings.map((e) => ({ id: e.id, number: e.number, title: e.title }))}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
}
