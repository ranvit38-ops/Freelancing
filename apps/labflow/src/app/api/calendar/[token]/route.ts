import { NextResponse } from 'next/server';
import { buildIcs } from '@/lib/ics';
import { todayIso } from '@/lib/tasks';
import { publicBaseUrl } from '@/server/mailer';
import { calendarFeed } from '@/server/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The address Google Calendar (or Apple, or Outlook) subscribes to.
 *
 * No login: calendar apps cannot log in. The long random token in the path is
 * the whole credential, and it opens one person's view of one lab's calendar
 * and nothing else. "Make a new link" on the Calendar page replaces it.
 */
export async function GET(request: Request, { params }: { params: { token: string } }) {
  const token = params.token.replace(/\.ics$/, '');
  const feed = await calendarFeed(token, todayIso());
  if (!feed) return new NextResponse('This calendar link has been replaced or switched off.', { status: 404 });

  const host = new URL(publicBaseUrl() ?? request.url).host;
  const body = buildIcs({
    calendarName: `${feed.workspaceName} (Labvia)`,
    host,
    events: feed.events,
    deadlines: feed.deadlines,
    now: new Date(),
  });
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="labvia.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
