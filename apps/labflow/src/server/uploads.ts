import { UnsupportedFormatError, parseDelimitedText, parseSpreadsheet } from '@/lib/dataset';
import { XlsxError } from '@/lib/xlsx';
import type { SessionContext } from './auth';
import * as q from './queries';
import { buildDraft, type ExperimentDraft } from '@/lib/experiment-draft';
import { FileGoneError, StorageFullError, extensionOf, getFile, isAllowedUpload, maxBytesFor, putFile } from './storage';

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
  let storageKey: string;
  try {
    storageKey = await putFile(session.workspaceId, file.name, bytes);
  } catch (error) {
    if (error instanceof StorageFullError) throw new UploadRejected(error.message, 507);
    throw error;
  }
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

/** Reads a table out of stored bytes, or null for a format that is not a table. */
async function readTable(filename: string, bytes: Buffer) {
  const extension = extensionOf(filename);
  try {
    if (extension === 'csv' || extension === 'tsv') return parseDelimitedText(bytes.toString('utf8'));
    if (extension === 'xlsx') return await parseSpreadsheet(bytes);
  } catch (error) {
    if (error instanceof UnsupportedFormatError || error instanceof XlsxError) return null;
    throw error;
  }
  return null;
}

/** As readTable, for stored bytes that may have been lost: then there is simply no table. */
async function readStoredTable(filename: string, storageKey: string) {
  try {
    return await readTable(filename, await getFile(storageKey));
  } catch (error) {
    if (error instanceof FileGoneError) return null;
    throw error;
  }
}

/**
 * A filled-in experiment from a file already in the lab's Files.
 *
 * The same reading as dropping files on the form, for a file someone uploaded
 * earlier: the spreadsheet is already here, so nobody should have to download
 * it and drop it back in.
 */
export async function draftFromStoredFile(
  session: SessionContext,
  fileId: string,
): Promise<{ draft: ExperimentDraft; file: { id: string; name: string } }> {
  const file = await q.getFileForDownload(session, fileId);
  const table = file.storageKey ? await readStoredTable(file.filename, file.storageKey) : null;
  return {
    draft: buildDraft([{ filename: file.filename, table }]),
    file: { id: file.id, name: file.filename },
  };
}

/**
 * Attaches a file that is already stored to a new experiment, and makes a
 * dataset from it where it can. Nothing is uploaded twice.
 */
export async function attachStoredFile(
  session: SessionContext,
  experimentId: string,
  fileId: string,
): Promise<void> {
  const file = await q.getFileForDownload(session, fileId);
  await q.attachFileToExperiment(session, experimentId, file.id);
  if (!file.storageKey) return;
  const table = await readStoredTable(file.filename, file.storageKey);
  if (table) {
    await q.createDataset(session, experimentId, {
      name: file.filename,
      fileId: file.id,
      rows: table.rows,
      columns: table.columns,
    });
  }
}
