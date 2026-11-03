import { getSession } from '@/server/auth';
import { activityCsv } from '@/lib/activity';
import * as q from '@/server/queries';

export const runtime = 'nodejs';

/**
 * The activity log as a spreadsheet: the lab's own record of who put in or
 * changed what, to keep, print or hand to a department. Owners and admins only.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response('Not authenticated', { status: 401 });
  if (session.role === 'member') return new Response('Only owners and admins can export activity.', { status: 403 });

  const person = new URL(request.url).searchParams.get('person') ?? undefined;
  const rows = await q.listActivity(session, { actorId: person, limit: 5000 });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(activityCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="lab-activity-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
