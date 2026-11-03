import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { canExtractText, fileText } from './file-text';

async function zip(files: Record<string, string>): Promise<Buffer> {
  const z = new JSZip();
  for (const [name, body] of Object.entries(files)) z.file(name, body);
  return z.generateAsync({ type: 'nodebuffer' });
}

describe('fileText', () => {
  it('reads the paragraphs of a Word document', async () => {
    const docx = await zip({
      'word/document.xml':
        '<w:document><w:body><w:p><w:r><w:t>Load 10 µL per well.</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Run at </w:t></w:r><w:r><w:t>120 V &amp; 45 min.</w:t></w:r></w:p></w:body></w:document>',
    });
    const text = await fileText('k-docx', 'gel-protocol.docx', async () => docx);
    expect(text).toBe('Load 10 µL per well.\nRun at 120 V & 45 min.');
  });

  it('reads PowerPoint slides in order', async () => {
    const pptx = await zip({
      'ppt/slides/slide10.xml': '<p:sld><a:p><a:r><a:t>Ten</a:t></a:r></a:p></p:sld>',
      'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Two</a:t></a:r></a:p></p:sld>',
    });
    expect(await fileText('k-pptx', 'group-meeting.pptx', async () => pptx)).toBe('Slide 1: Two\nSlide 2: Ten');
  });

  it('reads plain text and CSV as they are, and caches by storage key', async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return Buffer.from('well,od\nA1,0.5\n');
    };
    expect(await fileText('k-csv', 'plate.csv', read)).toBe('well,od\nA1,0.5\n');
    await fileText('k-csv', 'plate.csv', read);
    expect(reads).toBe(1);
  });

  it('returns nothing for a corrupt file instead of failing the question', async () => {
    expect(await fileText('k-bad', 'broken.docx', async () => Buffer.from('not a zip'))).toBeNull();
  });

  it('knows which files it can read', () => {
    expect(canExtractText('notes.MD')).toBe(true);
    expect(canExtractText('gel.png')).toBe(false);
    expect(canExtractText('paper.pdf')).toBe(false);
  });
});
