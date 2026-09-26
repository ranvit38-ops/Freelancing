'use client';

import { useState } from 'react';
import { ExperimentDropzone } from './experiment-dropzone';
import { ExperimentForm, type ExperimentFormProps } from './experiment-form';
import type { ExperimentDraft } from '@/lib/experiment-draft';

/**
 * The create screen: a dropzone above the form it fills in.
 *
 * The form's fields are uncontrolled, which is right for a form this size and
 * means a draft cannot be pushed into them field by field. Remounting it under
 * a new key is how the new values land, and it is also the honest behaviour:
 * dropping a second set of files replaces the draft rather than merging two
 * readings of different data into one confusing half-state.
 *
 * Anything typed before dropping files is therefore lost, so the dropzone
 * sits above the form where it is seen first, and the form is where people
 * stop and stay.
 */
export function NewExperiment({
  initialDraft,
  storedFile,
  ...props
}: Omit<ExperimentFormProps, 'mode' | 'initial'> & {
  /** Read on the server from a file already in the lab's Files. */
  initialDraft?: ExperimentDraft;
  /** That file, attached when the experiment is saved rather than re-uploaded. */
  storedFile?: { id: string; name: string };
}) {
  const [initial, setInitial] = useState<ExperimentFormProps['initial']>(
    initialDraft ? toInitial(initialDraft) : undefined,
  );
  const [files, setFiles] = useState<File[]>([]);
  const [version, setVersion] = useState(0);

  function apply(draft: ExperimentDraft) {
    setInitial(toInitial(draft));
    setVersion((n) => n + 1);
  }

  return (
    <div className="space-y-5">
      {storedFile ? (
        <p className="rounded-lg border border-ok/25 bg-ok/5 px-4 py-3 text-sm text-ok">
          Filled in from <span className="font-medium">{storedFile.name}</span>. Check it over, change
          anything, and save. The file will be attached to the experiment.
        </p>
      ) : (
        <ExperimentDropzone onDraft={apply} files={files} onFiles={setFiles} />
      )}
      <ExperimentForm
        key={version}
        mode="create"
        initial={initial}
        pendingFiles={files}
        storedFileId={storedFile?.id}
        {...props}
      />
    </div>
  );
}

function toInitial(draft: ExperimentDraft): NonNullable<ExperimentFormProps['initial']> {
  return {
    title: draft.title ?? '',
    // A file with no date in its name means today, which is the common case
    // for a run being written up the afternoon it happened.
    performedOn: draft.performedOn ?? new Date().toISOString().slice(0, 10),
    status: 'completed',
    objective: '',
    hypothesis: '',
    protocolVersionId: '',
    protocolNotes: '',
    repeatsExperimentId: '',
    conditions:
      draft.conditions.length > 0
        ? draft.conditions.map((c) => ({ name: c.name, value: c.value, unit: c.unit ?? '' }))
        : [{ name: '', value: '', unit: '' }],
    sampleCodes: draft.sampleCodes.join(', '),
    summary: '',
    observations: draft.observations ?? '',
    conclusion: '',
    nextSteps: '',
  };
}
