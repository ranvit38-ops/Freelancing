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
