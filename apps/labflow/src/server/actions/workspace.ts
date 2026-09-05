'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import { db } from '@/db';
import { workspaceMembers, workspaces } from '@/db/schema';
import { slugify } from '@/lib/normalise';
import { TRIAL_DAYS } from '@/lib/plans';
import { startTrial } from '../queries';
import { WORKSPACE_COOKIE, listMyWorkspaces } from '../auth';
import { requireSession } from '../authz';
import type { ActionState } from './types';

/**
 * Switching is a cookie write, but membership is re-checked here and again in
 * getSession — the cookie alone never grants access to a workspace.
 */
export async function switchWorkspaceAction(formData: FormData) {
  await requireSession();
  const target = String(formData.get('workspaceId') ?? '');
  const mine = await listMyWorkspaces();
  if (!mine.some((w) => w.id === target)) return;

  cookies().set(WORKSPACE_COOKIE, target, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function createWorkspaceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const name = String(formData.get('name') ?? '').trim();
  if (name === '') return { fieldErrors: { name: 'Name the lab or research group' } };

  const slug = `${slugify(name)}-${randomBytes(3).toString('hex')}`;
  const workspaceId = await db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name, slug, institution: String(formData.get('institution') ?? '').trim() || null })
      .returning({ id: workspaces.id });
    if (!workspace) throw new Error('Could not create the workspace');
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: session.userId, role: 'owner' });
    return workspace.id;
  });

  // Every new lab gets a trial rather than a locked door.
  await startTrial(workspaceId, TRIAL_DAYS);

  cookies().set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
