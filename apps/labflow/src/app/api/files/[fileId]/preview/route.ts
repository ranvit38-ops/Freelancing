import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { NotFoundInWorkspaceError } from '@/server/authz';
import { getFileForDownload } from '@/server/queries';
import { getFile } from '@/server/storage';
import { canExtractText, fileText } from '@/server/ai/file-text';

export const runtime = 'nodejs';

/** The opening words of a file, for the hover preview. Same access check as a download. */
export async function GET(_request: Request, props: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const file = await getFileForDownload(session, fileId);
    const text =
      file.storageKey && canExtractText(file.filename) ? await fileText(file.storageKey, file.filename, getFile) : null;
    return NextResponse.json(
      { text: text ? text.slice(0, 1500) : null },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ text: null });
  }
}
