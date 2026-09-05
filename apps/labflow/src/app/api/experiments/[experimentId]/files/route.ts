import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth';
import { NotFoundInWorkspaceError } from '@/server/authz';
import { blockedReason } from '@/server/paywall';
import * as q from '@/server/queries';
import { MAX_UPLOAD_BYTES, extensionOf, isAllowedUpload, putFile } from '@/server/storage';
import { UnsupportedFormatError, parseDelimitedText, parseSpreadsheet } from '@/lib/dataset';
import { XlsxError } from '@/lib/xlsx';

export const runtime = 'nodejs';

/** Attaches an upload to an experiment, parsing it as a dataset when we can. */
export async function POST(
  request: Request,
  { params }: { params: { experimentId: string } },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const blocked = await blockedReason(session);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 402 });

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

    const tabular = extension === 'csv' || extension === 'tsv';
    const spreadsheet = extension === 'xlsx';

    if (tabular || spreadsheet) {
      try {
        const table = tabular
          ? parseDelimitedText(bytes.toString('utf8'))
          : await parseSpreadsheet(bytes);
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
        // A file we cannot read is still stored and attached; we just say why
        // no dataset was made rather than failing the whole upload.
        if (error instanceof UnsupportedFormatError || error instanceof XlsxError) {
          notice = error.message;
        } else {
          throw error;
        }
      }
    } else if (extension === 'xls') {
      // The pre-2007 binary format is a different container entirely.
      notice =
        'Legacy .xls workbooks are stored but not parsed. Re-save as .xlsx or CSV to chart the columns.';
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
