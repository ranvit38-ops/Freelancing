import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { getResearchUpdate } from '@/server/queries';
import { buildPptx } from '@/lib/pptx';
import { pluralise } from '@/lib/display';

export const runtime = 'nodejs';

/** Exports the saved (researcher-edited) update as a .pptx. */
export async function GET(_request: Request, { params }: { params: { updateId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const update = await getResearchUpdate(session, params.updateId);
    const deck = await buildPptx({
      title: update.title,
      subtitle: `${session.workspaceName} · ${pluralise(update.experimentIds.length, 'experiment')}`,
      sections: update.sections,
    });
    const filename = `${update.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'research-update'}.pptx`;
    return new NextResponse(deck, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
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
