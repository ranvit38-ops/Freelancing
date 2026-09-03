import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth';
import { NotFoundInWorkspaceError } from '@/server/authz';
import * as q from '@/server/queries';
import { MAX_UPLOAD_BYTES, extensionOf, isAllowedUpload, putFile } from '@/server/storage';
import { UnsupportedFormatError, parseDelimitedText } from '@/lib/dataset';

export const runtime = 'nodejs';

/** Attaches an upload to an experiment, parsing it as a dataset when we can. */
export async function POST(
  request: Request,
  { params }: { params: { experimentId: string } },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Files must be under ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` },
      { status: 413 },
    );
  }
  if (!isAllowedUpload(file.name)) {
    return NextResponse.json({ error: `${file.name} is not a supported file type.` }, { status: 415 });
  }

  try {
    // Confirms the experiment belongs to the caller's workspace before writing.
    await q.getExperiment(session, params.experimentId);

    const bytes = Buffer.from(await file.arrayBuffer());
    const storageKey = await putFile(session.workspaceId, file.name, bytes);
    const fileId = await q.recordFile(session, {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      byteSize: bytes.byteLength,
      storageKey,
    });
    await q.attachFileToExperiment(session, params.experimentId, fileId);

    let datasetId: string | null = null;
    let notice: string | null = null;
    const extension = extensionOf(file.name);

    if (extension === 'csv' || extension === 'tsv') {
      try {
        const table = parseDelimitedText(bytes.toString('utf8'));
        datasetId = await q.createDataset(session, params.experimentId, {
          name: file.name,
          fileId,
          rows: table.rows,
          columns: table.columns,
        });
        if (table.truncated) {
          notice = 'Only the first 5,000 rows are previewed. The full file is stored.';
        }
      } catch (error) {
        if (!(error instanceof UnsupportedFormatError)) throw error;
        notice = error.message;
      }
    } else if (extension === 'xlsx' || extension === 'xls') {
      // SETUP REQUIRED: spreadsheet parsing is not implemented. The file is
      // stored and attached, but no dataset is created — better than pretending.
      notice =
        'Excel files are stored and attached, but not yet parsed into a dataset. Export as CSV to chart the columns.';
    }

    revalidatePath(`/experiments/${params.experimentId}`);
    return NextResponse.json({ fileId, datasetId, notice });
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
