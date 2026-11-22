'use server';

import { revalidatePath } from 'next/cache';
import { isKind, isPace, type NotifyKind } from '@/lib/notify';
import { requireSession } from '../authz';
import * as q from '../queries';
import type { ActionState } from './types';

export async function markAllReadAction(): Promise<void> {
  const session = await requireSession();
  await q.markAllNotificationsRead(session);
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}

export async function saveNotifyPrefsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const pace = String(formData.get('pace') ?? '');
  if (!isPace(pace)) return { error: 'Choose how often to be emailed.' };
  const kinds = formData.getAll('kinds').map(String).filter(isKind) as NotifyKind[];
  await q.setNotifyPrefs(session, { pace, kinds });
  revalidatePath('/settings');
  return {
    ok: true,
    message:
      pace === 'off'
        ? 'Saved. No notification emails; you will still see them in the app.'
        : kinds.length
          ? `Saved. ${pace === 'daily' ? 'At most one email a day' : 'At most one email an hour'}, only for what you have not seen in the app.`
          : 'Saved. Nothing is ticked, so no emails; you will still see notifications in the app.',
  };
}
