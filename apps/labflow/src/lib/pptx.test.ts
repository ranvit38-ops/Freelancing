import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildPptx } from './pptx';
import type { UpdateSection } from './research-update';

const sections: UpdateSection[] = [
  { heading: 'Results', body: 'EXP-004: Breakthrough at 34 BV\nEXP-005: 58 BV', source: 'researcher' },
  { heading: 'Conditions', body: 'Temperature: 25 °C → 30 °C', source: 'record' },
];

describe('buildPptx', () => {
  it('writes a zip containing one slide per section plus a title slide', async () => {
    const zip = await JSZip.loadAsync(await buildPptx({ title: 'T', subtitle: 'S', sections }));
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slides).toHaveLength(sections.length + 1);
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(zip.file('ppt/presentation.xml')).not.toBeNull();
    expect(zip.file('ppt/slideMasters/slideMaster1.xml')).not.toBeNull();
  });

  it('carries the section text and its attribution into the slide', async () => {
    const zip = await JSZip.loadAsync(await buildPptx({ title: 'T', subtitle: 'S', sections }));
    const slide = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(slide).toContain('Breakthrough at 34 BV');
    expect(slide).toContain('Researcher');
  });

  it('escapes XML metacharacters instead of producing broken markup', async () => {
    const zip = await JSZip.loadAsync(
      await buildPptx({
        title: 'A & B <script>',
        subtitle: '"quoted"',
        sections: [{ heading: 'H', body: 'x < y & z', source: 'record' }],
      }),
    );
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slide).toContain('A &amp; B &lt;script&gt;');
    expect(slide).not.toContain('<script>');
  });

  it('produces a deck even with no sections', async () => {
    const zip = await JSZip.loadAsync(await buildPptx({ title: 'T', subtitle: 'S', sections: [] }));
    expect(zip.file('ppt/slides/slide1.xml')).not.toBeNull();
  });
});
