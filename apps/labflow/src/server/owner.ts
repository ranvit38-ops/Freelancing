import { isOwnerEmail } from './google';
import type { SessionContext } from './auth';

/**
 * The gate on owner-only pages.
 *
 * Kept apart from admin.ts so it pulls in no database module: the check is
 * pure, and a guard you cannot test without a live Postgres is a guard nobody
 * tests. It compares the signed-in address against LABFLOW_OWNER_EMAIL, which
 * is set on the server and cannot be influenced by a request.
 */
export class NotTheOwnerError extends Error {
  constructor() {
    super('This page is for the account owner.');
    this.name = 'NotTheOwnerError';
  }
}

export function requireOwner(session: SessionContext): void {
  if (!isOwnerEmail(session.userEmail)) throw new NotTheOwnerError();
}
