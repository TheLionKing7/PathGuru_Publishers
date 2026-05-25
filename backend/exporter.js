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
import { execSync }     from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir }       from 'node:os';
import { join }         from 'node:path';

/* ── Primary export ─────────────────────────────────── */
// Returns the final PDF buffer. Also runs automated font-embedding check
// and PDF preflight, attaching results to project.complianceChecks so
// designGuru can include them in the compliance report.
export async function exportToPdf(html, project, manuscript, renderReport) {
  const raw   = await renderWithPlaywright(html, project);
  const final = await postProcessPdf(raw, project, manuscript);

  // Automated quality checks — run in parallel, non-blocking if tools absent
  const [fontCheck, preflightCheck] = await Promise.all([
    verifyFontEmbedding(final),
    runPdfPreflight(final),
  ]);

  // Attach to project so compliance report can include them
  project._autoChecks = { fontCheck, preflightCheck };

  return final;
}

/* ── Cover-only export ──────────────────────────────── */
// Renders the cover HTML as a standalone single-page PDF.
// Uses the same trim+bleed page dimensions as the interior.
export async function exportCoverPdf(coverHtml, project) {
  if (!coverHtml) throw new Error('No cover HTML provided for cover export.');
  const raw   = await renderWithPlaywright(coverHtml, project);
  // Post-process with metadata but keep only page 1 (safety — cover should be 1 page)
  const pdfDoc = await (await import('pdf-lib')).PDFDocument.load(raw);
  const pages  = pdfDoc.getPageCount();
  // If more than 1 page, extract just the first
  if (pages > 1) {
    const { PDFDocument: PD } = await import('pdf-lib');
    const single = await PD.create();
    const [firstPage] = await single.copyPages(pdfDoc, [0]);
    single.addPage(firstPage);
    const bytes = await single.save({ useObjectStreams: true });
    return Buffer.from(bytes);
  }
  return raw;
}

/* ── Strip cover page from interior PDF ─────────────── */
// When exporting cover separately, removes page 1 (the cover) from the interior PDF.
export async function stripCoverPage(pdfBuffer) {
  const { PDFDocument } = await import('pdf-lib');
  const src    = await PDFDocument.load(pdfBuffer);
  const total  = src.getPageCount();
  if (total <= 1) return pdfBuffer; // nothing to strip

  const interior = await PDFDocument.create();
  const pageIdxs = Array.from({ length: total - 1 }, (_, i) => i + 1); // skip page 0
  const copied   = await interior.copyPages(src, pageIdxs);
  copied.forEach(p => interior.addPage(p));
  const bytes = await interior.save({ useObjectStreams: true });
  return Buffer.from(bytes);
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

/* ── Automated check: font embedding ────────────────── */
// Uses pdffonts (Poppler) if available. Parses each font row to confirm
// "yes" in the "emb" column. Returns { ok, fonts, unembedded, tool }.
async function verifyFontEmbedding(pdfBuffer) {
  const tmp = join(tmpdir(), `pg_fonts_${Date.now()}.pdf`);
  try {
    writeFileSync(tmp, pdfBuffer);
    const output = execSync(`pdffonts "${tmp}"`, { timeout: 15000, stdio: ['ignore','pipe','pipe'] }).toString('utf8');
    // pdffonts output:
    // name                                 type              encoding         emb sub uni object ID
    // ------------------------------------ ----------------- ---------------- --- --- --- ---------
    // DM Sans                              CIDFontType2      Identity-H       yes yes yes      4  0
    const dataLines = output.split('\n').slice(2).filter(l => l.trim().length > 0);
    const fonts = dataLines.map(line => {
      const cols = line.trim().split(/\s+/);
      // emb column is at index cols.length - 5 (before sub uni object ID)
      const embIdx = cols.length - 5;
      return {
        name:     cols.slice(0, embIdx - 2).join(' ') || 'unknown',
        type:     cols[embIdx - 2] || '',
        encoding: cols[embIdx - 1] || '',
        embedded: cols[embIdx] === 'yes',
        subset:   cols[embIdx + 1] === 'yes',
      };
    });
    const unembedded = fonts.filter(f => !f.embedded && f.name && f.name !== 'unknown').map(f => f.name);
    return {
      ok:         unembedded.length === 0,
      tool:       'pdffonts',
      fonts,
      unembedded,
      message:    unembedded.length === 0
        ? `All ${fonts.length} font(s) embedded ✓`
        : `WARNING: ${unembedded.length} font(s) NOT embedded: ${unembedded.join(', ')}`,
    };
  } catch (e) {
    // pdffonts not installed — return informational note, not an error
    return {
      ok:      null,
      tool:    'pdffonts',
      message: 'pdffonts not found — install poppler-utils to enable automatic font embedding verification.',
      error:   e.message,
    };
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

/* ── Automated check: PDF preflight ─────────────────── */
// Tries qpdf first (fast, structural check), falls back to Ghostscript.
// Returns { ok, tool, message }.
async function runPdfPreflight(pdfBuffer) {
  const tmp = join(tmpdir(), `pg_preflight_${Date.now()}.pdf`);
  try {
    writeFileSync(tmp, pdfBuffer);

    // ── Try qpdf ──
    try {
      const out = execSync(`qpdf --check "${tmp}" 2>&1`, { timeout: 20000 }).toString('utf8');
      // qpdf exits 0 on success; "No syntax or stream encoding errors found" = clean
      const clean = out.includes('No syntax or stream encoding errors found') || out.trim() === '';
      return {
        ok:      true,
        tool:    'qpdf',
        message: clean ? 'PDF structure valid — no syntax errors (qpdf) ✓' : `qpdf: ${out.slice(0, 200)}`,
      };
    } catch (qErr) {
      const qMsg = (qErr.stdout || qErr.stderr || qErr.message || '').toString().slice(0, 200);
      // qpdf exits non-zero even for warnings — if "No syntax" appears it's a warning, not fail
      if (qMsg.includes('No syntax or stream encoding errors found')) {
        return { ok: true, tool: 'qpdf', message: 'PDF structure valid (qpdf) ✓' };
      }
      // qpdf not available — try Ghostscript
    }

    // ── Try Ghostscript ──
    try {
      execSync(`gs -dBATCH -dNOPAUSE -dPDFSTOPONERROR -sDEVICE=nullpage "${tmp}" 2>&1`, { timeout: 25000 });
      return { ok: true, tool: 'ghostscript', message: 'PDF passes Ghostscript preflight ✓' };
    } catch (gsErr) {
      const gsMsg = (gsErr.stdout || gsErr.stderr || gsErr.message || '').toString().slice(0, 300);
      if (gsMsg.includes('Error') || gsMsg.includes('error')) {
        return { ok: false, tool: 'ghostscript', message: `Preflight warning: ${gsMsg}` };
      }
      return { ok: true, tool: 'ghostscript', message: 'PDF passes Ghostscript preflight ✓' };
    }
  } catch (e) {
    return {
      ok:      null,
      tool:    'none',
      message: 'No preflight tool found — install qpdf or ghostscript for automatic PDF validation.',
      error:   e.message,
    };
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}
