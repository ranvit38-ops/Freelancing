import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth';
import { NotFoundInWorkspaceError } from '@/server/authz';
import { blockedReason } from '@/server/paywall';
import * as q from '@/server/queries';
import { UploadRejected, storeExperimentFile } from '@/server/uploads';

export const runtime = 'nodejs';

/** Attaches an upload to an experiment, parsing it as a dataset when we can. */
export async function POST(
  request: Request,
  { params }: { params: { experimentId: string } },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const blocked = await blockedReason(session, 'upload');
  if (blocked) return NextResponse.json({ error: blocked }, { status: 402 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  }

  try {
    // Confirms the experiment belongs to the caller's workspace before writing.
    await q.getExperiment(session, params.experimentId);
    const stored = await storeExperimentFile(session, params.experimentId, file);

    revalidatePath(`/experiments/${params.experimentId}`);
    return NextResponse.json(stored);
  } catch (error) {
    if (error instanceof UploadRejected) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof NotFoundInWorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
