import { DRIVE_FILE_ID, SHEET_MIME, driveExport, importedName, isUnimportable } from '@/lib/drive';
import type { SessionContext } from './auth';
import * as q from './queries';
import { shareFile, type Audience } from './sharing';
import { StorageFullError, isAllowedUpload, maxBytesFor, putFile, removeFile } from './storage';
import { UploadRejected, readTable, storeExperimentBytes, type StoredUpload } from './uploads';

/**
 * Copies files a person picked in Google Drive into the lab.
 *
 * A copy, not a link: LabBot, search and the reading path can only use what
 * is actually here, and a link to a private Drive file is a dead end for
 * everyone but its owner. The access token comes from the person's own
 * browser, is used for these downloads only, and is never stored.
 */

export function driveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_API_KEY);
}

function apiBase(): string {
  return (process.env.GOOGLE_API_BASE || 'https://www.googleapis.com').replace(/\/$/, '');
}

export type PickedFile = { id: string; name: string; mimeType: string };
export type ImportResult = { name: string; fileId?: string; error?: string };

/** One file's bytes from Drive, exported to its Office form if it is Google's own. */
async function download(
  accessToken: string,
  file: PickedFile,
  name: string,
  fetchImpl: typeof fetch,
): Promise<{ bytes: Buffer; mime: string } | { error: string }> {
  const exported = driveExport(file.mimeType);
  const url = exported
    ? `${apiBase()}/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exported.mime)}`
    : `${apiBase()}/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { error: 'Google Drive could not be reached.' };
  }
  if (!response.ok) {
    return {
      error:
        response.status === 401
          ? 'Google asked you to sign in again. Pick the file again.'
          : response.status === 403 || response.status === 404
            ? 'Google Drive did not let Labquill read this file.'
            : `Google Drive refused (${response.status}).`,
    };
  }
  const cap = maxBytesFor(name);
  const tooLarge = { error: `Too large. The limit for this kind of file is ${cap / (1024 * 1024)} MB.` };
  if (Number(response.headers.get('content-length') ?? 0) > cap) return tooLarge;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > cap) return tooLarge;
  return { bytes, mime: exported?.mime ?? (file.mimeType || 'application/octet-stream') };
}

export async function importDriveFiles(
  s: SessionContext,
  accessToken: string,
  picked: PickedFile[],
  audience: Audience,
  fetchImpl: typeof fetch = fetch,
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  for (const file of picked.slice(0, 20)) {
    const name = importedName(file.name, file.mimeType);
    if (!DRIVE_FILE_ID.test(file.id)) {
      results.push({ name, error: 'Not a Google Drive file.' });
      continue;
    }
    if (isUnimportable(file.mimeType)) {
      results.push({ name, error: 'Folders, forms and sites cannot be imported. Pick the files inside instead.' });
      continue;
    }
    if (!isAllowedUpload(name)) {
      results.push({ name, error: 'This kind of file is not supported.' });
      continue;
    }
    const got = await download(accessToken, file, name, fetchImpl);
    if ('error' in got) {
      results.push({ name, error: got.error });
      continue;
    }
    try {
      const storageKey = await putFile(s.workspaceId, name, got.bytes);
      const fileId = await q.recordFile(s, {
        filename: name,
        contentType: got.mime,
        byteSize: got.bytes.byteLength,
        storageKey,
        private: audience.kind !== 'everyone',
        // A Sheet remembers where it came from, so it can be refreshed later.
        driveFileId: file.mimeType === SHEET_MIME ? file.id : null,
      });
      // A lab-wide file is already visible to everyone; chosen people are told
      // in a direct message, exactly as with an upload.
      if (audience.kind !== 'everyone') await shareFile(s, { id: fileId, filename: name }, audience, { announce: true });
      results.push({ name, fileId });
    } catch (error) {
      if (error instanceof StorageFullError) {
        results.push({ name, error: error.message });
        break;
      }
      throw error;
    }
  }
  return results;
}

/**
 * A Google Sheet as a run's data: copied in as a workbook, attached to the
 * experiment and read into a dataset, exactly as if it had been dropped there,
 * and remembered so it can be refreshed when the Sheet changes.
 */
export async function linkSheet(
  s: SessionContext,
  experimentId: string,
  accessToken: string,
  sheet: PickedFile,
  fetchImpl: typeof fetch = fetch,
): Promise<StoredUpload> {
  if (!DRIVE_FILE_ID.test(sheet.id)) throw new UploadRejected('Not a Google Drive file.', 400);
  if (sheet.mimeType !== SHEET_MIME) throw new UploadRejected('Pick a Google Sheet. Other files go under Files.', 400);
  await q.getExperiment(s, experimentId);
  const name = importedName(sheet.name, sheet.mimeType);
  const got = await download(accessToken, sheet, name, fetchImpl);
  if ('error' in got) throw new UploadRejected(got.error, 502);
  return storeExperimentBytes(s, experimentId, { name, type: got.mime, bytes: got.bytes, driveFileId: sheet.id });
}

/**
 * Copies a linked Sheet again and updates every dataset read from it, in
 * place, so links to those datasets keep working. The old copy is removed
 * only once the new one is stored.
 */
export async function refreshSheet(
  s: SessionContext,
  fileId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ filename: string; datasets: number; notice: string | null }> {
  const linked = await q.getLinkedSheet(s, fileId);
  const got = await download(accessToken, { id: linked.driveFileId, name: linked.filename, mimeType: SHEET_MIME }, linked.filename, fetchImpl);
  if ('error' in got) {
    throw new UploadRejected(
      got.error === 'Google Drive did not let Labquill read this file.'
        ? 'Google Drive did not let Labquill read this Sheet for you. Google only lets Labquill read a Sheet for the people who linked it; ask them to refresh it, or link it yourself once.'
        : got.error,
      502,
    );
  }
  let storageKey: string;
  try {
    storageKey = await putFile(s.workspaceId, linked.filename, got.bytes);
  } catch (error) {
    if (error instanceof StorageFullError) throw new UploadRejected(error.message, 507);
    throw error;
  }
  const table = await readTable(linked.filename, got.bytes);
  const datasets = await q.replaceLinkedSheet(s, fileId, { storageKey, byteSize: got.bytes.byteLength, table });
  await removeFile(linked.storageKey);
  return {
    filename: linked.filename,
    datasets,
    notice: table ? null : 'The Sheet was copied again, but its first tab could not be read as a table.',
  };
}
