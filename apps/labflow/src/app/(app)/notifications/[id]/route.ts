import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth';
import { openNotification } from '@/server/queries';

export const dynamic = 'force-dynamic';

/**
 * A notification's link, from the app or an email: marks it read, then goes
 * where it points. Only paths inside Labquill are followed.
 */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getSession();
  // From an email while logged out: log in, then come straight back here.
  if (!session) redirect(`/login?next=${encodeURIComponent(`/notifications/${id}`)}`);
  let href: string | null = null;
  try {
    href = await openNotification(session, id);
  } catch {
    href = null;
  }
  redirect(href && href.startsWith('/') && !href.startsWith('//') ? href : '/notifications');
}
