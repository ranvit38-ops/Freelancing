import Link from 'next/link';
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { ExperimentList } from '@/components/records';
import { NextActionsList } from '@/components/next-actions-list';
import { buildNextActions } from '@/lib/next-actions';
import {
  experimentCode,
  formatDate,
  greetingName,
  pluralise,
  projectStatusLabel,
} from '@/lib/display';
import { requireSession } from '@/server/authz';
import { dashboardData, nextActionSignals } from '@/server/queries';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireSession();
  const [data, signals] = await Promise.all([
    dashboardData(session),
    nextActionSignals(session),
  ]);
  const actions = buildNextActions(signals.experiments, signals.protocols);
  const activeProjects = data.projects.filter((p) => p.status === 'active' || p.status === 'planning');

  return (
    <>
      <PageHeader
        eyebrow={session.workspaceName}
        title={`Good to see you, ${greetingName(session.userName)}`}
        description={`${pluralise(data.projects.length, 'project')} · ${pluralise(
          data.experimentCount,
          'experiment',
        )} recorded.`}
        actions={<ButtonLink href="/projects/new">New project</ButtonLink>}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent experiments"
            action={
              <Link href="/experiments" className="text-sm text-muted underline underline-offset-2 hover:text-fg">
                View all
              </Link>
            }
          />
          <ExperimentList
            experiments={data.recent}
            showProject
            empty={
              <EmptyState
                title="No experiments yet"
                description="Create a project, then record your first experiment. It takes under a minute."
                action={<ButtonLink href="/projects/new" size="sm">Create a project</ButtonLink>}
              />
            }
          />
        </Card>

        <Card>
          <CardHeader title="Active projects" />
          {activeProjects.length === 0 ? (
            <EmptyState title="No active projects" />
          ) : (
            <ul className="divide-y divide-line">
              {activeProjects.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="block px-5 py-3 hover:bg-raised">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {pluralise(p.experimentCount, 'experiment')} · {projectStatusLabel[p.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Needs attention" description="Runs marked for investigation." />
          {data.needsAttention.length === 0 ? (
            <EmptyState title="Nothing flagged." />
          ) : (
            <ul className="divide-y divide-line">
              {data.needsAttention.map((e) => (
                <li key={e.id}>
                  <Link href={`/experiments/${e.id}`} className="block px-5 py-3 hover:bg-raised">
                    <span className="block truncate text-sm font-medium">
                      {experimentCode(e.number)} · {e.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{e.projectName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Needs attention"
            description="What is missing from the write-up."
            action={
              <Link href="/actions" className="text-sm text-muted underline underline-offset-2 hover:text-fg">
                View all
              </Link>
            }
          />
          <NextActionsList actions={actions} limit={4} />
        </Card>

        <Card>
          <CardHeader title="Planned" description="Experiments not yet started." />
          {data.planned.length === 0 ? (
            <EmptyState title="Nothing planned." />
          ) : (
            <ul className="divide-y divide-line">
              {data.planned.map((e) => (
                <li key={e.id}>
                  <Link href={`/experiments/${e.id}`} className="block px-5 py-3 hover:bg-raised">
                    <span className="block truncate text-sm font-medium">
                      {experimentCode(e.number)} · {e.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {e.projectName} · {formatDate(e.performedOn)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
