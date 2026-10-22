'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { listMyWorkspaces, selectWorkspace } from '../auth';
import { requireSession } from '../authz';
import * as q from '../queries';
import { removeWorkspaceFiles } from '../storage';
import type { ActionState } from './types';

function refused(error: unknown): ActionState {
  if (error instanceof q.MembershipRefusedError) return { error: error.message };
  throw error;
}

export async function setMemberRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const role = String(formData.get('role') ?? '');
  if (role !== 'owner' && role !== 'admin' && role !== 'member') return { error: 'Choose a role.' };
  try {
    await q.setMemberRole(session, String(formData.get('userId') ?? ''), role);
  } catch (error) {
    return refused(error);
  }
  revalidatePath('/settings');
  revalidatePath('/team');
  return { ok: true, message: 'Role changed.' };
}

export async function removeMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  try {
    await q.removeMember(session, String(formData.get('userId') ?? ''));
  } catch (error) {
    return refused(error);
  }
  revalidatePath('/settings');
  revalidatePath('/team');
  return { ok: true, message: 'Removed from the lab. What they recorded stays.' };
}

/** Moves the session to another lab this person belongs to, if any. */
async function otherLab(currentId: string): Promise<string | null> {
  const mine = await listMyWorkspaces();
  return mine.find((w) => w.id !== currentId)?.id ?? null;
}

export async function leaveLabAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const next = await otherLab(session.workspaceId);
  if (!next) return { error: 'This is your only lab. To leave Labquill entirely, delete your account below.' };
  try {
    await q.leaveWorkspace(session);
  } catch (error) {
    return refused(error);
  }
  selectWorkspace(next);
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function deleteLabAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const next = await otherLab(session.workspaceId);
  if (!next) return { error: 'This is your only lab. To delete it and your account, use "Delete my account" below.' };
  try {
    await q.deleteWorkspace(session, String(formData.get('confirm') ?? ''));
  } catch (error) {
    return refused(error);
  }
  await removeWorkspaceFiles(session.workspaceId);
  selectWorkspace(next);
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
