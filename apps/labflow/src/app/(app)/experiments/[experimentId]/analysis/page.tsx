import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExperimentAnalysisPanel } from '@/components/ai-panels';
import { CompletenessPanel } from '@/components/completeness-panel';
import { PageHeader } from '@/components/ui';
import { checkCompleteness } from '@/lib/completeness';
import { experimentCode } from '@/lib/display';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getExperimentRecord } from '@/server/queries';

export const metadata = { title: 'Analysis' };
export const dynamic = 'force-dynamic';

export default async function AnalysisPage({ params }: { params: { experimentId: string } }) {
  const session = await requireSession();
  let record;
  try {
    record = await getExperimentRecord(session, params.experimentId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }

  const { experiment, conditions, samples, result, notes, files, datasets } = record;
  const report = checkCompleteness({
    objective: experiment.objective,
    hypothesis: experiment.hypothesis,
    protocolName: experiment.protocolName,
    protocolVersion: experiment.protocolVersion,
    conditionCount: conditions.length,
    sampleCount: samples.length,
    datasetCount: datasets.length,
    fileCount: files.length,
    summary: result?.summary ?? null,
    observations: result?.observations ?? null,
    conclusion: result?.conclusion ?? null,
    nextSteps: result?.nextSteps ?? null,
    noteCount: notes.length,
  });

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/experiments/${experiment.id}`} className="hover:text-fg">
            {experimentCode(experiment.number)} · {experiment.title}
          </Link>
        }
        title="Check and analyse"
        description="A mechanical completeness check, and an AI reading of what the record says."
      />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <ExperimentAnalysisPanel experimentId={experiment.id} />
        <CompletenessPanel report={report} />
      </div>
    </>
  );
}
