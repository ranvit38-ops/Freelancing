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
  repeatOf,
  initial: startFrom,
  ...props
}: Omit<ExperimentFormProps, 'mode'> & {
  /** The run this one starts as a copy of, named so the copy is not a surprise. */
  repeatOf?: string;
  /** Read on the server from a file already in the lab's Files. */
  initialDraft?: ExperimentDraft;
  /** That file, attached when the experiment is saved rather than re-uploaded. */
  storedFile?: { id: string; name: string };
}) {
  const [initial, setInitial] = useState<ExperimentFormProps['initial']>(
    initialDraft ? toInitial(initialDraft) : startFrom,
  );
  const [files, setFiles] = useState<File[]>([]);
  const [version, setVersion] = useState(0);

  function apply(draft: ExperimentDraft) {
    setInitial(toInitial(draft));
    setVersion((n) => n + 1);
  }

  return (
    <div className="space-y-5">
      {repeatOf ? (
        <p className="rounded-lg border border-accent/25 bg-accent/5 px-4 py-3 text-sm">
          Starting from <span className="font-medium">{repeatOf}</span>: the purpose, protocol and
          conditions are copied. Change whatever is different this time. The date is
          today, and the data location and results start empty.
        </p>
      ) : null}
      {storedFile ? (
        <p className="rounded-lg border border-ok/25 bg-ok/5 px-4 py-3 text-sm text-ok">
          Filled in from <span className="font-medium">{storedFile.name}</span>. Check it over, change
          anything, and save. The file will be attached to the experiment.
        </p>
      ) : null}
      <ExperimentForm
        key={version}
        mode="create"
        initial={initial}
        pendingFiles={files}
        storedFileId={storedFile?.id}
        startFrom={storedFile ? null : <ExperimentDropzone onDraft={apply} files={files} onFiles={setFiles} />}
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
    performedOn: draft.performedOn ?? '',
    status: 'completed',
    objective: '',
    hypothesis: '',
    dataLocation: '',
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
