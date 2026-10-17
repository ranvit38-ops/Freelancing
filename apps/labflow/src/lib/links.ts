/**
 * External link attachments.
 *
 * LabLedger stores the link, it does not sync the file. Reading a private Drive
 * document needs OAuth and a Google Cloud project per deployment; almost every
 * lab file is private, so the sync would fail for the common case. Keeping the
 * link beside the experiment gets the value, "where is that file", with no
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
  { host: /(^|\.)(youtube\.com|youtu\.be)$/, provider: 'youtube', label: 'YouTube' },
  { host: /(^|\.)vimeo\.com$/, provider: 'vimeo', label: 'Vimeo' },
  { host: /(^|\.)doi\.org$/, provider: 'doi', label: 'DOI' },
];

/** YouTube video id from any of the link shapes people actually paste. */
export function youTubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const id =
    parsed.hostname.endsWith('youtu.be')
      ? parsed.pathname.slice(1)
      : (parsed.searchParams.get('v') ??
        parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ??
        null);
  return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
}

/** Embeddable player URL, or null when the link is not a video we can embed. */
export function embedUrl(url: string, provider: string): string | null {
  if (provider === 'youtube') {
    const id = youTubeId(url);
    // youtube-nocookie keeps a lab's viewing out of ad profiles.
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (provider === 'vimeo') {
    const id = new URL(url).pathname.split('/').filter(Boolean).pop();
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

const GOOGLE_EDITORS = {
  spreadsheets: { kind: 'sheet', label: 'Google Sheets', item: 'Google Sheet' },
  document: { kind: 'doc', label: 'Google Docs', item: 'Google Doc' },
  presentation: { kind: 'slides', label: 'Google Slides', item: 'Google Slides deck' },
} as const;

/**
 * A Google Sheet, Doc or Slides link as something that can be edited in
 * place: Google's own editor in a frame, with the person's own Google
 * sign-in and permissions. Nothing is copied into the lab; edits are Google's.
 */
export function googleEditor(
  url: string,
): { kind: 'sheet' | 'doc' | 'slides'; label: string; item: string; editUrl: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'docs.google.com') return null;
  const match = parsed.pathname.match(/^\/(spreadsheets|document|presentation)\/d\/([A-Za-z0-9_-]{10,})/);
  if (!match) return null;
  const editor = GOOGLE_EDITORS[match[1] as keyof typeof GOOGLE_EDITORS];
  return { ...editor, editUrl: `https://docs.google.com/${match[1]}/d/${match[2]}/edit` };
}

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
  const editor = googleEditor(url.toString());
  const provider = editor?.kind === 'sheet' ? 'google-sheets' : (match?.provider ?? 'web');

  // Prefer the last meaningful path segment; fall back to the host. Drops
  // Google's trailing UI verbs (/view, /edit) and opaque file ids.
  const NOISE = /^(d|w|u|v|view|edit|preview|about|open|file|s|scl|spreadsheets|document|presentation)$/i;
  const segment = url.pathname
    .split('/')
    .filter((part) => part && !NOISE.test(part) && !/^[A-Za-z0-9_-]{20,}$/.test(part))
    .pop();
  const decoded = segment ? decodeURIComponent(segment).replace(/[-_+]/g, ' ') : '';
  const suggestedName = decoded || editor?.item || (match ? `${match.label} item` : url.hostname);

  return { url: url.toString(), provider, suggestedName };
}

export const providerLabel: Record<string, string> = Object.fromEntries([
  ...PROVIDERS.map((p) => [p.provider, p.label]),
  ['google-sheets', 'Google Sheets'],
  ['web', 'Link'],
]);
