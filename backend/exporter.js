/**
 * PathGuru Publishers — PDF Exporter  (Phase 3 Complete)
 *
 * Pipeline:
 *   1. Playwright renders HTML → raw PDF bytes (full CSS layout, Google Fonts)
 *   2. pdf-lib post-processes the PDF bytes:
 *      a. Document metadata (Title, Author, Subject, Keywords, Creator, XMP)
 *      b. PDF outline/bookmarks — navigable on Kindle
 *      c. Page labels (roman i,ii,iii for frontmatter; 1,2,3 for content)
 *      d. Viewer preferences (fit-width, display title, open to outline)
 *      e. Colour profile / OutputIntent (sRGB for KDP digital)
 *      f. Document ID pair for print production tracking
 *   3. Returns final production-ready PDF buffer
 */

import { chromium }     from 'playwright';
import { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, PDFBool, PDFNumber } from 'pdf-lib';
import { randomBytes }  from 'node:crypto';

/* ── Primary export ─────────────────────────────────── */
export async function exportToPdf(html, project, manuscript, renderReport) {
  const raw   = await renderWithPlaywright(html, project);
  const final = await postProcessPdf(raw, project, manuscript);
  return final;
}

/* ── Step 1: Playwright render ──────────────────────── */
async function renderWithPlaywright(html, project) {
  const kdp   = project?.kdpProfile || {};
  const pageW = kdp.pageWidthIn  || 6;
  const pageH = kdp.pageHeightIn || 9;

  let browser;
  try {
    browser = await chromium.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--font-render-hinting=none',
        '--disable-font-subpixel-positioning',
        '--force-color-profile=srgb',
      ],
    });

    const page = await browser.newPage({
      viewport: { width: Math.round(pageW * 96), height: Math.round(pageH * 96) },
    });

    await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });

    // Wait for Google Fonts to fully paint
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(1800);

    const pdfBuffer = await page.pdf({
      width:             `${pageW}in`,
      height:            `${pageH}in`,
      printBackground:   true,
      margin:            { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
      tagged:            true,
      outline:           true,
    });

    return pdfBuffer;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/* ── Step 2: pdf-lib post-processing ───────────────── */
async function postProcessPdf(rawBuffer, project, manuscript) {
  const pdfDoc = await PDFDocument.load(rawBuffer, { ignoreEncryption: true });

  embedMetadata(pdfDoc, project, manuscript);
  await embedBookmarks(pdfDoc, manuscript);
  embedPageLabels(pdfDoc);
  embedViewerPreferences(pdfDoc);
  embedColorInfo(pdfDoc);
  embedDocumentId(pdfDoc);

  const finalBytes = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  return Buffer.from(finalBytes);
}

/* ── a. Metadata ────────────────────────────────────── */
function embedMetadata(pdfDoc, project, manuscript) {
  const title    = manuscript?.title    || project.title    || 'Untitled';
  const subtitle = manuscript?.subtitle || project.subtitle || '';
  const author   = project.author       || '';
  const publisher= project.publisher    || 'PathGuru Publishers';
  const keywords = [project.niche || '', project.audience || ''].filter(Boolean).join(', ');
  const fullTitle = subtitle ? `${title}: ${subtitle}` : title;

  pdfDoc.setTitle(fullTitle);
  pdfDoc.setAuthor(author);
  pdfDoc.setSubject(subtitle || title);
  if (keywords) pdfDoc.setKeywords([keywords]);
  pdfDoc.setProducer('PathGuru Publishers');
  pdfDoc.setCreator('PathGuru Publishers AI Publishing Suite v3');
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setModificationDate(new Date());

  // XMP metadata block
  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xe(fullTitle)}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${xe(author)}</rdf:li></rdf:Seq></dc:creator>
      <dc:publisher><rdf:Bag><rdf:li>${xe(publisher)}</rdf:li></rdf:Bag></dc:publisher>
      <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xe(project.copyright||'')}</rdf:li></rdf:Alt></dc:rights>
      <xmp:CreatorTool>PathGuru Publishers v3</xmp:CreatorTool>
      <xmp:CreateDate>${new Date().toISOString()}</xmp:CreateDate>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  try {
    const ctx      = pdfDoc.context;
    const catalog  = pdfDoc.catalog;
    const metaStr  = ctx.flateStream(Buffer.from(xmp, 'utf8'));
    metaStr.dict.set(PDFName.of('Type'),    PDFName.of('Metadata'));
    metaStr.dict.set(PDFName.of('Subtype'), PDFName.of('XML'));
    catalog.set(PDFName.of('Metadata'), ctx.register(metaStr));
  } catch {}
}

/* ── b. Bookmarks ───────────────────────────────────── */
async function embedBookmarks(pdfDoc, manuscript) {
  try {
    const sections   = manuscript?.sections || [];
    const pages      = pdfDoc.getPages();
    if (!pages.length || !sections.length) return;

    const chapters = sections.filter(s =>
      ['chapter','section','introduction','intro','conclusion'].includes(
        (s.designIntent?.layout || s.type || '').toLowerCase()
      )
    );
    if (!chapters.length) return;

    const total      = pages.length;
    const frontPages = Math.min(3, total);
    const bodyPages  = total - frontPages;
    const perChapter = Math.max(1, Math.floor(bodyPages / chapters.length));

    const ctx        = pdfDoc.context;
    const catalog    = pdfDoc.catalog;
    const rootRef    = ctx.nextRef();
    const itemRefs   = chapters.map(() => ctx.nextRef());

    chapters.forEach((ch, i) => {
      const pageIdx = Math.min(frontPages + i * perChapter, total - 1);
      const page    = pages[pageIdx];

      const dest = PDFArray.withContext(ctx);
      dest.push(page.ref);
      dest.push(PDFName.of('FitH'));
      dest.push(PDFNumber.of(page.getHeight()));

      const itemDict = {
        Title:  PDFHexString.fromText(ch.title || `Chapter ${i + 1}`),
        Parent: rootRef,
        Dest:   dest,
      };
      if (i > 0)                    itemDict.Prev = itemRefs[i - 1];
      if (i < itemRefs.length - 1)  itemDict.Next = itemRefs[i + 1];

      ctx.assign(itemRefs[i], ctx.obj(itemDict));
    });

    ctx.assign(rootRef, ctx.obj({
      Type:  PDFName.of('Outlines'),
      First: itemRefs[0],
      Last:  itemRefs[itemRefs.length - 1],
      Count: PDFNumber.of(itemRefs.length),
    }));

    catalog.set(PDFName.of('Outlines'), rootRef);
    catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  } catch {}
}

/* ── c. Page labels ─────────────────────────────────── */
function embedPageLabels(pdfDoc) {
  try {
    const ctx      = pdfDoc.context;
    const catalog  = pdfDoc.catalog;
    const total    = pdfDoc.getPageCount();
    const front    = Math.min(3, total);

    const nums = PDFArray.withContext(ctx);
    // Pages 0..(front-1) → roman numerals
    nums.push(PDFNumber.of(0));
    nums.push(ctx.obj({ S: PDFName.of('r') }));
    // Pages front..end → arabic 1, 2, 3...
    if (front < total) {
      nums.push(PDFNumber.of(front));
      nums.push(ctx.obj({ S: PDFName.of('D'), St: PDFNumber.of(1) }));
    }
    catalog.set(PDFName.of('PageLabels'), ctx.obj({ Nums: nums }));
  } catch {}
}

/* ── d. Viewer preferences ──────────────────────────── */
function embedViewerPreferences(pdfDoc) {
  try {
    const ctx     = pdfDoc.context;
    const catalog = pdfDoc.catalog;

    catalog.set(PDFName.of('ViewerPreferences'), ctx.obj({
      FitWindow:         PDFBool.True,
      CenterWindow:      PDFBool.True,
      DisplayDocTitle:   PDFBool.True,
      NonFullScreenPageMode: PDFName.of('UseOutlines'),
      Direction:         PDFName.of('L2R'),
    }));

    // Open action — fit width on first page
    const firstPage = pdfDoc.getPage(0);
    const openDest  = PDFArray.withContext(ctx);
    openDest.push(firstPage.ref);
    openDest.push(PDFName.of('FitH'));
    openDest.push(PDFNumber.of(firstPage.getHeight()));
    catalog.set(PDFName.of('OpenAction'), openDest);
  } catch {}
}

/* ── e. Colour profile ──────────────────────────────── */
function embedColorInfo(pdfDoc) {
  try {
    const ctx    = pdfDoc.context;
    const intent = ctx.obj({
      Type:  PDFName.of('OutputIntent'),
      S:     PDFName.of('GTS_PDFA1'),
      OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
      RegistryName: PDFString.of('http://www.color.org'),
      Info:  PDFString.of('sRGB'),
    });
    const arr = PDFArray.withContext(ctx);
    arr.push(ctx.register(intent));
    pdfDoc.catalog.set(PDFName.of('OutputIntents'), arr);
  } catch {}
}

/* ── f. Document ID ─────────────────────────────────── */
function embedDocumentId(pdfDoc) {
  try {
    const ctx = pdfDoc.context;
    const arr = PDFArray.withContext(ctx);
    arr.push(PDFHexString.of(randomBytes(16).toString('hex').toUpperCase()));
    arr.push(PDFHexString.of(randomBytes(16).toString('hex').toUpperCase()));
    ctx.trailerInfo.ID = arr;
  } catch {}
}

function xe(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
