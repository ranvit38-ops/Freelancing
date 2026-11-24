/**
 * How a file can be shown without downloading it. One answer for the hover
 * preview, the file page and the thumbnails, so they never disagree.
 */
export type FileKind = 'image' | 'pdf' | 'video' | 'table' | 'text' | 'other';

const KINDS: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  pdf: 'pdf',
  mp4: 'video', m4v: 'video', webm: 'video', mov: 'video',
  csv: 'table', tsv: 'table', xlsx: 'table',
  txt: 'text', md: 'text', json: 'text', docx: 'text', pptx: 'text',
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

export function fileKind(filename: string): FileKind {
  return KINDS[extensionOf(filename)] ?? 'other';
}

/** The short tag on a file's icon: PDF, DOCX, CSV. */
export function fileTag(filename: string): string {
  return extensionOf(filename).slice(0, 4).toUpperCase() || 'FILE';
}

/** A table preview from extracted text: the first rows, split on tabs or commas. */
export function previewRows(text: string, rows = 8, cols = 8): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, rows);
  const tabbed = lines.some((l) => l.includes('\t'));
  return lines.map((l) => (tabbed ? l.split('\t') : l.split(',')).slice(0, cols).map((c) => c.trim().replace(/^"|"$/g, '')));
}
