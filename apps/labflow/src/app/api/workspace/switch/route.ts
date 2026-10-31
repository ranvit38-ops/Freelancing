import { NextResponse } from 'next/server';
import { listMyWorkspaces, selectWorkspace } from '@/server/auth';
import { absoluteUrl } from '@/server/mailer';
import { sameSitePath } from '@/lib/normalise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Switches lab, then opens the page that was asked for.
 *
 * A plain form post rather than a server action, so the browser loads the
 * destination afresh. From the "this is in your other lab" page the
 * destination is the address already showing, and a client-side redirect to
 * the current address could leave the not-found screen in place.
 *
 * Membership is checked here and again on every request by getSession: the
 * cookie alone never grants access. The session cookie is SameSite=Lax, so a
 * post from another site arrives without it and switches nothing.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const target = String(form.get('workspaceId') ?? '');
  const then = sameSitePath(String(form.get('then') ?? '')) ?? '/dashboard';
  const mine = await listMyWorkspaces();
  if (mine.length === 0) return NextResponse.redirect(absoluteUrl('/login'), 303);
  if (mine.some((w) => w.id === target)) await selectWorkspace(target);
  return NextResponse.redirect(absoluteUrl(then), 303);
}
