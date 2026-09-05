import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { NotFoundInWorkspaceError } from '@/server/authz';
import { getFileForDownload } from '@/server/queries';
import { getFile } from '@/server/storage';
import { headerSafeFilename } from '@/lib/rate-limit';

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
    // Links have no bytes of their own — send the viewer to the source.
    if (!file.storageKey) {
      if (!file.sourceUrl) {
        return NextResponse.json({ error: 'This attachment has no content' }, { status: 404 });
      }
      // Re-check the scheme at redirect time. The URL was validated on the way
      // in, but a redirect to attacker-chosen content is worth guarding twice.
      let target: URL;
      try {
        target = new URL(file.sourceUrl);
      } catch {
        return NextResponse.json({ error: 'This attachment has an unusable link' }, { status: 400 });
      }
      if (target.protocol !== 'https:' && target.protocol !== 'http:') {
        return NextResponse.json({ error: 'This attachment has an unusable link' }, { status: 400 });
      }
      return NextResponse.redirect(target.toString(), 302);
    }
    const body = await getFile(file.storageKey);
    return new NextResponse(body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.byteSize),
        // `attachment` keeps uploaded HTML/SVG from executing on our origin.
        'Content-Disposition': `attachment; filename="${headerSafeFilename(file.filename)}"`,
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
