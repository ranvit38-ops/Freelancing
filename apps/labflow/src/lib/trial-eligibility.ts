/**
 * Who gets a trial.
 *
 * Be honest about what this is: a speed bump, not a wall. Anyone determined
 * can make another email address. What it stops is the easy loop, which is
 * what almost everyone actually does: sign up, run out, sign up again with a
 * plus-address or an extra dot.
 *
 * The wall, when you want one, is requiring a card to start the trial. That is
 * a Stripe setting, not code, and it costs signups. Until then this keeps the
 * honest majority honest and the free plan catches everyone else, which is the
 * point: an expired trial drops to free rather than locking anyone out.
 */

/**
 * One person, one identity.
 *
 * Gmail ignores dots and everything after a plus, so `a.b+trial2@gmail.com`
 * and `ab@gmail.com` deliver to the same inbox and must count as one person.
 * Plus-addressing is near-universal elsewhere, so it is stripped everywhere;
 * dots are only ignored by Google, so they are only stripped there.
 */
const DOT_INSENSITIVE = new Set(['gmail.com', 'googlemail.com']);

export function normaliseEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (DOT_INSENSITIVE.has(domain)) local = local.replaceAll('.', '');

  return `${local}@${domain}`;
}

/**
 * Throwaway inbox providers. A short list of the ones that actually show up:
 * an exhaustive list is unmaintainable and a long one starts refusing real
 * people, which costs more than the abuse it prevents.
 */
const DISPOSABLE = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'yopmail.com',
  'sharklasers.com',
  'trashmail.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
  'mintemail.com',
  'spamgourmet.com',
  'moakt.com',
  'emailondeck.com',
  'tempr.email',
  'mohmal.com',
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  return DISPOSABLE.has(domain);
}
