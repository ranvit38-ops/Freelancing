import Link from 'next/link';
import { headers } from 'next/headers';
import { getSession } from '@/server/auth';
import { findLinkInMyOtherLabs } from '@/server/queries';
import { switchWorkspaceAction } from '@/server/actions/workspace';

export const metadata = { title: 'Not found' };

/**
 * A mistyped or outdated link. Usually a record that was deleted, or one that
 * belongs to a different lab. When that lab is one of the reader's own, say
 * so and offer to switch: "not in this lab" is no help to someone who is in
 * two and opened a link from the other one.
 */
export default async function NotFound() {
  const path = headers().get('x-labquill-path') ?? '';
  const session = path ? await getSession().catch(() => null) : null;
  const other = session ? await findLinkInMyOtherLabs(session, path).catch(() => null) : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-accent">Not found</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {other ? `This is in ${other.workspaceName}` : <>This page isn&rsquo;t here</>}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {other
            ? `You are looking at ${session!.workspaceName}. Switch labs to open it.`
            : 'It may have been deleted, or it belongs to a lab you are not in.'}
        </p>
        {other ? (
          <form action={switchWorkspaceAction} className="mt-6">
            <input type="hidden" name="workspaceId" value={other.workspaceId} />
            <input type="hidden" name="then" value={path} />
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              Switch to {other.workspaceName}
            </button>
          </form>
        ) : (
          <Link
            href="/dashboard"
            className="mt-6 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Go home
          </Link>
        )}
      </div>
    </main>
  );
}
