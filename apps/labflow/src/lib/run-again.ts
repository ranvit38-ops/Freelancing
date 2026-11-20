import type { ExperimentFormProps } from '@/components/experiment-form';

type Initial = NonNullable<ExperimentFormProps['initial']>;

export type RunAgainSource = {
  id: string;
  title: string;
  objective: string | null;
  hypothesis: string | null;
  protocolVersionId: string | null;
  conditions: { name: string; value: string; unit: string | null }[];
  samples: { code: string }[];
};

/**
 * A new run that starts as a copy of an earlier one.
 *
 * Most lab work is the same experiment again with one thing changed, and
 * retyping the protocol, conditions and samples is where records get thin.
 * What carries over is the plan: what was being tested and how. What belongs
 * to this run alone starts empty: the deviations, data location and results
 * are this run's to write, and the date is left for the browser to fill with
 * its own today, which the server cannot know.
 */
export function runAgainInitial(source: RunAgainSource): Initial {
  return {
    title: source.title,
    performedOn: '',
    status: 'in_progress',
    objective: source.objective ?? '',
    hypothesis: source.hypothesis ?? '',
    dataLocation: '',
    protocolVersionId: source.protocolVersionId ?? '',
    protocolNotes: '',
    repeatsExperimentId: source.id,
    conditions: source.conditions.map((c) => ({ name: c.name, value: c.value, unit: c.unit ?? '' })),
    sampleCodes: source.samples.map((s) => s.code).join(', '),
    summary: '',
    observations: '',
    conclusion: '',
    nextSteps: '',
  };
}
