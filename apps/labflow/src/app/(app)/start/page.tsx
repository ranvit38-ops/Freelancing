import Link from 'next/link';
import { labAiReady } from '@/server/ai/access';
import { CatchUp } from '@/components/catch-up';
import { ReadingPath } from '@/components/reading-path';
import { Card, CardHeader, PageHeader } from '@/components/ui';
import { experimentCode } from '@/lib/display';
import { buildReadingPath, MAX_PATH_FILES, pathFiles, type PathFile } from '@/lib/reading-path';
import { requireSession } from '@/server/authz';
import {
  listExperiments,
  listFiles,
  listProjects,
  listProtocols,
  listResearchUpdates,
  listWorkspaceMembers,
} from '@/server/queries';

export const metadata = { title: 'Start here' };
export const dynamic = 'force-dynamic';

/**
 * Where someone new begins, and where anyone can come back to.
 *
 * A new student's first weeks are spent asking five people where things are
 * and what has already been tried. This page answers that from what the lab
 * has already recorded: what to read, in what order, and who to ask about
 * what, so the professor does not have to explain it all from scratch.
 */
export default async function StartPage({ searchParams }: { searchParams: { joined?: string } }) {
  const session = await requireSession();
  const [projects, experiments, protocols, updates, files, members] = await Promise.all([
    listProjects(session),
    listExperiments(session),
    listProtocols(session),
    listResearchUpdates(session),
    listFiles(session),
    listWorkspaceMembers(session),
  ]);

  const attached = new Set(files.filter((f) => f.experimentId).map((f) => f.id));
  const lab = [...new Map(files.filter((f) => !f.private).map((f) => [f.id, f])).values()];
  const pathInput: PathFile[] = lab.map((f) => ({
    id: f.id,
    filename: f.filename,
    createdAt: f.createdAt,
    attached: attached.has(f.id),
    isDocument: f.isDocument,
  }));
  const moreFiles = Math.max(0, pathFiles(pathInput).length - MAX_PATH_FILES);
  const canCurate = session.role === 'owner' || session.role === 'admin';
  // The worked example is made-up data: never counted as the lab's work.
  const exampleIds = new Set(projects.filter((p) => p.isExample).map((p) => p.id));
  const projectCount = projects.length - exampleIds.size;
  const realExperiments = experiments.filter((e) => !exampleIds.has(e.projectId));
  const experimentCount = realExperiments.length;
  const steps = buildReadingPath({
    projects,
    experiments: experiments.map((e) => ({
      id: e.id,
      code: experimentCode(e.number),
      title: e.title,
      projectId: e.projectId,
      performedOn: e.performedOn ? new Date(e.performedOn).toISOString().slice(0, 10) : null,
      status: e.status,
      protocolName: e.protocolName,
    })),
    protocols,
    updates,
    files: pathInput,
  });

  // Who did what, from the records themselves, so "ask Maya" means something.
  const runsBy = new Map<string, { count: number; projects: Set<string> }>();
  for (const e of realExperiments) {
    if (!e.researcherName) continue;
    const entry = runsBy.get(e.researcherName) ?? { count: 0, projects: new Set<string>() };
    entry.count += 1;
    entry.projects.add(e.projectName);
    runsBy.set(e.researcherName, entry);
  }
  const others = members.filter((m) => m.id !== session.userId);
  const firstName = session.userName.split(/\s+/)[0] || session.userName;

  return (
    <>
      <PageHeader
        eyebrow={searchParams.joined === '1' ? 'You’re in' : 'Start here'}
        title={searchParams.joined === '1' ? `Welcome to ${session.workspaceName}, ${firstName}` : `Getting up to speed in ${session.workspaceName}`}
        description="Everything the lab has recorded, in the order that makes sense. Work down the list and you will know what is going on without having to ask."
      />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [members.length, members.length === 1 ? 'person' : 'people'],
          [projectCount, projectCount === 1 ? 'project' : 'projects'],
          [experimentCount, experimentCount === 1 ? 'experiment' : 'experiments'],
          [lab.length, lab.length === 1 ? 'shared file' : 'shared files'],
        ].map(([value, label]) => (
          <div key={String(label)} className="rounded-xl border border-line bg-surface px-4 py-3">
            <span className="text-xl font-semibold tabular-nums">{value}</span>
            <span className="ml-1.5 text-sm text-muted">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-5 lg:col-span-2">
          {canCurate && projectCount === 0 ? (
            <Card>
              <CardHeader
                title="Setting up the lab"
                description="In this order: each step needs the one before it."
              />
              <ol className="space-y-3 px-5 pb-5 text-sm">
                {[
                  {
                    href: '/projects/new',
                    label: 'Create a project',
                    text: 'The study: its question and hypothesis. Experiments and their files live inside it.',
                  },
                  {
                    href: '/files',
                    label: 'Add your protocols',
                    text: 'Upload the PDF or Word file in Files, then choose “Use as a protocol”. Revisions become v2, v3.',
                  },
                  {
                    href: '/experiments/new',
                    label: 'Record an experiment',
                    text: 'One run of a protocol: date, conditions, sample IDs, where the raw data is, notes.',
                  },
                ].map((step, i) => (
                  <li key={step.href} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                      {i + 1}
                    </span>
                    <span>
                      <Link href={step.href} className="font-medium underline underline-offset-2">
                        {step.label}
                      </Link>
                      <span className="text-muted"> · {step.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Catch me up" description="The whole lab on one page, in plain language." />
            <CatchUp configured={await labAiReady(session)} />
          </Card>

          <Card>
            <CardHeader title="Read these, in this order" description="Tick each one off as you go. Clicking one ticks it too." />
            {steps.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">
                The lab has not recorded anything yet. Once there are projects, experiments or shared files,
                this becomes the path through them.
              </p>
            ) : (
              <ReadingPath steps={steps} storageKey={`labvia:read:${session.workspaceId}:${session.userId}`} />
            )}
            {moreFiles > 0 ? (
              <p className="border-t border-line px-5 py-3 text-xs text-muted">
                {moreFiles} more shared {moreFiles === 1 ? 'file is' : 'files are'} in{' '}
                <Link href="/files" className="underline">
                  Files
                </Link>
                .
              </p>
            ) : null}
            {canCurate ? (
              <p className="border-t border-line px-5 py-3 text-xs text-muted">
                Shared files are ordered by name: put “Welcome” or “Start” in a file’s name to have it read first,
                “Protocol” or “Safety” next. Or{' '}
                <Link href="/files" className="underline">
                  write a Welcome document
                </Link>{' '}
                for newcomers.
              </p>
            ) : null}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Who’s who" description="Ask the person who did the work." />
            <ul className="divide-y divide-line">
              {members.map((m) => {
                const name = m.name || m.email;
                const work = runsBy.get(m.name ?? '');
                return (
                  <li key={m.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {name}
                        {m.id === session.userId ? <span className="font-normal text-muted"> (you)</span> : null}
                      </p>
                      <p className="text-xs text-muted">
                        {m.role === 'owner' ? 'Runs the lab' : m.role === 'admin' ? 'Admin' : 'Member'}
                        {work ? ` · ${work.count} experiment${work.count === 1 ? '' : 's'} in ${[...work.projects].join(', ')}` : ''}
                      </p>
                    </div>
                    {m.id !== session.userId ? (
                      <Link
                        href={`/chat?with=${m.id}`}
                        className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium hover:bg-raised"
                      >
                        Message
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {others.length === 0 ? (
              <p className="px-5 pb-4 text-xs text-muted">
                Just you so far. Share the join link from{' '}
                <Link href="/team" className="underline">
                  People
                </Link>
                .
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Stuck on something?" />
            <ul className="space-y-2 px-5 pb-5 text-sm">
              <li>
                Ask <b>LabBot</b> (bottom right) about any project. It answers from the lab’s records and shows
                which ones.
              </li>
              <li>
                Ask the lab in{' '}
                <Link href="/chat" className="font-medium text-accent underline-offset-2 hover:underline">
                  #lab
                </Link>
                . Someone has probably wondered the same thing.
              </li>
              <li>
                See what needs doing in{' '}
                <Link href="/tasks" className="font-medium text-accent underline-offset-2 hover:underline">
                  Tasks
                </Link>
                . “Up for grabs” is a good place to start helping.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
