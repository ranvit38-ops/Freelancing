import Link from 'next/link';
import { Button, Card, EmptyState, PageHeader, cx } from '@/components/ui';
import { LocalDateTime } from '@/components/local-date-time';
import { PACE_LABEL, type NotifyKind } from '@/lib/notify';
import { markAllReadAction } from '@/server/actions/notifications';
import { requireSession } from '@/server/authz';
import { getNotifyPrefs, listNotifications } from '@/server/queries';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

const KIND: Record<NotifyKind, { label: string; dot: string }> = {
  task: { label: 'Task', dot: 'bg-accent' },
  message: { label: 'Message', dot: 'bg-violet' },
  mention: { label: 'Mention', dot: 'bg-amber' },
  reply: { label: 'Reply', dot: 'bg-teal' },
  comment: { label: 'Comment', dot: 'bg-rose' },
};

/**
 * Everything that was aimed at you, newest first. Only things that need you
 * land here, so the list stays short enough to actually read.
 */
export default async function NotificationsPage() {
  const session = await requireSession();
  const [items, prefs] = await Promise.all([listNotifications(session), getNotifyPrefs(session)]);
  const unread = items.filter((n) => !n.readAt);
  const earlier = items.filter((n) => n.readAt);

  const row = (n: (typeof items)[number]) => {
    const kind = KIND[n.kind as NotifyKind] ?? KIND.comment;
    return (
      <li key={n.id}>
        <a href={`/notifications/${n.id}`} className={cx('flex gap-3 px-5 py-3 transition-colors hover:bg-raised', !n.readAt && 'bg-accent-soft/60')}>
          <span aria-hidden className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', kind.dot, n.readAt && 'opacity-50')} />
          <span className="min-w-0 flex-1">
            <span className={cx('block text-sm', n.readAt ? 'text-muted' : 'font-semibold text-fg')}>
              <span className="sr-only">{n.readAt ? '' : 'Unread. '}{kind.label}: </span>
              {n.title}
            </span>
            {n.body ? <span className="mt-0.5 block truncate text-sm text-muted">{n.body}</span> : null}
            <span className="mt-0.5 block text-xs text-subtle">
              <LocalDateTime value={n.createdAt} />
            </span>
          </span>
        </a>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          <>
            Only things aimed at you. Email: {PACE_LABEL[prefs.pace].toLowerCase()}.{' '}
            <Link href="/settings#notifications" className="font-medium text-accent underline underline-offset-2">
              Change in Settings
            </Link>
          </>
        }
        actions={
          unread.length ? (
            <form action={markAllReadAction}>
              <Button type="submit" tone="secondary">
                Mark all as read
              </Button>
            </form>
          ) : null
        }
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing yet"
            description="When someone gives you a task, messages you, or @mentions you, it shows up here."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">
              New <span className="font-normal text-muted">({unread.length})</span>
            </h2>
            {unread.length ? (
              <ul className="divide-y divide-line">{unread.map(row)}</ul>
            ) : (
              <p className="px-5 py-4 text-sm text-muted">You are all caught up.</p>
            )}
          </Card>
          {earlier.length ? (
            <Card>
              <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">Earlier</h2>
              <ul className="divide-y divide-line">{earlier.map(row)}</ul>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
