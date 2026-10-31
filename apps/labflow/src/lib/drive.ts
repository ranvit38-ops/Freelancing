/**
 * Google Drive import, the parts that need no network.
 *
 * Google's own formats (Docs, Sheets, Slides) have no file behind them, so
 * they are exported to the Office equivalent on the way in: a Sheet becomes an
 * .xlsx Labquill can chart, a Doc a .docx LabBot can read.
 */

/** Google Sheets' own type, the one kind of file that can be linked and refreshed. */
export const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

const EXPORTS: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: 'pptx',
  },
  'application/vnd.google-apps.drawing': { mime: 'application/pdf', ext: 'pdf' },
};

export function driveExport(mimeType: string): { mime: string; ext: string } | null {
  return EXPORTS[mimeType] ?? null;
}

/** Google-native things that cannot be exported at all (folders, forms, sites). */
export function isUnimportable(mimeType: string): boolean {
  return mimeType.startsWith('application/vnd.google-apps.') && !EXPORTS[mimeType];
}

/** The name the imported copy gets, with the extension its content really has. */
export function importedName(name: string, mimeType: string): string {
  const exported = driveExport(mimeType);
  const clean = name.replace(/[\\/\u0000-\u001f]/g, ' ').trim().slice(0, 180) || 'Untitled';
  if (!exported) return clean;
  return clean.toLowerCase().endsWith(`.${exported.ext}`) ? clean : `${clean}.${exported.ext}`;
}

/**
 * The Cloud project number, which the file picker needs so the files a person
 * picks are granted to this app. It is the leading number of the OAuth client
 * id, so nobody has to find and paste it separately.
 */
export function driveAppId(clientId: string | undefined): string | null {
  const match = /^(\d+)-/.exec(clientId ?? '');
  return match ? match[1]! : null;
}

export const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;
