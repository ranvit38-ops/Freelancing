/**
 * External link attachments.
 *
 * LabFlow stores the link, it does not sync the file. Reading a private Drive
 * document needs OAuth and a Google Cloud project per deployment; almost every
 * lab file is private, so the sync would fail for the common case. Keeping the
 * link beside the experiment gets the value — "where is that file" — with no
 * setup at all.
 */

export type LinkInfo = {
  url: string;
  provider: string;
  /** Human label when the URL alone is unreadable. */
  suggestedName: string;
};

export class InvalidLinkError extends Error {}

const PROVIDERS: { host: RegExp; provider: string; label: string }[] = [
  { host: /(^|\.)drive\.google\.com$/, provider: 'google-drive', label: 'Google Drive' },
  { host: /(^|\.)docs\.google\.com$/, provider: 'google-docs', label: 'Google Docs' },
  { host: /(^|\.)dropbox\.com$/, provider: 'dropbox', label: 'Dropbox' },
  { host: /(^|\.)onedrive\.live\.com$/, provider: 'onedrive', label: 'OneDrive' },
  { host: /(^|\.)sharepoint\.com$/, provider: 'onedrive', label: 'SharePoint' },
  { host: /(^|\.)notion\.so$/, provider: 'notion', label: 'Notion' },
  { host: /(^|\.)github\.com$/, provider: 'github', label: 'GitHub' },
  { host: /(^|\.)figshare\.com$/, provider: 'figshare', label: 'figshare' },
  { host: /(^|\.)zenodo\.org$/, provider: 'zenodo', label: 'Zenodo' },
];

/** Google file ids appear as /d/<id>/ or ?id=<id>. */
export function googleFileId(url: string): string | null {
  return url.match(/\/d\/([A-Za-z0-9_-]{10,})/)?.[1] ?? new URL(url).searchParams.get('id');
}

export function parseLink(raw: string): LinkInfo {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidLinkError('That does not look like a link. Include https://');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new InvalidLinkError('Only http and https links can be attached.');
  }

  const match = PROVIDERS.find((p) => p.host.test(url.hostname));
  const provider = match?.provider ?? 'web';

  // Prefer the last meaningful path segment; fall back to the host. Drops
  // Google's trailing UI verbs (/view, /edit) and opaque file ids.
  const NOISE = /^(d|w|u|v|view|edit|preview|about|open|file|s|scl)$/i;
  const segment = url.pathname
    .split('/')
    .filter((part) => part && !NOISE.test(part) && !/^[A-Za-z0-9_-]{20,}$/.test(part))
    .pop();
  const decoded = segment ? decodeURIComponent(segment).replace(/[-_+]/g, ' ') : '';
  const suggestedName = decoded || (match ? `${match.label} item` : url.hostname);

  return { url: url.toString(), provider, suggestedName };
}

export const providerLabel: Record<string, string> = Object.fromEntries([
  ...PROVIDERS.map((p) => [p.provider, p.label]),
  ['web', 'Link'],
]);
