import { notFound } from 'next/navigation';
import { ExperimentForm } from '@/components/experiment-form';
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

export default async function NewExperimentPage({ params }: { params: { projectId: string } }) {
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
          description="Everything except the name is optional. Record what you have now and come back to the rest."
        />
        <ExperimentForm
          mode="create"
          projectId={project.id}
          projectName={project.name}
          nextNumber={number}
          protocolVersions={protocolVersions}
          siblingExperiments={siblings.map((e) => ({ id: e.id, number: e.number, title: e.title }))}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
}
