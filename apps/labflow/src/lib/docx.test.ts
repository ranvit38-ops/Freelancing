import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { markdownToDocumentXml, markdownToDocx } from './docx';

describe('markdownToDocx', () => {
  it('produces a Word package with the three parts Word needs', async () => {
    const zip = await JSZip.loadAsync(await markdownToDocx('Plan', 'Hello'));
    expect(Object.keys(zip.files).sort()).toEqual(['[Content_Types].xml', '_rels/', '_rels/.rels', 'word/', 'word/document.xml']);
  });

  it('turns headings, bullets and bold into Word formatting', () => {
    const xml = markdownToDocumentXml('Gel protocol', '## Loading\n- **10 µL** per well\n1. Run');
    expect(xml).toContain('Gel protocol');
    expect(xml).toContain('<w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">Loading');
    expect(xml).toContain('• ');
    expect(xml).toMatch(/<w:b\/><\/w:rPr><w:t xml:space="preserve">10 µL<\/w:t>/);
    expect(xml).toContain('1. ');
  });

  it('escapes characters that would break the XML', () => {
    expect(markdownToDocumentXml('A & B', 'x < y > z')).toContain('x &lt; y &gt; z');
  });
});
