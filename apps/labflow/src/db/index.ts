import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { env } from '@/lib/env';
import { isConnectFailure } from './connection-errors';

declare global {
  // eslint-disable-next-line no-var
  var __labflowPool: Pool | undefined;
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env().DATABASE_URL,
    max: 10,
    // Hosted Postgres (Neon, Supabase, Render) closes connections it thinks
    // are idle, and a free Neon database goes to sleep after five quiet
    // minutes. Letting ours go after ten seconds means the pool is never
    // holding a connection the server has already hung up on.
    idleTimeoutMillis: 10_000,
    // A sleeping database takes a few seconds to wake. Long enough for that,
    // short enough that a real outage shows an error instead of hanging.
    connectionTimeoutMillis: 20_000,
    keepAlive: true,
  });

  // Without a listener, a connection the database drops while it sits in the
  // pool is an unhandled 'error' event, and Node kills the whole server for
  // it. The pool discards that connection by itself; all we must do is not
  // crash.
  pool.on('error', (error) => {
    console.warn(`[labflow] database connection dropped while idle: ${error.message}`);
  });

  // A connection that could not even be opened sent nothing, so trying once
  // more cannot run a query twice. This is what covers the database waking up.
  const query = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
  (pool as unknown as { query: typeof query }).query = async (...args: unknown[]) => {
    try {
      return await query(...args);
    } catch (error) {
      if (!isConnectFailure(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750));
      return query(...args);
    }
  };
  return pool;
}

// Next dev reloads modules; reuse one pool so we don't exhaust connections.
const pool = globalThis.__labflowPool ?? createPool();

if (process.env.NODE_ENV !== 'production') globalThis.__labflowPool = pool;

export const db = drizzle(pool, { schema });
export { pool, schema };
