import type { SessionContext } from './auth';
import * as q from './queries';
import { getFile, putFile, removeFile } from './storage';

/**
 * Documents written inside Labquill: notes, protocols, plans, meeting minutes,
 * and anything LabBot drafts. Each is an ordinary file holding markdown, so it
 * is shared, searched, read by LabBot and listed exactly like an upload.
 */

/** Plenty for a protocol or a thesis chapter; stops a paste of a whole book. */
export const MAX_DOCUMENT_CHARS = 200_000;

export function documentFilename(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${clean || 'Untitled document'}.md`;
}

export function documentTitle(filename: string): string {
  return filename.replace(/\.md$/i, '');
}

export async function createDocument(
  s: SessionContext,
  input: { title: string; body: string; private: boolean },
): Promise<string> {
  const filename = documentFilename(input.title);
  const bytes = Buffer.from(input.body.slice(0, MAX_DOCUMENT_CHARS), 'utf8');
  const storageKey = await putFile(s.workspaceId, filename, bytes, { written: true });
  return q.recordFile(s, {
    filename,
    contentType: 'text/markdown; charset=utf-8',
    byteSize: bytes.byteLength,
    storageKey,
    private: input.private,
    isDocument: true,
  });
}

export async function readDocument(s: SessionContext, fileId: string) {
  const doc = await q.getDocument(s, fileId);
  let body = '';
  if (doc.storageKey) {
    try {
      body = (await getFile(doc.storageKey)).toString('utf8');
    } catch {
      body = '';
    }
  }
  return { ...doc, title: documentTitle(doc.filename), body };
}

/**
 * Saves a new version. The new bytes are written first and the record moved
 * to them second, so a failure part-way leaves the old version intact; the
 * old bytes are removed only once nothing points at them.
 */
export async function saveDocument(
  s: SessionContext,
  fileId: string,
  input: { title: string; body: string; baseUpdatedAt: string | null },
): Promise<{ updatedAt: string; title: string }> {
  const filename = documentFilename(input.title);
  const bytes = Buffer.from(input.body.slice(0, MAX_DOCUMENT_CHARS), 'utf8');
  const storageKey = await putFile(s.workspaceId, filename, bytes, { written: true });
  try {
    const { replacedKey, updatedAt } = await q.saveDocumentVersion(s, fileId, {
      filename,
      storageKey,
      byteSize: bytes.byteLength,
      baseUpdatedAt: input.baseUpdatedAt,
    });
    if (replacedKey) await removeFile(replacedKey).catch(() => {});
    return { updatedAt: updatedAt.toISOString(), title: documentTitle(filename) };
  } catch (error) {
    await removeFile(storageKey).catch(() => {});
    throw error;
  }
}
