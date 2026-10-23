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

/**
 * The address alone is not enough: anyone can sign up with a password using
 * any address, so before verification a match proves nothing. A verified
 * account has signed in with Google, finished a password reset, or joined
 * from an invite sent to that inbox.
 */
export function isOwner(session: Pick<SessionContext, 'userEmail' | 'emailVerified'>): boolean {
  return session.emailVerified && isOwnerEmail(session.userEmail);
}

export function requireOwner(session: SessionContext): void {
  if (!isOwner(session)) throw new NotTheOwnerError();
}
