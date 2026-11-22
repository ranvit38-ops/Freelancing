/**
 * Who hears about what, and when an email is due. Pure, so the rules that
 * decide whether someone's inbox fills up are tested rather than hoped for.
 *
 * The rules, in plain words:
 * - Only things aimed at you notify you: a task given to you, a direct
 *   message, an @mention, a reply to you, a comment on your experiment or
 *   your task. General chatter in a channel never does.
 * - One message makes at most one notification per person, the most
 *   personal kind winning (a DM that also @mentions you is one DM).
 * - Email is a batch, never one per event: nothing is sent until an item has
 *   sat unread for a few minutes (if you are in the app you have seen it),
 *   then everything unread goes in one email, and the next cannot come
 *   sooner than the pace you chose (hourly or daily), or never.
 */

export const NOTIFY_KINDS = ['task', 'message', 'mention', 'reply', 'comment'] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

export const KIND_LABEL: Record<NotifyKind, string> = {
  task: 'A task is given to me',
  message: 'Someone sends me a direct message',
  mention: 'Someone @mentions me',
  reply: 'Someone replies to me',
  comment: 'Someone comments on my experiment or task',
};

export const PACES = { hourly: 60, daily: 24 * 60, off: Infinity } as const;
export type Pace = keyof typeof PACES;
export const PACE_LABEL: Record<Pace, string> = {
  hourly: 'At most one email an hour',
  daily: 'One email a day, at most',
  off: 'Never: I check the app',
};

export const isPace = (v: string): v is Pace => v === 'hourly' || v === 'daily' || v === 'off';
export const isKind = (v: string): v is NotifyKind => (NOTIFY_KINDS as readonly string[]).includes(v);
export const parseKinds = (v: string | null | undefined): NotifyKind[] => (v ?? '').split(',').map((k) => k.trim()).filter(isKind);

/** Most personal first: it wins when one message reaches someone two ways. */
const PRIORITY: NotifyKind[] = ['message', 'mention', 'reply', 'comment', 'task'];

type Member = { id: string; name: string | null };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * People named with @ in a message. "@Maya Rodriguez" always works; "@Maya"
 * works when only one Maya is in the lab, so a mention never lands on the
 * wrong person.
 */
export function mentionedIds(body: string, members: Member[]): string[] {
  const found = new Set<string>();
  const named = members.filter((m) => m.name?.trim());
  for (const m of named) {
    const full = m.name!.trim();
    if (new RegExp(`(^|[^\\w@])@${escape(full)}(?![\\w])`, 'i').test(body)) found.add(m.id);
  }
  const byFirst = new Map<string, Member[]>();
  for (const m of named) {
    const first = m.name!.trim().split(/\s+/)[0]!.toLowerCase();
    byFirst.set(first, [...(byFirst.get(first) ?? []), m]);
  }
  for (const [first, people] of byFirst) {
    if (people.length !== 1) continue;
    if (new RegExp(`(^|[^\\w@])@${escape(first)}(?![\\w])`, 'i').test(body)) found.add(people[0]!.id);
  }
  return [...found];
}

/** One notification per person for a message, the most personal reason winning. */
export function messageRecipients(input: {
  authorId: string;
  /** Everyone in a direct message, the author included. */
  dmPeople?: string[] | null;
  mentioned?: string[];
  parentAuthorId?: string | null;
  /** Whoever ran the experiment, or holds the task, the message is about. */
  ownerId?: string | null;
}): Map<string, NotifyKind> {
  const reasons = new Map<string, NotifyKind[]>();
  const add = (id: string | null | undefined, kind: NotifyKind) => {
    if (!id || id === input.authorId) return;
    reasons.set(id, [...(reasons.get(id) ?? []), kind]);
  };
  for (const id of input.dmPeople ?? []) add(id, 'message');
  for (const id of input.mentioned ?? []) add(id, 'mention');
  add(input.parentAuthorId, 'reply');
  add(input.ownerId, 'comment');
  const out = new Map<string, NotifyKind>();
  for (const [id, kinds] of reasons) out.set(id, PRIORITY.find((k) => kinds.includes(k))!);
  return out;
}

/** A short, readable excerpt for a notification line or an email. */
export function excerpt(body: string, max = 160): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Whether a batch email should go now.
 * Waits `delayMinutes` after the oldest unread item (someone in the app has
 * seen it by then), and leaves at least the pace window between emails.
 */
export function emailDue(input: { pace: Pace; lastEmailedAt: Date | null; oldestPending: Date | null; now: Date; delayMinutes: number }): boolean {
  if (input.pace === 'off' || !input.oldestPending) return false;
  if (input.now.getTime() - input.oldestPending.getTime() < input.delayMinutes * 60_000) return false;
  if (!input.lastEmailedAt) return true;
  return input.now.getTime() - input.lastEmailedAt.getTime() >= PACES[input.pace] * 60_000;
}

export type DigestItem = { labName: string; title: string; body: string | null; link: string; createdAt: Date };

const MAX_IN_EMAIL = 15;

/** The batch email: what happened, grouped by lab, each with its link. */
export function digestEmail(input: { name: string; items: DigestItem[]; settingsLink: string; pace: Pace }): { subject: string; text: string } {
  const first = input.name.trim().split(/\s+/)[0] || 'there';
  const items = [...input.items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const labs = [...new Set(items.map((i) => i.labName))];
  const only = items.length === 1 ? items[0]! : null;
  const subject = only
    ? only.title
    : `${items.length} things for you in ${labs.length === 1 ? labs[0] : `${labs.length} labs`} on Labquill`;
  const lines = [`Hi ${first},`, '', only ? 'This happened while you were away:' : `${items.length} things happened while you were away:`, ''];
  let shown = 0;
  for (const lab of labs) {
    if (labs.length > 1) lines.push(`${lab}`, '');
    for (const item of items.filter((i) => i.labName === lab)) {
      if (shown === MAX_IN_EMAIL) break;
      shown++;
      lines.push(`- ${item.title}`);
      if (item.body) lines.push(`  "${excerpt(item.body, 200)}"`);
      lines.push(`  ${item.link}`, '');
    }
  }
  if (items.length > shown) lines.push(`And ${items.length - shown} more in Labquill.`, '');
  lines.push(
    input.pace === 'daily'
      ? 'You get at most one of these a day, and only for things you have not already seen in the app.'
      : 'You get at most one of these an hour, and only for things you have not already seen in the app.',
    `Change what you are emailed about, or turn these off: ${input.settingsLink}`,
  );
  return { subject: subject.slice(0, 200), text: lines.join('\n') };
}
