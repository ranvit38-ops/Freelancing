import { describe, expect, it } from 'vitest';
import { fileKind, fileTag, previewRows } from './file-kind';

describe('fileKind', () => {
  it('knows what each file can be shown as', () => {
    expect(fileKind('gel.PNG')).toBe('image');
    expect(fileKind('protocol.pdf')).toBe('pdf');
    expect(fileKind('run.xlsx')).toBe('table');
    expect(fileKind('notes.docx')).toBe('text');
    expect(fileKind('page.html')).toBe('other');
    expect(fileKind('README')).toBe('other');
    expect(fileTag('a.jpeg')).toBe('JPEG');
    expect(fileTag('noext')).toBe('FILE');
  });

  it('turns the start of a sheet into rows', () => {
    expect(previewRows('a,b\n1,2\n\n3,4', 2)).toEqual([['a', 'b'], ['1', '2']]);
    expect(previewRows('a\tb,c\n1\t2')).toEqual([['a', 'b,c'], ['1', '2']]);
  });
});
