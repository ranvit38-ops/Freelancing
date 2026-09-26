'use server';

import { requireSession } from '../authz';
import { NotFoundInWorkspaceError } from '../not-found';
import { getFileForDownload } from '../queries';
import { audienceFrom, shareFile } from '../sharing';
import type { ActionState } from './types';

/** Change who an existing file is for, and tell them. Uploader only. */
export async function shareFileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const fileId = String(formData.get('fileId') ?? '');
  const audience = audienceFrom(formData);
  if (formData.get('audience') === 'people' && audience.kind !== 'people') {
    return { error: 'Pick at least one person to share with.' };
  }
  try {
    const file = await getFileForDownload(session, fileId);
    const result = await shareFile(session, { id: fileId, filename: file.filename }, audience);
    return {
      ok: true,
      message:
        audience.kind === 'everyone'
          ? 'Shared with the lab and posted in #lab.'
          : audience.kind === 'me'
            ? 'Now only you can see it.'
            : result.sharedWith.length === 1
              ? 'Shared. They got it as a direct message.'
              : 'Shared in a group message.',
    };
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return { error: 'Only the person who uploaded a file can change who sees it.' };
    throw error;
  }
}
