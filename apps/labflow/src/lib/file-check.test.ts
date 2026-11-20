import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { contentTypeFor, inspectFile } from './file-check';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(40, 1),
  Buffer.from('IEND'),
  Buffer.from([0xae, 0x42, 0x60, 0x82]),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 7), Buffer.from([0xff, 0xd9])]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 0)]);

async function office(parts: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(parts)) zip.file(name, body);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
const workbook = { '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '<workbook/>' };

describe('inspectFile', () => {
  it('accepts real files, and types them from their contents, not the browser', async () => {
    expect(await inspectFile('gel.png', PNG)).toEqual({ ok: true, contentType: 'image/png' });
    expect(await inspectFile('photo.JPG', JPEG)).toEqual({ ok: true, contentType: 'image/jpeg' });
    expect(await inspectFile('protocol.pdf', PDF)).toEqual({ ok: true, contentType: 'application/pdf' });
    expect((await inspectFile('runs.xlsx', await office(workbook))).ok).toBe(true);
    expect(await inspectFile('runs.csv', Buffer.from('sample,value\nA,1\n'))).toEqual({ ok: true, contentType: 'text/csv; charset=utf-8' });
    expect((await inspectFile('old.csv', Buffer.from('caf\xe9,1\n', 'latin1'))).ok).toBe(true);
    expect((await inspectFile('data.json', Buffer.from('{"a":1}'))).ok).toBe(true);
  });

  it('refuses a program, whatever it is called', async () => {
    for (const name of ['gel.png', 'data.csv', 'notes.txt', 'paper.pdf']) {
      const verdict = await inspectFile(name, EXE);
      expect(verdict.ok).toBe(false);
    }
    expect(await inspectFile('run.txt', Buffer.from('#!/bin/sh\nrm -rf /\n'))).toMatchObject({ ok: false, reason: expect.stringMatching(/script/) });
  });

  it('refuses a file whose contents are not what its name says', async () => {
    expect(await inspectFile('gel.png', JPEG)).toMatchObject({ ok: false, reason: expect.stringMatching(/not really a \.png/) });
    expect(await inspectFile('paper.pdf', PNG)).toMatchObject({ ok: false });
    expect(await inspectFile('runs.xlsx', PDF)).toMatchObject({ ok: false });
    // A Word document renamed to .xlsx is a zip, but not a workbook.
    const doc = await office({ '[Content_Types].xml': '<Types/>', 'word/document.xml': '<document/>' });
    expect(await inspectFile('runs.xlsx', doc)).toMatchObject({ ok: false, reason: expect.stringMatching(/not a real \.xlsx/) });
  });

  it('refuses web pages and scripts dressed as data', async () => {
    expect(await inspectFile('data.csv', Buffer.from('<html><script>steal()</script></html>'))).toMatchObject({ ok: false, reason: expect.stringMatching(/web page/) });
    expect(await inspectFile('notes.txt', Buffer.from('  <svg onload="alert(1)"></svg>'))).toMatchObject({ ok: false });
    expect(await inspectFile('notes.md', Buffer.from('<?xml version="1.0"?><svg/>'))).toMatchObject({ ok: false });
  });

  it('refuses damaged and cut-short files', async () => {
    expect(await inspectFile('gel.png', PNG.subarray(0, 30))).toMatchObject({ ok: false, reason: expect.stringMatching(/cut short/) });
    expect(await inspectFile('photo.jpg', JPEG.subarray(0, 20))).toMatchObject({ ok: false });
    expect(await inspectFile('paper.pdf', PDF.subarray(0, 20))).toMatchObject({ ok: false });
    const zipped = await office(workbook);
    expect(await inspectFile('runs.xlsx', zipped.subarray(0, zipped.length - 30))).toMatchObject({ ok: false });
    expect(await inspectFile('data.json', Buffer.from('{"a":'))).toMatchObject({ ok: false, reason: expect.stringMatching(/JSON/) });
    expect(await inspectFile('data.csv', Buffer.from([0x41, 0x00, 0x42]))).toMatchObject({ ok: false });
    expect(await inspectFile('empty.csv', Buffer.alloc(0))).toMatchObject({ ok: false, reason: 'is empty' });
  });

  it('refuses macros and zip bombs', async () => {
    const macro = await office({ ...workbook, 'xl/vbaProject.bin': 'Sub Auto_Open()' });
    expect(await inspectFile('runs.xlsx', macro)).toMatchObject({ ok: false, reason: expect.stringMatching(/macros/) });
    const bomb = await office({ ...workbook, 'xl/huge.xml': 'a'.repeat(200_000) });
    expect(await inspectFile('runs.xlsx', bomb, 100_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/zip bomb/) });
    const escape = await office({ ...workbook, '../../etc/passwd': 'x' });
    expect(await inspectFile('runs.xlsx', escape)).toMatchObject({ ok: false });
  });

  it('serves stored files with a type from the checked extension', () => {
    expect(contentTypeFor('a.PNG')).toBe('image/png');
    expect(contentTypeFor('a.html')).toBe('application/octet-stream');
  });
});
