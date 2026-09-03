import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { firstPlottableDataset, getResearchUpdate } from '@/server/queries';
import { buildPptx } from '@/lib/pptx';
import { renderChartPng } from '@/lib/chart-image';
import { experimentCode, pluralise } from '@/lib/display';

export const runtime = 'nodejs';

/** Exports the saved (researcher-edited) update as a .pptx. */
export async function GET(_request: Request, { params }: { params: { updateId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const update = await getResearchUpdate(session, params.updateId);

    // One chart, drawn from the first plottable dataset in the selected runs.
    // No dataset means no chart slide — never an empty placeholder.
    const dataset = await firstPlottableDataset(session, update.experimentIds);
    let chart = null;
    if (dataset) {
      const points = dataset.rows
        .map((row) => ({
          x: Number(row[dataset.xColumn]),
          y: Number(row[dataset.yColumn]),
        }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      const png = renderChartPng(points, { connect: true });
      if (png) {
        chart = {
          png,
          heading: `${dataset.yColumn} vs ${dataset.xColumn}`,
          caption: `${dataset.name} — ${experimentCode(dataset.experimentNumber)} ${dataset.experimentTitle}. ${points.length} points, plotted as uploaded.`,
        };
      }
    }

    const deck = await buildPptx({
      title: update.title,
      subtitle: `${session.workspaceName} · ${pluralise(update.experimentIds.length, 'experiment')}`,
      sections: update.sections,
      chart,
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
