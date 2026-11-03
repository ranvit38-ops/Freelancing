import { NextResponse } from 'next/server';
import { markdownToDocx } from '@/lib/docx';
import { getSession } from '@/server/auth';
import { readDocument } from '@/server/documents';
import { NotFoundInWorkspaceError } from '@/server/not-found';

export const runtime = 'nodejs';

/** The document as a Word file, for people who live in Word. */
export async function GET(_request: Request, props: { params: Promise<{ fileId: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const doc = await readDocument(session, params.fileId);
    const bytes = await markdownToDocx(doc.title, doc.body);
    const name = `${doc.title.replace(/[^\w .()-]+/g, '_')}.docx`;
    return new NextResponse(bytes, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="${name}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
