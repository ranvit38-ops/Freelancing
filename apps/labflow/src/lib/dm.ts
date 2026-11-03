/**
 * Direct-message conversation keys.
 *
 * A conversation between a set of people is named by their user ids, sorted
 * and joined with '.'. The same people always get the same key, so opening a
 * DM from someone's name, or from sharing them a file, lands in the one
 * thread they already have.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Most people in one direct conversation; past this it is a channel. */
export const MAX_DM_PEOPLE = 9;

export function dmKey(userIds: string[]): string {
  return [...new Set(userIds.map((id) => id.toLowerCase()))].sort().join('.');
}

/** The participants, or null if this is not a well-formed key. */
export function dmParticipants(key: string): string[] | null {
  const ids = key.split('.');
  if (ids.length < 2 || ids.length > MAX_DM_PEOPLE) return null;
  if (!ids.every((id) => UUID.test(id))) return null;
  // Only the canonical spelling is a key, so one conversation has one name.
  return dmKey(ids) === key ? ids : null;
}
