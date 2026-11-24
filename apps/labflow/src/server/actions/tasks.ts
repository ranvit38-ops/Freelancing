'use server';

import { parseTaskLines } from '@/lib/bulk-input';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSession } from '../authz';
import { blockedReason } from '../paywall';
import * as q from '../queries';
import { EVERYONE } from '@/lib/tasks';
import type { ActionState } from './types';

/**
 * Delegating work, and saying how it is going.
 *
 * Everything here is deliberately unguarded by role: in a lab of six, the
 * postdoc assigns the undergraduate and the undergraduate assigns themselves,
 * and a permission model that only lets the PI hand out work describes an
 * organisation that does not exist. Workspace scoping still holds, so nobody
 * touches another lab's list.
 */

/** Empty string from a <select> means "nobody", which is a real choice. */
function optionalId(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? '').trim();
  return value === '' ? null : value;
}

/** Reads a "who" picker: a person, the whole lab, or nobody yet. */
function assignee(formData: FormData): { assignedTo: string | null; forEveryone: boolean } {
  const value = optionalId(formData, 'assignedTo');
  if (value === EVERYONE) return { assignedTo: null, forEveryone: true };
  return { assignedTo: value, forEveryone: false };
}

function optionalText(formData: FormData, key: string, max: number): string | null {
  const value = String(formData.get(key) ?? '').trim();
  return value === '' ? null : value.slice(0, max);
}

export async function createTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };

  // One task per line, so a meeting's worth can be added in one go.
  const titles = parseTaskLines(String(formData.get('title') ?? '')).map((t) => t.slice(0, 200));
  if (titles.length === 0) return { fieldErrors: { title: 'Say what needs doing' } };

  const dueOn = optionalText(formData, 'dueOn', 10);
  if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) {
    return { fieldErrors: { dueOn: 'Use the date picker' } };
  }

  const who = assignee(formData);
  const ids: string[] = [];
  for (const title of titles) {
    ids.push(
      await q.createTask(session, {
        title,
        detail: optionalText(formData, 'detail', 4000),
        ...who,
        projectId: optionalId(formData, 'projectId'),
        dueOn,
      }),
    );
  }

  // Work handed to someone else reaches them: in the app, and in their next
  // batched email if they have not seen it. Several at once are one notice.
  // A task for the whole lab notifies nobody: that would be everyone, every time.
  if (who.assignedTo && who.assignedTo !== session.userId) {
    await q.notify(session, [
      {
        userId: who.assignedTo,
        kind: 'task',
        title: titles.length === 1 ? `${session.userName} gave you a task: ${titles[0]}` : `${session.userName} gave you ${titles.length} tasks`,
        body: titles.length === 1 ? (dueOn ? `Due ${dueOn}` : null) : titles.join('; ').slice(0, 300),
        href: ids.length === 1 ? `/tasks/${ids[0]}` : '/tasks',
      },
    ]);
  }

  revalidatePath('/tasks');
  revalidatePath('/dashboard');
  revalidatePath('/calendar');
  return { ok: true, message: titles.length === 1 ? 'Added.' : `Added ${titles.length} tasks.` };
}

/**
 * Moving a task along.
 *
 * A plain form post rather than a state-returning action: it is one click on
 * a board, and the answer is the redrawn board, not a message.
 */
export async function setTaskStatusAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const taskId = String(formData.get('taskId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!q.isTaskStatus(status)) return;

  await q.updateTask(session, taskId, { status });
  revalidatePath('/tasks');
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/dashboard');
}

export async function assignTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const taskId = String(formData.get('taskId') ?? '');
  const before = await q.getTask(session, taskId);
  const who = assignee(formData);

  await q.updateTask(session, taskId, who);
  if (who.assignedTo && who.assignedTo !== session.userId && who.assignedTo !== before.assignedTo) {
    await q.notify(session, [
      {
        userId: who.assignedTo,
        kind: 'task',
        title: `${session.userName} gave you a task: ${before.title}`,
        body: before.dueOn ? `Due ${before.dueOn}` : null,
        href: `/tasks/${taskId}`,
      },
    ]);
  }
  revalidatePath('/tasks');
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/dashboard');
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await q.deleteTask(session, String(formData.get('taskId') ?? ''));
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
  redirect('/tasks');
}
