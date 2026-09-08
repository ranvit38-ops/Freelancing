import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { NotFoundInWorkspaceError } from '@/server/authz';
import { getFileForDownload } from '@/server/queries';
import { getFile } from '@/server/storage';
import { headerSafeFilename } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Types safe to render in the page rather than download. Deliberately narrow:
 * no HTML, no SVG, nothing the browser will execute.
 */
const RENDERABLE = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

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
        // `attachment` by default, because uploaded HTML or SVG served inline
        // would execute on our origin. Only the media types below are shown in
        // place, and only when the stored type is exactly one of them: a file
        // named .mp4 carrying HTML still arrives as a download.
        'Content-Disposition': `${
          RENDERABLE.has(file.contentType) ? 'inline' : 'attachment'
        }; filename="${headerSafeFilename(file.filename)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
