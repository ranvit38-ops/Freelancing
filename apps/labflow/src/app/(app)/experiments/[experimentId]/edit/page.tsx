import { notFound } from 'next/navigation';
import { ExperimentForm } from '@/components/experiment-form';
import { PageHeader } from '@/components/ui';
import { experimentCode, toDateInput } from '@/lib/display';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getExperimentRecord, listExperiments, listProtocolVersionOptions } from '@/server/queries';

export const metadata = { title: 'Edit experiment' };
export const dynamic = 'force-dynamic';

export default async function EditExperimentPage({
  params,
}: {
  params: { experimentId: string };
}) {
  const session = await requireSession();
  try {
    const record = await getExperimentRecord(session, params.experimentId);
    const { experiment, conditions, samples, result } = record;
    const [protocolVersions, siblings] = await Promise.all([
      listProtocolVersionOptions(session),
      listExperiments(session, { projectId: experiment.projectId }),
    ]);

    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow={`${experiment.projectName} · ${experimentCode(experiment.number)}`}
          title="Edit experiment"
        />
        <ExperimentForm
          mode="edit"
          experimentId={experiment.id}
          projectId={experiment.projectId}
          projectName={experiment.projectName}
          protocolVersions={protocolVersions}
          siblingExperiments={siblings.map((e) => ({ id: e.id, number: e.number, title: e.title }))}
          initial={{
            title: experiment.title,
            performedOn: toDateInput(experiment.performedOn),
            status: experiment.status,
            objective: experiment.objective ?? '',
            hypothesis: experiment.hypothesis ?? '',
            protocolVersionId: experiment.protocolVersionId ?? '',
            protocolNotes: experiment.protocolNotes ?? '',
            repeatsExperimentId: experiment.repeatsExperimentId ?? '',
            conditions: conditions.map((c) => ({
              name: c.name,
              value: c.value,
              unit: c.unit ?? '',
            })),
            sampleCodes: samples.map((s) => s.code).join(', '),
            summary: result?.summary ?? '',
            observations: result?.observations ?? '',
            conclusion: result?.conclusion ?? '',
            nextSteps: result?.nextSteps ?? '',
          }}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
}
