import { timingSafeEqual } from 'node:crypto';
import { sendDueNotificationEmails } from '@/server/notify-email';

export const dynamic = 'force-dynamic';

/**
 * Sends the batched notification emails that are due. For a scheduler such
 * as a Render Cron Job every 15 minutes:
 *   curl -fsS -X POST -H "Authorization: Bearer $LABFLOW_CRON_SECRET" https://<your domain>/api/cron/notifications
 * Without it, emails still go out after ordinary use of the app; the cron
 * only makes them prompt when the lab is quiet.
 */
export async function POST(request: Request) {
  const secret = process.env.LABFLOW_CRON_SECRET ?? '';
  if (secret.length < 16) {
    return Response.json({ error: 'Set LABFLOW_CRON_SECRET (16+ characters) to use this.' }, { status: 503 });
  }
  const given = Buffer.from((request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return Response.json({ error: 'Not allowed.' }, { status: 401 });
  }
  const result = await sendDueNotificationEmails();
  return Response.json(result);
}
