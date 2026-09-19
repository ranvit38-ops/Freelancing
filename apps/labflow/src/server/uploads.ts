import { UnsupportedFormatError, parseDelimitedText, parseSpreadsheet } from '@/lib/dataset';
import { XlsxError } from '@/lib/xlsx';
import type { SessionContext } from './auth';
import * as q from './queries';
import { extensionOf, isAllowedUpload, maxBytesFor, putFile } from './storage';

/**
 * Storing one upload against an experiment, and reading it as a dataset when
 * the format allows.
 *
 * Extracted because two callers need identical behaviour: the upload route on
 * an experiment that already exists, and creating an experiment from dropped
 * files. Two copies would drift, and the way they would drift is that one of
 * them silently stops making datasets.
 */

export class UploadRejected extends Error {
  constructor(
    message: string,
    /** HTTP status for the route caller; the action shows the message. */
    readonly status: number,
  ) {
    super(message);
    this.name = 'UploadRejected';
  }
}

export type StoredUpload = { fileId: string; datasetId: string | null; notice: string | null };

/** Throws UploadRejected for anything the caller should be told about. */
export function checkUpload(file: File): void {
  const cap = maxBytesFor(file.name);
  if (file.size > cap) {
    throw new UploadRejected(
      `${file.name} is too large. The limit for this kind of file is ${cap / (1024 * 1024)} MB.`,
      413,
    );
  }
  if (!isAllowedUpload(file.name)) {
    throw new UploadRejected(`${file.name} is not a supported file type.`, 415);
  }
}

export async function storeExperimentFile(
  session: SessionContext,
  experimentId: string,
  file: File,
): Promise<StoredUpload> {
  checkUpload(file);

  const bytes = Buffer.from(await file.arrayBuffer());
  const storageKey = await putFile(session.workspaceId, file.name, bytes);
  const fileId = await q.recordFile(session, {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    byteSize: bytes.byteLength,
    storageKey,
  });
  await q.attachFileToExperiment(session, experimentId, fileId);

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
      datasetId = await q.createDataset(session, experimentId, {
        name: file.name,
        fileId,
        rows: table.rows,
        columns: table.columns,
      });
      if (table.truncated) {
        notice = 'Only the first 5,000 rows are previewed. The full file is stored.';
      }
    } catch (error) {
      // A file we cannot read is still stored and attached; we just say why no
      // dataset was made rather than failing the whole upload.
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

  return { fileId, datasetId, notice };
}
