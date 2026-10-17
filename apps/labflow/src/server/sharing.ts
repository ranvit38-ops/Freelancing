import { revalidatePath } from 'next/cache';
import { dmKey } from '@/lib/dm';
import type { SessionContext } from './auth';
import * as q from './queries';

/**
 * Who a file is for, and telling them.
 *
 * - The whole lab: it goes into #lab, so everyone sees it arrive.
 * - One person: it arrives as a direct message to them.
 * - Several people: one group message to all of them.
 * - Only me: kept private, and nobody is told anything.
 *
 * A share nobody hears about is a file nobody opens, which is why sharing and
 * the message are one step here rather than two the person has to remember.
 */
export type Audience = { kind: 'everyone' } | { kind: 'me' } | { kind: 'people'; userIds: string[] };

export function audienceFrom(form: FormData): Audience {
  const kind = String(form.get('audience') ?? '');
  if (kind === 'me' || form.get('private') === '1') return { kind: 'me' };
  if (kind === 'people') {
    const userIds = form.getAll('shareWith').map(String).filter(Boolean);
    return userIds.length > 0 ? { kind: 'people', userIds } : { kind: 'me' };
  }
  return { kind: 'everyone' };
}

export async function shareFile(
  s: SessionContext,
  file: { id: string; filename: string },
  audience: Audience,
  options: { announce: boolean } = { announce: true },
): Promise<{ sharedWith: string[]; dmKey: string | null }> {
  if (audience.kind === 'everyone') {
    await q.setFileSharing(s, file.id, { everyone: true });
    if (options.announce) {
      await q.postMessage(s, { workspace: true, parentId: null, body: `Shared ${file.filename} with the lab`, fileId: file.id });
    }
    revalidate();
    return { sharedWith: [], dmKey: null };
  }

  const people = audience.kind === 'people' ? audience.userIds : [];
  const sharedWith = await q.setFileSharing(s, file.id, { everyone: false, userIds: people });
  let key: string | null = null;
  if (options.announce && sharedWith.length > 0) {
    key = dmKey([s.userId, ...sharedWith]);
    await q.postMessage(s, {
      dmKey: key,
      parentId: null,
      body: sharedWith.length === 1 ? `Shared ${file.filename} with you` : `Shared ${file.filename} with you all`,
      fileId: file.id,
    });
  }
  revalidate();
  return { sharedWith, dmKey: key };
}

function revalidate() {
  revalidatePath('/files');
  revalidatePath('/chat');
  revalidatePath('/dashboard');
}
