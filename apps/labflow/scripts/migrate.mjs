/**
 * Applies every SQL file in src/db/migrations in name order.
 *
 * Each file is written to be idempotent, so re-running is safe and the
 * container can apply migrations on every boot without a coordinator.
 *
 * Deliberately plain JavaScript with no TypeScript and no ORM: this has to run
 * inside the production image, where the only thing available is node and the
 * database driver. Pulling a TypeScript loader into that image to run twenty
 * lines of SQL would be the tail wagging the dog.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

// .env.local when running locally; a real environment supplies these directly.
try {
  // @next/env is CommonJS, so an ESM import lands it under `default`.
  const mod = await import('@next/env');
  const loadEnvConfig = mod.loadEnvConfig ?? mod.default?.loadEnvConfig;
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', {
    info: () => {},
    error: console.error,
  });
} catch (error) {
  // Absent from the production image, where the environment is already set.
  // Anything else is a real fault and saying nothing about it is how a missing
  // variable turns into a confusing "no database" a minute later.
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') {
    console.error(`Could not read .env.local: ${error?.message ?? error}`);
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set, so there is no database to migrate.');
  process.exit(1);
}

const dir = join(process.cwd(), 'src/db/migrations');
// No ssl option on purpose. node-postgres reads sslmode from the connection
// string itself and verifies the certificate chain and hostname properly, and
// the managed providers all present publicly trusted certificates. Passing
// rejectUnauthorized:false here, as this once did, turned a verified connection
// into an unverified one for no reason at all. The app's own pool does the same
// thing, so migrations and queries reach the database identically.
const pool = new pg.Pool({ connectionString: url });

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  process.stdout.write(`applying ${file} ... `);
  await pool.query(readFileSync(join(dir, file), 'utf8'));
  process.stdout.write('ok\n');
}

await pool.end();
