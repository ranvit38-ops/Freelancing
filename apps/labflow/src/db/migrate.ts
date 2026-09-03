/**
 * Applies every SQL file in ./migrations in name order. Each file is
 * idempotent, so re-running is safe; a real deployment would also record
 * applied filenames, which is the next thing to add here.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from './index';

async function main() {
  const dir = join(process.cwd(), 'src/db/migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    process.stdout.write(`applying ${file} … `);
    await pool.query(readFileSync(join(dir, file), 'utf8'));
    process.stdout.write('ok\n');
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
