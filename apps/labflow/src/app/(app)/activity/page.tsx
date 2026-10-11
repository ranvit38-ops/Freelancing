import Link from 'next/link';
import { LocalDateTime } from '@/components/local-date-time';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { requireSession } from '@/server/authz';
import { listActivity, listWorkspaceMembers } from '@/server/queries';

export const metadata = { title: 'Activity' };
export const dynamic = 'force-dynamic';

const PAGE = 200;

/**
 * Who put in or changed what, and when, across the lab. For whoever runs it:
 * owners and the admins they choose. Written as changes happen, so it is a
 * ledger rather than a reconstruction; deleted notes keep their text here.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: { person?: string; before?: string };
}) {
  const session = await requireSession();
  if (session.role === 'member') {
    return (
      <>
        <PageHeader title="Activity" />
        <Card>
          <EmptyState
            title="Owners and admins only"
            description="The lab's activity log is for whoever runs the lab. Ask an owner if you need it."
          />
        </Card>
      </>
    );
  }

  const before = searchParams.before ? new Date(searchParams.before) : undefined;
  const [rows, members] = await Promise.all([
    listActivity(session, {
      actorId: searchParams.person,
      before: before && !Number.isNaN(before.getTime()) ? before : undefined,
      limit: PAGE,
    }),
    listWorkspaceMembers(session),
  ]);
  const person = members.find((m) => m.id === searchParams.person);
  const keep = person ? `person=${person.id}` : '';
  const last = rows[rows.length - 1];

  return (
    <>
      <PageHeader
        title="Activity"
        description={
          person
            ? `Everything ${person.name ?? person.email} has put in or changed, newest first.`
            : 'Who put in or changed what across the lab, newest first.'
        }
        actions={
          <a
            href={`/api/activity${keep ? `?${keep}` : ''}`}
            className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-raised"
          >
            Download as spreadsheet
          </a>
        }
      />

      <form className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1.5 block font-medium">Person</span>
          <select
            name="person"
            defaultValue={person?.id ?? ''}
            className="h-9 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm"
          >
            <option value="">Everyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-raised"
        >
          Show
        </button>
      </form>

      <Card>
        <CardHeader
          title={person ? (person.name ?? person.email) : 'Everyone'}
          description="Private files and direct messages are never logged."
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            description="Entries appear here as people record experiments, add notes, upload files and edit documents."
          />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="px-5 py-3">
                <p className="text-sm">
                  <span className="font-medium">{r.actorName ?? 'Former member'}</span>{' '}
                  <span className="text-muted">
                    {r.action} {r.subjectType}
                  </span>{' '}
                  {r.href ? (
                    <Link href={r.href} className="underline-offset-2 hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    <span>{r.label}</span>
                  )}
                </p>
                {r.detail ? (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted">{r.detail}</p>
                ) : null}
                <p className="mt-0.5 text-xs text-subtle">
                  <LocalDateTime value={r.createdAt} />
                </p>
              </li>
            ))}
          </ul>
        )}
        {rows.length === PAGE && last ? (
          <div className="border-t border-line px-5 py-3">
            <Link
              href={`/activity?${keep ? `${keep}&` : ''}before=${encodeURIComponent(last.createdAt.toISOString())}`}
              className="text-sm text-muted underline underline-offset-2 hover:text-fg"
            >
              Older
            </Link>
          </div>
        ) : null}
      </Card>
    </>
  );
}
