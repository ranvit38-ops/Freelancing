import { DRIVE_FILE_ID, driveExport, importedName, isUnimportable } from '@/lib/drive';
import type { SessionContext } from './auth';
import * as q from './queries';
import { shareFile, type Audience } from './sharing';
import { StorageFullError, isAllowedUpload, maxBytesFor, putFile } from './storage';

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
      results.push({ name, error: 'Google Drive could not be reached.' });
      continue;
    }
    if (!response.ok) {
      results.push({
        name,
        error:
          response.status === 401
            ? 'Google asked you to sign in again. Pick the file again.'
            : response.status === 403 || response.status === 404
              ? 'Google Drive did not let LabLedger read this file.'
              : `Google Drive refused (${response.status}).`,
      });
      continue;
    }
    const cap = maxBytesFor(name);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > cap) {
      results.push({ name, error: `Too large. The limit for this kind of file is ${cap / (1024 * 1024)} MB.` });
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > cap) {
      results.push({ name, error: `Too large. The limit for this kind of file is ${cap / (1024 * 1024)} MB.` });
      continue;
    }
    try {
      const storageKey = await putFile(s.workspaceId, name, bytes);
      const fileId = await q.recordFile(s, {
        filename: name,
        contentType: exported?.mime ?? (file.mimeType || 'application/octet-stream'),
        byteSize: bytes.byteLength,
        storageKey,
        private: audience.kind !== 'everyone',
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
