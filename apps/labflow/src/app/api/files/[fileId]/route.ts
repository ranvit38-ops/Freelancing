import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { NotFoundInWorkspaceError } from '@/server/authz';
import { getFileForDownload } from '@/server/queries';
import { getFile } from '@/server/storage';

export const runtime = 'nodejs';

/**
 * Files are served through the app, never from a public bucket URL, so
 * workspace membership is checked on every download.
 */
export async function GET(_request: Request, { params }: { params: { fileId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const file = await getFileForDownload(session, params.fileId);
    const body = await getFile(file.storageKey);
    return new NextResponse(body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.byteSize),
        // `attachment` keeps uploaded HTML/SVG from executing on our origin.
        'Content-Disposition': `attachment; filename="${file.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
