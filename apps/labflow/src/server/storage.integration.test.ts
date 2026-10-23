import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite('files kept in the database', () => {
  const saved = { f: process.env.LABFLOW_FILE_STORAGE, m: process.env.LABFLOW_DB_STORAGE_MB, d: process.env.UPLOAD_DIR };
  const workspace = randomUUID();
  let storage: typeof import('./storage');

  beforeAll(async () => {
    process.env.LABFLOW_FILE_STORAGE = 'database';
    process.env.UPLOAD_DIR = `.uploads-test-${workspace}`;
    storage = await import('./storage');
  });
  afterAll(async () => {
    await rm(resolve(process.cwd(), `.uploads-test-${workspace}`), { recursive: true, force: true });
    const { pool } = await import('@/db');
    await pool.query('delete from file_blobs where storage_key like $1', [`${workspace}/%`]);
    for (const [k, v] of [['LABFLOW_FILE_STORAGE', saved.f], ['LABFLOW_DB_STORAGE_MB', saved.m], ['UPLOAD_DIR', saved.d]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('stores, reads back byte for byte, and deletes', async () => {
    const bytes = Buffer.from([0, 1, 2, 255, 254, 10, 13, 0]);
    const key = await storage.putFile(workspace, 'gel.png', bytes);
    expect(key.startsWith(`${workspace}/`)).toBe(true);
    expect(Buffer.compare(await storage.getFile(key), bytes)).toBe(0);
    await storage.removeFile(key);
    await expect(storage.getFile(key)).rejects.toBeInstanceOf(storage.FileGoneError);
  });

  it('refuses an upload that would fill the database, rather than letting it stop all writes', async () => {
    const { usedBytes } = await storage.databaseStorageUse();
    process.env.LABFLOW_DB_STORAGE_MB = String((usedBytes + 1024) / (1024 * 1024));
    await expect(storage.putFile(workspace, 'big.pdf', Buffer.alloc(4096))).rejects.toBeInstanceOf(
      storage.StorageFullError,
    );
    delete process.env.LABFLOW_DB_STORAGE_MB;
  });

  it('still finds a file written to disk before the switch', async () => {
    process.env.LABFLOW_FILE_STORAGE = 'disk';
    const key = await storage.putFile(workspace, 'old.txt', Buffer.from('from before'));
    process.env.LABFLOW_FILE_STORAGE = 'database';
    expect((await storage.getFile(key)).toString()).toBe('from before');
  });

  it('caps video at the ordinary size, since the whole file sits in memory', () => {
    expect(storage.maxBytesFor('clip.mp4')).toBe(storage.MAX_UPLOAD_BYTES);
  });
});
