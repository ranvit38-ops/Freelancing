/**
 * Kept separate from authz.ts so the data layer can import it without pulling
 * in next/headers and React — which only exist inside a request.
 */

/** Thrown when a record exists but belongs to a different workspace. */
export class NotFoundInWorkspaceError extends Error {
  constructor(entity: string) {
    super(`${entity} not found in this workspace`);
    this.name = 'NotFoundInWorkspaceError';
  }
}

export function assertFound<T>(value: T | undefined | null, entity: string): T {
  if (value === undefined || value === null) throw new NotFoundInWorkspaceError(entity);
  return value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids arrive from the URL, so a mistyped or stale link can hand Postgres a
 * value that is not a UUID. Left alone that raises 22P02 and renders a crash
 * page for what is only a record that does not exist. A malformed id and a
 * missing row deserve the same answer.
 */
export function assertId(value: string, entity: string): string {
  if (!UUID.test(value)) throw new NotFoundInWorkspaceError(entity);
  return value;
}
