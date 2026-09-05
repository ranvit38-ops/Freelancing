import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScatterChart } from '@/components/scatter-chart';
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { formatStat } from '@/lib/dataset';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getDataset } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function DatasetPage({
  params,
  searchParams,
}: {
  params: { datasetId: string };
  searchParams: { x?: string; y?: string; connect?: string };
}) {
  const session = await requireSession();
  let data;
  try {
    data = await getDataset(session, params.datasetId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }

  const { dataset, columns } = data;
  const numeric = columns.filter((c) => c.isNumeric);
  const xColumn = searchParams.x ?? numeric[0]?.name ?? '';
  const yColumn = searchParams.y ?? numeric[1]?.name ?? numeric[0]?.name ?? '';
  const connect = searchParams.connect === '1';

  const points = dataset.rows
    .map((row) => ({ x: Number(row[xColumn]), y: Number(row[yColumn]) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  const preview = dataset.rows.slice(0, 20);

  return (
    <>
      <PageHeader
        eyebrow="Dataset"
        title={dataset.name}
        description={`${dataset.rowCount} rows · ${columns.length} columns`}
        actions={
          <Link
            href={`/experiments/${dataset.experimentId}`}
            className="text-sm text-muted underline underline-offset-2 hover:text-fg"
          >
            Back to experiment
          </Link>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardHeader title="Plot" description="Pick the columns to put on each axis." />
          <form className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
            <label className="text-sm">
              <span className="mb-1.5 block font-medium">X axis</span>
              <select
                name="x"
                defaultValue={xColumn}
                className="h-9 rounded-lg border border-line bg-surface px-3 text-sm"
              >
                {numeric.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block font-medium">Y axis</span>
              <select
                name="y"
                defaultValue={yColumn}
                className="h-9 rounded-lg border border-line bg-surface px-3 text-sm"
              >
                {numeric.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="connect"
                value="1"
                defaultChecked={connect}
                className="h-4 w-4 accent-[rgb(var(--lf-accent))]"
              />
              Connect points
            </label>
            <button
              type="submit"
              className="h-9 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-raised"
            >
              Update plot
            </button>
          </form>
          {numeric.length === 0 ? (
            <EmptyState
              title="No numeric columns detected"
              description="A column counts as numeric only when every value in it parses as a number."
            />
          ) : (
            <ScatterChart points={points} xLabel={xColumn} yLabel={yColumn} connect={connect} />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Columns"
            description="Descriptive statistics only — no interpretation."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
                  <th scope="col" className="px-5 py-2 font-medium">Column</th>
                  <th scope="col" className="px-5 py-2 font-medium">Type</th>
                  <th scope="col" className="px-5 py-2 font-medium">n</th>
                  <th scope="col" className="px-5 py-2 font-medium">Missing</th>
                  <th scope="col" className="px-5 py-2 font-medium">Min</th>
                  <th scope="col" className="px-5 py-2 font-medium">Max</th>
                  <th scope="col" className="px-5 py-2 font-medium">Mean</th>
                  <th scope="col" className="px-5 py-2 font-medium">SD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {columns.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-2.5 font-medium">{c.name}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={c.isNumeric ? 'accent' : 'neutral'}>
                        {c.isNumeric ? 'numeric' : 'text'}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5 tabular-nums">{c.stats?.count ?? '—'}</td>
                    <td className="px-5 py-2.5 tabular-nums">{c.stats?.missing ?? '—'}</td>
                    <td className="px-5 py-2.5 tabular-nums">{formatStat(c.stats?.min)}</td>
                    <td className="px-5 py-2.5 tabular-nums">{formatStat(c.stats?.max)}</td>
                    <td className="px-5 py-2.5 tabular-nums">{formatStat(c.stats?.mean)}</td>
                    <td className="px-5 py-2.5 tabular-nums">{formatStat(c.stats?.stdDev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Preview" description={`First ${preview.length} of ${dataset.rowCount} rows`} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
                  {columns.map((c) => (
                    <th key={c.id} scope="col" className="whitespace-nowrap px-5 py-2 font-medium">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.id} className="whitespace-nowrap px-5 py-2 tabular-nums">
                        {row[c.name] || <span className="text-subtle">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
