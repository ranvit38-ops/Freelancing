/**
 * Errors raised before a query reached the database, so retrying it cannot
 * run anything twice.
 *
 * Deliberately narrow. "Connection terminated" mid-query is not here: the
 * query may already have committed, and repeating an insert is worse than
 * showing an error.
 */
const CONNECT_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  // cannot_connect_now: the server is starting up (a sleeping database waking).
  '57P03',
]);

const CONNECT_MESSAGES = [
  /timeout exceeded when trying to connect/i,
  /connection terminated due to connection timeout/i,
  // Neon, while a suspended compute is still being started.
  /couldn't connect to compute node/i,
];

export function isConnectFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === 'string' && CONNECT_CODES.has(code)) return true;
  return typeof message === 'string' && CONNECT_MESSAGES.some((re) => re.test(message));
}
