import JSZip from 'jszip';
import { decodeXml, readXlsxGrid } from '@/lib/xlsx';

/**
 * The words inside an uploaded file, so LabBot can answer from what a
 * protocol or a results sheet actually says rather than from its name.
 *
 * Plain text, CSV, Excel, Word and PowerPoint are read here. PDFs are not:
 * they go to the model as documents, which reads them itself, figures
 * included. Images and video have no text to pull out.
 */

/** Characters kept per file: a protocol's substance, not a thesis. */
export const MAX_FILE_CHARS = 8000;

const TEXT = new Set(['txt', 'md', 'csv', 'tsv', 'json']);

function extensionOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export function canExtractText(filename: string): boolean {
  const ext = extensionOf(filename);
  return TEXT.has(ext) || ext === 'xlsx' || ext === 'docx' || ext === 'pptx';
}

function paragraphsOf(xml: string, paragraphTag: string, textTag: string): string {
  return xml
    .split(new RegExp(`</${paragraphTag}>`))
    .map((chunk) =>
      [...chunk.matchAll(new RegExp(`<${textTag}(?:\\s[^>]*)?>([^<]*)</${textTag}>`, 'g'))]
        .map((m) => decodeXml(m[1] ?? ''))
        .join(''),
    )
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

async function extract(filename: string, bytes: Buffer): Promise<string | null> {
  const ext = extensionOf(filename);
  if (TEXT.has(ext)) return bytes.toString('utf8');
  if (ext === 'xlsx') {
    const grid = await readXlsxGrid(bytes);
    return grid
      .slice(0, 200)
      .map((row) => row.join('\t'))
      .join('\n');
  }
  if (ext === 'docx') {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml')?.async('string');
    return xml ? paragraphsOf(xml, 'w:p', 'w:t') : null;
  }
  if (ext === 'pptx') {
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => Number(a.match(/\d+/g)!.pop()) - Number(b.match(/\d+/g)!.pop()));
    const texts = await Promise.all(slides.map((name) => zip.file(name)!.async('string')));
    return texts.map((xml, i) => `Slide ${i + 1}: ${paragraphsOf(xml, 'a:p', 'a:t')}`).join('\n');
  }
  return null;
}

/**
 * Reading a file out of storage and unzipping it costs more than asking the
 * question, and the same protocol is asked about again and again, so the text
 * is kept. Keyed by storage key, which never changes for a given upload.
 */
const cache = new Map<string, string | null>();
const CACHE_LIMIT = 300;

export async function fileText(
  storageKey: string,
  filename: string,
  read: (key: string) => Promise<Buffer>,
): Promise<string | null> {
  if (cache.has(storageKey)) return cache.get(storageKey)!;
  let text: string | null = null;
  try {
    const raw = await extract(filename, await read(storageKey));
    text = raw ? raw.replace(/\u0000/g, '').slice(0, MAX_FILE_CHARS) : null;
  } catch {
    // A corrupt or password-protected file simply has no readable text.
    text = null;
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(storageKey, text);
  return text;
}
