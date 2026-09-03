import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { env } from '@/lib/env';

declare global {
  // eslint-disable-next-line no-var
  var __labflowPool: Pool | undefined;
}

// Next dev reloads modules; reuse one pool so we don't exhaust connections.
const pool =
  globalThis.__labflowPool ??
  new Pool({ connectionString: env().DATABASE_URL, max: 10 });

if (process.env.NODE_ENV !== 'production') globalThis.__labflowPool = pool;

export const db = drizzle(pool, { schema });
export { pool, schema };
