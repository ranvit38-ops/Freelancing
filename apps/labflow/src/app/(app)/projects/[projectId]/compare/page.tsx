import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectTabs } from '@/components/project-tabs';
import { Card, CardHeader, EmptyState, PageHeader, cx } from '@/components/ui';
import { buildComparison } from '@/lib/compare';
import { experimentCode, experimentStatusLabel, formatDate } from '@/lib/display';
import type { ExperimentStatus } from '@/db/schema';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getComparableExperiments, getProject, listExperiments } from '@/server/queries';

export const metadata = { title: 'Compare experiments' };
export const dynamic = 'force-dynamic';

/** Selection lives in the URL, so a comparison can be shared or bookmarked. */
function selectedIds(ids: string | string[] | undefined): string[] {
  if (!ids) return [];
  const list = Array.isArray(ids) ? ids : ids.split(',');
  return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean))).slice(0, 6);
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { ids?: string | string[] };
}) {
  const session = await requireSession();
  let project;
  try {
    project = await getProject(session, params.projectId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }

  const all = await listExperiments(session, { projectId: project.id });
  const chosen = selectedIds(searchParams.ids);
  const experiments = await getComparableExperiments(session, chosen);
  const rows = buildComparison(
    experiments.map((e) => ({
      ...e,
      status: experimentStatusLabel[e.status as ExperimentStatus] ?? e.status,
    })),
  );
  const groups = ['Setup', 'Conditions', 'Outcome'] as const;

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Compare experiments"
        description="Pick two or more runs. Rows where the record differs are highlighted."
      />
      <ProjectTabs projectId={project.id} />

      <Card className="mb-5">
        <CardHeader title="Select experiments" description="Up to six at a time." />
        <form className="px-5 py-4">
          <fieldset>
            <legend className="sr-only">Experiments to compare</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {all.map((e) => (
                <label key={e.id} className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-raised">
                  <input
                    type="checkbox"
                    name="ids"
                    value={e.id}
                    defaultChecked={chosen.includes(e.id)}
                    className="mt-0.5 h-4 w-4 accent-[rgb(var(--lf-accent))]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate">
                      <span className="font-mono text-xs text-subtle">
                        {experimentCode(e.number)}
                      </span>{' '}
                      {e.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {formatDate(e.performedOn)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            className="mt-4 h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90"
          >
            Compare selected
          </button>
        </form>
      </Card>

      {experiments.length < 2 ? (
        <Card>
          <EmptyState
            title="Select at least two experiments"
            description="Then the table below shows exactly which fields differ between them."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title="Differences"
            description={`${rows.filter((r) => r.differs).length} of ${rows.length} rows differ`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">
                Field-by-field comparison of the selected experiments
              </caption>
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="w-48 px-5 py-3 text-xs font-medium uppercase tracking-wider text-subtle">
                    Field
                  </th>
                  {experiments.map((e) => (
                    <th key={e.id} scope="col" className="px-5 py-3 align-bottom">
                      <Link href={`/experiments/${e.id}`} className="block hover:underline">
                        <span className="block font-mono text-xs text-subtle">
                          {experimentCode(e.number)}
                        </span>
                        <span className="block max-w-[16rem] truncate text-sm font-medium">
                          {e.title}
                        </span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((group) => {
                const groupRows = rows.filter((r) => r.group === group);
                if (groupRows.length === 0) return null;
                return (
                  <tbody key={group} className="divide-y divide-line border-b border-line">
                    <tr className="bg-raised">
                      <th
                        scope="colgroup"
                        colSpan={experiments.length + 1}
                        className="px-5 py-1.5 text-left text-xs font-medium uppercase tracking-wider text-subtle"
                      >
                        {group}
                      </th>
                    </tr>
                    {groupRows.map((row) => (
                      <tr key={row.key} className={cx(row.differs && 'bg-accent-soft/50')}>
                        <th scope="row" className="px-5 py-3 text-left align-top font-medium">
                          {row.label}
                          {row.differs ? (
                            <span className="ml-2 align-middle text-xs font-normal text-accent">
                              differs
                            </span>
                          ) : null}
                        </th>
                        {row.values.map((value, i) => (
                          <td key={i} className="px-5 py-3 align-top">
                            {value?.trim() ? (
                              <span className="whitespace-pre-wrap">{value}</span>
                            ) : (
                              <span className="text-subtle">Not recorded</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-subtle">
            Highlighted rows show differences in what was <em>written down</em>. Two runs that
            record the same value may still have differed in ways nobody documented.
          </p>
        </Card>
      )}
    </>
  );
}
