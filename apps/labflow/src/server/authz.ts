import { redirect } from 'next/navigation';
import { getSession, type SessionContext } from './auth';

export { NotFoundInWorkspaceError, assertFound } from './not-found';

/**
 * The single choke point for authorisation.
 *
 * Every read and write in src/server/queries.ts takes a SessionContext and
 * filters on its workspaceId. Nothing in this app loads a record by id alone,
 * so a guessed UUID from another lab returns nothing rather than data.
 */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}
