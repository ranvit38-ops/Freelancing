'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '../authz';
import { blockedReason } from '../paywall';
import * as q from '../queries';
import type { ActionState } from './types';

/**
 * The lab calendar: group meetings, instrument bookings, deadlines that are
 * not a task. Anyone in the lab can add and remove, because a shared
 * calendar only one person may edit is a calendar nobody keeps up to date.
 */
export async function createEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { fieldErrors: { title: 'Say what is happening' } };

  const onDate = String(formData.get('onDate') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(onDate)) return { fieldErrors: { onDate: 'Pick a date' } };

  const atTime = String(formData.get('atTime') ?? '').trim();
  if (atTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(atTime)) {
    return { fieldErrors: { atTime: 'Use the time picker, or leave it empty for all day' } };
  }

  const notes = String(formData.get('notes') ?? '').trim();
  await q.createEvent(session, {
    title: title.slice(0, 200),
    onDate,
    atTime: atTime || null,
    notes: notes ? notes.slice(0, 2000) : null,
  });

  revalidatePath('/calendar');
  revalidatePath('/dashboard');
  return { ok: true, message: 'Added to the calendar.' };
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await q.deleteEvent(session, String(formData.get('eventId') ?? ''));
  revalidatePath('/calendar');
  revalidatePath('/dashboard');
}
