import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * File storage behind a narrow interface.
 *
 * Local disk today. Swapping in S3 or Supabase Storage later means
 * implementing these two functions — nothing above this file changes.
 */

function root() {
  return resolve(process.cwd(), env().UPLOAD_DIR);
}

/** Keys are namespaced per workspace and never derived from user input. */
export async function putFile(
  workspaceId: string,
  originalName: string,
  data: Buffer,
): Promise<string> {
  const extension = originalName.includes('.') ? originalName.split('.').pop()!.slice(0, 12) : 'bin';
  const key = `${workspaceId}/${randomUUID()}.${extension.replace(/[^a-zA-Z0-9]/g, '')}`;
  const path = join(root(), key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  return key;
}

export async function getFile(storageKey: string): Promise<Buffer> {
  const path = resolve(root(), storageKey);
  // Refuse anything that escapes the upload root, whatever the key claims.
  if (!path.startsWith(root())) throw new Error('Invalid storage key');
  return readFile(path);
}

/** Uploads above this are rejected rather than silently truncated. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  'csv', 'tsv', 'xlsx', 'xls', 'pdf', 'docx', 'pptx', 'txt', 'md',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'tif', 'tiff', 'json',
]);

export function extensionOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export function isAllowedUpload(filename: string): boolean {
  return ALLOWED_EXTENSIONS.has(extensionOf(filename));
}
