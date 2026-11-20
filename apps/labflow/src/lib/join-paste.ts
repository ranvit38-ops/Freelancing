/**
 * Where a pasted join link or invitation should go.
 *
 * People paste whatever they were sent: the whole link, the link with chat
 * punctuation around it, or just the code off the end. Any of those lands on
 * the join page, which says plainly if it is not valid. Null when there is
 * nothing that could be one.
 */
export function joinPathFromPaste(raw: string): string | null {
  const text = raw.trim().replace(/^[<("'\s]+|[>)"'.,;\s]+$/g, '');
  if (!text) return null;
  const url = (() => {
    try {
      // "labquill.app/join?code=…" arrives without its https:// often enough.
      return new URL(text.includes('://') ? text : `https://${text.replace(/^\/+/, '')}`);
    } catch {
      return null;
    }
  })();
  const code = url?.searchParams.get('code');
  if (code) return `/join?code=${encodeURIComponent(code)}`;
  const token = url?.searchParams.get('token');
  if (token) return `/join?token=${encodeURIComponent(token)}`;
  // A bare code: the base64url characters a join code is made of, and long
  // enough to be one (findWorkspaceByJoinCode refuses anything shorter).
  if (/^[A-Za-z0-9_-]{16,}$/.test(text)) return `/join?code=${encodeURIComponent(text)}`;
  return null;
}
