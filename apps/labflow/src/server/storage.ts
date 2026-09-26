import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { fileStorage } from '@/lib/pilot';
import { pool } from '@/db';

/**
 * File storage behind a narrow interface.
 *
 * Two places the bytes can live, chosen by fileStorage(): the local disk, or
 * the database for a host whose disk does not survive a restart. Nothing above
 * this file knows which.
 */

/** The lab's upload would push the database past what it can hold. */
export class StorageFullError extends Error {
  constructor(limitMb: number) {
    super(
      `This server's file storage is full (${limitMb} MB). Delete files you no longer need, or ask whoever runs Labvia to add storage.`,
    );
    this.name = 'StorageFullError';
  }
}

/** The record exists but its bytes do not, typically lost with an old disk. */
export class FileGoneError extends Error {
  constructor() {
    super('This file is no longer stored on the server. Whoever uploaded it will need to upload it again.');
    this.name = 'FileGoneError';
  }
}

function root() {
  return resolve(process.cwd(), env().UPLOAD_DIR);
}

/**
 * How much the database may hold in files. Neon's free plan is 512 MB for
 * everything, and a database that fills up stops accepting writes of any
 * kind, so files stop well short of it and records keep working.
 */
export function databaseStorageLimitMb(): number {
  const set = Number(process.env.LABFLOW_DB_STORAGE_MB);
  return Number.isFinite(set) && set > 0 ? set : 300;
}

/** Bytes held in the database, and the ceiling, for showing how full it is. */
export async function databaseStorageUse(): Promise<{ usedBytes: number; limitBytes: number }> {
  const { rows } = await pool.query<{ used: string }>('select coalesce(sum(byte_size), 0) as used from file_blobs');
  return { usedBytes: Number(rows[0]?.used ?? 0), limitBytes: databaseStorageLimitMb() * 1024 * 1024 };
}

/** Keys are namespaced per workspace and never derived from user input. */
export async function putFile(
  workspaceId: string,
  originalName: string,
  data: Buffer,
): Promise<string> {
  const extension = originalName.includes('.') ? originalName.split('.').pop()!.slice(0, 12) : 'bin';
  const key = `${workspaceId}/${randomUUID()}.${extension.replace(/[^a-zA-Z0-9]/g, '')}`;

  if (fileStorage() === 'database') {
    const { usedBytes, limitBytes } = await databaseStorageUse();
    if (usedBytes + data.byteLength > limitBytes) throw new StorageFullError(databaseStorageLimitMb());
    await pool.query('insert into file_blobs (storage_key, byte_size, data) values ($1, $2, $3)', [
      key,
      data.byteLength,
      data,
    ]);
    return key;
  }

  const path = join(root(), key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  return key;
}

function diskPath(storageKey: string): string {
  const path = resolve(root(), storageKey);
  // Refuse anything that escapes the upload root, whatever the key claims.
  if (!path.startsWith(root())) throw new Error('Invalid storage key');
  return path;
}

/**
 * Reads a file wherever it is. The database is checked first when it is in
 * use, then the disk, so switching a deployment over does not strand what it
 * already had.
 */
export async function getFile(storageKey: string): Promise<Buffer> {
  const path = diskPath(storageKey);
  if (fileStorage() === 'database') {
    const { rows } = await pool.query<{ data: Buffer }>('select data from file_blobs where storage_key = $1', [
      storageKey,
    ]);
    if (rows[0]) return rows[0].data;
  }
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new FileGoneError();
    throw error;
  }
}

/**
 * Deletes the bytes behind a stored file.
 *
 * A key that has already gone is not an error: the record is what matters, and
 * failing here would leave a deleted row with its file still stored.
 */
export async function removeFile(storageKey: string): Promise<void> {
  const path = diskPath(storageKey);
  await pool.query('delete from file_blobs where storage_key = $1', [storageKey]);
  try {
    await unlink(path);
  } catch {
    // Already gone, or never written. Nothing to do.
  }
}

/** Uploads above this are rejected rather than silently truncated. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Video gets a larger cap. A two minute microscope clip is routinely 100 MB,
 * and refusing it would push people back to sending files over chat, which is
 * the habit this product exists to replace.
 */
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv']);

export function isVideo(filename: string): boolean {
  return VIDEO_EXTENSIONS.has(extensionOf(filename));
}

/**
 * The cap that applies to one file, which depends on what kind it is. Kept in
 * the database, every file is held in memory on the way in and out, and a
 * 250 MB video would take a small server down with it, so video gets the
 * ordinary cap there.
 */
export function maxBytesFor(filename: string): number {
  return isVideo(filename) && fileStorage() === 'disk' ? MAX_VIDEO_BYTES : MAX_UPLOAD_BYTES;
}

const ALLOWED_EXTENSIONS = new Set([
  'csv', 'tsv', 'xlsx', 'xls', 'pdf', 'docx', 'pptx', 'txt', 'md',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'tif', 'tiff', 'json',
  'mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv',
]);

export function extensionOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export function isAllowedUpload(filename: string): boolean {
  return ALLOWED_EXTENSIONS.has(extensionOf(filename));
}
