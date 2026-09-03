import JSZip from 'jszip';
import { sourceLabel, type UpdateSection } from './research-update';

/**
 * Writes a real .pptx (Office Open XML) with no rendering service involved.
 *
 * The deck is deliberately plain: a title slide plus one slide per section,
 * each stamped with where its text came from. Researchers restyle it in
 * PowerPoint; LabFlow's job is to get the content out accurately.
 */

const EMU_PER_INCH = 914_400;
const SLIDE_W = Math.round(13.333 * EMU_PER_INCH); // 16:9
const SLIDE_H = Math.round(7.5 * EMU_PER_INCH);

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One <a:p> per line; empty lines still need a paragraph to keep spacing. */
function paragraphs(text: string, sizeHundredths: number, colour: string): string {
  const lines = text.split('\n');
  return lines
    .map((line) => {
      const run = line.trim()
        ? `<a:r><a:rPr lang="en-US" sz="${sizeHundredths}" dirty="0"><a:solidFill><a:srgbClr val="${colour}"/></a:solidFill></a:rPr><a:t>${esc(line)}</a:t></a:r>`
        : '';
      return `<a:p><a:pPr/>${run}</a:p>`;
    })
    .join('');
}

function textBox(
  id: number,
  name: string,
  box: { x: number; y: number; cx: number; cy: number },
  body: string,
): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`;
}

/** A picture shape referencing an image relationship on the same slide. */
function picture(
  id: number,
  relId: string,
  box: { x: number; y: number; cx: number; cy: number },
): string {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Chart"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

function slideXml(
  title: string,
  body: string,
  footer: string | null,
  imageRelId?: string,
): string {
  const margin = Math.round(0.9 * EMU_PER_INCH);
  const width = SLIDE_W - margin * 2;
  // With a chart the text sits above it and the image takes the lower half.
  const bodyHeight = imageRelId ? 1.3 : 4.6;
  const shapes = [
    textBox(2, 'Title', { x: margin, y: Math.round(0.7 * EMU_PER_INCH), cx: width, cy: Math.round(1 * EMU_PER_INCH) }, paragraphs(title, 3200, '111827')),
    textBox(3, 'Body', { x: margin, y: Math.round(1.9 * EMU_PER_INCH), cx: width, cy: Math.round(bodyHeight * EMU_PER_INCH) }, paragraphs(body, 1600, '374151')),
  ];
  if (imageRelId) {
    shapes.push(
      picture(5, imageRelId, {
        x: margin,
        y: Math.round(3.3 * EMU_PER_INCH),
        cx: width,
        // 2:1, matching renderChartPng's default 960x480.
        cy: Math.round(width / 2),
      }),
    );
  }
  if (footer) {
    shapes.push(
      textBox(4, 'Attribution', { x: margin, y: Math.round(6.6 * EMU_PER_INCH), cx: width, cy: Math.round(0.4 * EMU_PER_INCH) }, paragraphs(footer, 1100, '6B7280')),
    );
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="LabFlow"><a:themeElements><a:clrScheme name="LabFlow"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="111827"/></a:dk2><a:lt2><a:srgbClr val="F6F7F9"/></a:lt2><a:accent1><a:srgbClr val="254EA8"/></a:accent1><a:accent2><a:srgbClr val="16805C"/></a:accent2><a:accent3><a:srgbClr val="B0740C"/></a:accent3><a:accent4><a:srgbClr val="BE2F2F"/></a:accent4><a:accent5><a:srgbClr val="5B6474"/></a:accent5><a:accent6><a:srgbClr val="8B93A1"/></a:accent6><a:hlink><a:srgbClr val="254EA8"/></a:hlink><a:folHlink><a:srgbClr val="5B6474"/></a:folHlink></a:clrScheme><a:fontScheme name="LabFlow"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="LabFlow"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

const SLIDE_MASTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;

const SLIDE_LAYOUT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

export type DeckInput = {
  title: string;
  subtitle: string;
  sections: UpdateSection[];
  /** Optional chart appended as its own slide, e.g. from renderChartPng. */
  chart?: { png: Buffer; heading: string; caption: string } | null;
};

export async function buildPptx(input: DeckInput): Promise<Buffer> {
  const chartRelId = 'rId2';
  const slides: { xml: string; image?: Buffer }[] = [
    { xml: slideXml(input.title, input.subtitle, 'Generated by LabFlow from the experiment record.') },
    ...input.sections.map((section) => ({
      xml: slideXml(section.heading, section.body, sourceLabel[section.source]),
    })),
  ];
  if (input.chart) {
    slides.push({
      xml: slideXml(input.chart.heading, input.chart.caption, 'Plotted from the uploaded data', chartRelId),
      image: input.chart.png,
    });
  }

  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides
      .map(
        (_, i) =>
          `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      )
      .join('')}</Types>`,
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
  );

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`)
      .join('')}</p:sldIdLst><p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/></p:presentation>`,
  );

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>${slides
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
      )
      .join('')}</Relationships>`,
  );

  zip.file('ppt/theme/theme1.xml', THEME);
  zip.file('ppt/slideMasters/slideMaster1.xml', SLIDE_MASTER);
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
  );
  zip.file('ppt/slideLayouts/slideLayout1.xml', SLIDE_LAYOUT);
  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
  );

  slides.forEach((slide, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slide.xml);
    let rels =
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>';
    if (slide.image) {
      zip.file(`ppt/media/image${i + 1}.png`, slide.image);
      rels += `<Relationship Id="${chartRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.png"/>`;
    }
    zip.file(
      `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
    );
  });

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
