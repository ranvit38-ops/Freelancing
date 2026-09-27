import JSZip from 'jszip';

/**
 * A plain Word document from the little markdown Labvia documents use:
 * headings, paragraphs, bullet and numbered lines, bold and italics.
 *
 * Deliberately minimal. Professors open Word; they do not open .md files, and
 * a document that arrives as something they can edit is the difference
 * between it being read and not.
 */

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function runs(text: string, base: { bold?: boolean; size?: number } = {}): string {
  const parts: string[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0;
  const run = (t: string, bold = false, italic = false, mono = false) => {
    if (!t) return;
    const props = [
      bold || base.bold ? '<w:b/>' : '',
      italic ? '<w:i/>' : '',
      mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : '',
      base.size ? `<w:sz w:val="${base.size}"/>` : '',
    ].join('');
    parts.push(`<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r>`);
  };
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    run(text.slice(last, at));
    const token = m[0];
    if (token.startsWith('**')) run(token.slice(2, -2), true);
    else if (token.startsWith('`')) run(token.slice(1, -1), false, false, true);
    else run(token.slice(1, -1), false, true);
    last = at + token.length;
  }
  run(text.slice(last));
  return parts.join('');
}

export function markdownToDocumentXml(title: string, markdown: string): string {
  const paragraphs: string[] = [`<w:p>${runs(title, { bold: true, size: 36 })}</w:p>`];
  let number = 0;
  for (const line of markdown.replace(/\r/g, '').split('\n')) {
    const heading = /^\s*(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      number = 0;
      const size = heading[1]!.length === 1 ? 32 : heading[1]!.length === 2 ? 28 : 24;
      paragraphs.push(`<w:p>${runs(heading[2]!, { bold: true, size })}</w:p>`);
    } else if (bullet) {
      number = 0;
      paragraphs.push(`<w:p><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr>${runs(`• ${bullet[1]}`)}</w:p>`);
    } else if (numbered) {
      number += 1;
      paragraphs.push(`<w:p><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr>${runs(`${number}. ${numbered[1]}`)}</w:p>`);
    } else if (line.trim() === '') {
      number = 0;
      paragraphs.push('<w:p/>');
    } else {
      paragraphs.push(`<w:p>${runs(line)}</w:p>`);
    }
  }
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body>` +
    '</w:document>'
  );
}

export async function markdownToDocx(title: string, markdown: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.file('word/document.xml', markdownToDocumentXml(title, markdown));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
