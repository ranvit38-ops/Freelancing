import JSZip from 'jszip';

/**
 * What an uploaded file really is, read from its bytes, never from its name or
 * from the type the browser claimed.
 *
 * A file is accepted only when its contents match its extension: a .png must
 * start like a PNG, a .docx must be a Word document inside, a .csv must be
 * text. Anything else is refused with a reason, which catches a program or a
 * web page renamed to look like data, and files cut short or damaged on the
 * way. The type stored and served is then this module's, not the uploader's.
 *
 * This is not a virus scanner. It cannot tell a harmless spreadsheet from one
 * whose numbers are wrong; it can tell a spreadsheet from something else.
 */

export type FileVerdict = { ok: true; contentType: string } | { ok: false; reason: string };

const startsWith = (b: Buffer, bytes: number[], at = 0) => bytes.every((v, i) => b[at + i] === v);
const ascii = (b: Buffer, text: string, at = 0) => b.subarray(at, at + text.length).toString('latin1') === text;

/** Things that are never data, whatever they are called. */
function looksLikeProgram(b: Buffer): string | null {
  if (ascii(b, 'MZ')) return 'a Windows program';
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return 'a Linux program';
  if (startsWith(b, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(b, [0xfe, 0xed, 0xfa, 0xcf]) || startsWith(b, [0xca, 0xfe, 0xba, 0xbe])) {
    return 'a Mac program';
  }
  if (ascii(b, '#!')) return 'a script';
  return null;
}

/** Text that a browser would treat as a page or script if it ever rendered it. */
function looksLikeMarkup(text: string): boolean {
  const head = text.slice(0, 2048).trimStart().toLowerCase();
  return /^(<!doctype html|<html|<script|<svg|<\?xml[^>]*>\s*<svg|<iframe|<object|<embed)/.test(head);
}

const TEXT_TYPES: Record<string, string> = {
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  json: 'application/json',
};

function checkText(ext: string, b: Buffer): FileVerdict {
  // A NUL byte never appears in real text, and always in a binary file.
  if (b.includes(0)) return { ok: false, reason: 'is not text inside, so it is not really a text file' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    // Not UTF-8. Older spreadsheets export Latin-1; accept that while it is
    // still printable text, and nothing else.
    text = b.toString('latin1');
    if (/[\x01-\x08\x0e-\x1f\x7f]/.test(text)) return { ok: false, reason: 'is not readable text' };
  }
  if (looksLikeMarkup(text)) return { ok: false, reason: 'contains a web page or script, not data' };
  if (ext === 'json') {
    try {
      JSON.parse(text);
    } catch {
      return { ok: false, reason: 'is not valid JSON; it may be cut short or damaged' };
    }
  }
  return { ok: true, contentType: TEXT_TYPES[ext]! };
}

/** The part each Office format must contain to be that format. */
const OFFICE: Record<string, { main: string; type: string }> = {
  xlsx: { main: 'xl/workbook.xml', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  docx: { main: 'word/document.xml', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pptx: { main: 'ppt/presentation.xml', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
};

/** Unpacked, no Office file a lab produces comes near this; a zip bomb does. */
const MAX_UNZIPPED_BYTES = 500 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10_000;

async function checkOffice(ext: string, b: Buffer, maxUnzipped: number): Promise<FileVerdict> {
  const spec = OFFICE[ext]!;
  if (!startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return { ok: false, reason: `is not a real .${ext} file inside` };
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(b);
  } catch {
    return { ok: false, reason: 'is damaged or cut short and cannot be opened' };
  }
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ZIP_ENTRIES) return { ok: false, reason: 'holds an implausible number of parts' };
  let unzipped = 0;
  for (const entry of entries) {
    // Sizes as declared in the archive, read without unpacking anything.
    unzipped += (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (entry.name.includes('..') || entry.name.startsWith('/')) return { ok: false, reason: 'contains a suspicious path' };
  }
  if (unzipped > maxUnzipped) return { ok: false, reason: 'expands to far more than its size; it looks like a zip bomb' };
  if (!zip.file('[Content_Types].xml') || !zip.file(spec.main)) {
    return { ok: false, reason: `is not a real .${ext} file inside` };
  }
  // Macros belong in .xlsm, .docm and .pptm, which are not accepted at all.
  if (entries.some((e) => /vbaProject\.bin$/i.test(e.name))) {
    return { ok: false, reason: 'contains macros. Save it without macros and upload it again' };
  }
  return { ok: true, contentType: spec.type };
}

function checkMedia(ext: string, b: Buffer): FileVerdict {
  const tail = b.subarray(Math.max(0, b.length - 64 * 1024));
  switch (ext) {
    case 'png':
      if (!startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return wrong(ext);
      return tail.includes('IEND') ? { ok: true, contentType: 'image/png' } : cutShort();
    case 'jpg':
    case 'jpeg':
      if (!startsWith(b, [0xff, 0xd8, 0xff])) return wrong(ext);
      return tail.includes(Buffer.from([0xff, 0xd9])) ? { ok: true, contentType: 'image/jpeg' } : cutShort();
    case 'gif':
      if (!ascii(b, 'GIF87a') && !ascii(b, 'GIF89a')) return wrong(ext);
      return { ok: true, contentType: 'image/gif' };
    case 'webp':
      return ascii(b, 'RIFF') && ascii(b, 'WEBP', 8) ? { ok: true, contentType: 'image/webp' } : wrong(ext);
    case 'tif':
    case 'tiff':
      return startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])
        ? { ok: true, contentType: 'image/tiff' }
        : wrong(ext);
    case 'pdf': {
      if (!b.subarray(0, 1024).includes('%PDF-')) return wrong(ext);
      return tail.includes('%%EOF') ? { ok: true, contentType: 'application/pdf' } : cutShort();
    }
    case 'xls':
      // The pre-2007 workbook container. Stored, never parsed, always downloaded.
      return startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
        ? { ok: true, contentType: 'application/vnd.ms-excel' }
        : wrong(ext);
    case 'mp4':
    case 'm4v':
      return ascii(b, 'ftyp', 4) ? { ok: true, contentType: 'video/mp4' } : wrong(ext);
    case 'mov':
      return ascii(b, 'ftyp', 4) || ascii(b, 'moov', 4) || ascii(b, 'wide', 4) || ascii(b, 'mdat', 4)
        ? { ok: true, contentType: 'video/quicktime' }
        : wrong(ext);
    case 'webm':
    case 'mkv':
      return startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])
        ? { ok: true, contentType: ext === 'webm' ? 'video/webm' : 'video/x-matroska' }
        : wrong(ext);
    case 'avi':
      return ascii(b, 'RIFF') && ascii(b, 'AVI ', 8) ? { ok: true, contentType: 'video/x-msvideo' } : wrong(ext);
    default:
      return { ok: false, reason: 'is not a kind of file Labquill accepts' };
  }
}

const wrong = (ext: string): FileVerdict => ({
  ok: false,
  reason: `is not really a .${ext} file: its contents are something else. It may be damaged, or renamed`,
});
const cutShort = (): FileVerdict => ({ ok: false, reason: 'is cut short or damaged; upload it again from the original' });

export async function inspectFile(
  filename: string,
  bytes: Buffer,
  /** Only tests lower it, to build a zip bomb without unpacking 500 MB. */
  maxUnzipped = MAX_UNZIPPED_BYTES,
): Promise<FileVerdict> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (bytes.length === 0) return { ok: false, reason: 'is empty' };
  const program = looksLikeProgram(bytes);
  if (program) return { ok: false, reason: `is ${program}, not a document or data` };
  if (ext in TEXT_TYPES) return checkText(ext, bytes);
  if (ext in OFFICE) return checkOffice(ext, bytes, maxUnzipped);
  return checkMedia(ext, bytes);
}

/** The type a stored file is served as, from its (already checked) extension. */
export function contentTypeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const known: Record<string, string> = {
    ...TEXT_TYPES,
    xlsx: OFFICE.xlsx!.type,
    docx: OFFICE.docx!.type,
    pptx: OFFICE.pptx!.type,
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    tif: 'image/tiff', tiff: 'image/tiff', pdf: 'application/pdf', xls: 'application/vnd.ms-excel',
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  };
  return known[ext] ?? 'application/octet-stream';
}
