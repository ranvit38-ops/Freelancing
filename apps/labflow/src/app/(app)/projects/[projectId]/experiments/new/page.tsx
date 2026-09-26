import { notFound } from 'next/navigation';
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
          description="Drop the files you already have and Labvia fills in what it can read. Everything except the name is optional either way."
        />
        <NewExperiment
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
