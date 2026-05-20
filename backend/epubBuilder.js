/**
 * PathGuru Publishers — EPUB 3 Builder
 *
 * Produces a valid EPUB 3 file (zip archive) that passes KDP's
 * ebook pre-flight. Structure:
 *
 *   mimetype                    (uncompressed, first)
 *   META-INF/container.xml
 *   OEBPS/content.opf           (package document)
 *   OEBPS/toc.ncx               (NCX for legacy readers)
 *   OEBPS/nav.xhtml             (EPUB 3 navigation)
 *   OEBPS/styles/main.css
 *   OEBPS/Text/cover.xhtml
 *   OEBPS/Text/chapter-N.xhtml
 *   OEBPS/Text/references.xhtml (if citations)
 */

import { createWriteStream, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build an EPUB and return it as a Buffer.
 * @param {Object} project  - full project state
 * @param {Object} manuscript - editorial package (sections, title, etc.)
 * @param {Object} design   - design agent output
 * @returns {Buffer} EPUB binary
 */
export async function buildEpub (project, manuscript, design) {
  const id       = randomUUID();
  const workDir  = join(tmpdir(), `pg-epub-${id}`);
  const oebps    = join(workDir, 'OEBPS');
  const text     = join(oebps, 'Text');
  const styles   = join(oebps, 'styles');
  const metaInf  = join(workDir, 'META-INF');

  // Create folder structure
  [workDir, oebps, text, styles, metaInf].forEach(d => mkdirSync(d, { recursive: true }));

  const title     = manuscript.title    || project.title    || 'Untitled';
  const subtitle  = manuscript.subtitle || project.subtitle || '';
  const author    = project.author      || 'Unknown Author';
  const publisher = project.publisher   || 'PathGuru Publishers';
  const copyright = project.copyright   || `© ${new Date().getFullYear()} ${author}. All rights reserved.`;
  const uuid      = `urn:uuid:${randomUUID()}`;
  const lang      = 'en';
  const now       = new Date().toISOString().split('T')[0];

  const palette   = design?.design?.palette || {};
  const primary   = palette.primary   || '#16213e';
  const sections  = manuscript.sections || [];
  const citations = manuscript.citations || [];

  /* ── Helper: escape XML/HTML ── */
  const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /* ── Helper: body text → XHTML paragraphs ── */
  function bodyToXhtml (body = '') {
    return body.split(/\n{2,}/).map(p => {
      const t = p.trim();
      if (!t) return '';
      if (/^[-•✓☐]\s/.test(t)) {
        return `<li>${esc(t.replace(/^[-•✓☐]\s/, ''))}</li>`;
      }
      return `<p>${esc(t)}</p>`;
    }).join('\n');
  }

  /* ── Spine items (chapters) ── */
  const chapterFiles = [];

  // Cover page
  const coverXhtml = xhtmlDoc('cover', `Cover`, `
    <div class="cover-page">
      <h1 class="cover-title">${esc(title)}</h1>
      ${subtitle ? `<p class="cover-subtitle">${esc(subtitle)}</p>` : ''}
      <p class="cover-author">${esc(author)}</p>
      <p class="cover-publisher">${esc(publisher)}</p>
    </div>`);
  writeFileSync(join(text, 'cover.xhtml'), coverXhtml);
  chapterFiles.push({ id: 'cover', file: 'Text/cover.xhtml', title: 'Cover', properties: 'cover-image' });

  // Content sections
  sections.forEach((s, i) => {
    const type   = (s.type || 'chapter').toLowerCase();
    const fileId = `chapter-${i}`;
    const fileNm = `${fileId}.xhtml`;
    const sTitle = s.title || `Section ${i + 1}`;
    const body   = bodyToXhtml(s.body || '');

    let inner = '';

    if (type === 'frontmatter' || type === 'copyright') {
      inner = `
        <div class="frontmatter">
          <div class="copyright-block">${body}</div>
        </div>`;
    } else if (type === 'checklist') {
      inner = `
        <section class="chapter">
          <p class="eyebrow">Checklist</p>
          <h2>${esc(sTitle)}</h2>
          <ul class="checklist">${body}</ul>
        </section>`;
    } else if (type === 'cta') {
      inner = `
        <section class="chapter cta">
          <p class="eyebrow">Next Step</p>
          <h2>${esc(sTitle)}</h2>
          <div class="cta-body">${body}</div>
        </section>`;
    } else {
      inner = `
        <section class="chapter">
          <p class="eyebrow">Chapter ${i}</p>
          <h2>${esc(sTitle)}</h2>
          <div class="body-text">${body}</div>
        </section>`;
    }

    writeFileSync(join(text, fileNm), xhtmlDoc(fileId, sTitle, inner));
    chapterFiles.push({ id: fileId, file: `Text/${fileNm}`, title: sTitle });
  });

  // References
  if (citations.length) {
    const refBody = citations.map((c, i) =>
      `<li id="ref-${i+1}"><strong>${esc(c.title || 'Source')}</strong>${c.url ? ` &#8212; <a href="${esc(c.url)}">${esc(c.url)}</a>` : ''}${c.content ? `<br/><em>${esc(c.content)}</em>` : ''}</li>`
    ).join('');
    const refXhtml = xhtmlDoc('references', 'References', `
      <section class="chapter">
        <p class="eyebrow">Sources</p>
        <h2>References</h2>
        <ol class="references">${refBody}</ol>
      </section>`);
    writeFileSync(join(text, 'references.xhtml'), refXhtml);
    chapterFiles.push({ id: 'references', file: 'Text/references.xhtml', title: 'References' });
  }

  /* ── CSS ── */
  const css = `
/* PathGuru Publishers — EPUB 3 Stylesheet */
body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1em;
  line-height: 1.6;
  color: #111;
  margin: 0;
  padding: 0 0.5em;
}

/* Cover */
.cover-page {
  text-align: center;
  padding: 3em 1em;
  background: ${primary};
  color: #fff;
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
}
.cover-title    { font-size: 2em; font-weight: 700; margin: 0; letter-spacing: -0.02em; }
.cover-subtitle { font-size: 1em; opacity: 0.8; font-style: italic; margin: 0.25em 0; }
.cover-author   { font-size: 0.9em; opacity: 0.7; margin-top: 1em; }
.cover-publisher{ font-size: 0.75em; opacity: 0.5; }

/* Frontmatter */
.frontmatter { padding: 2em 0; }
.copyright-block { font-size: 0.8em; color: #555; line-height: 1.7; }
.copyright-block p { margin: 0 0 0.5em; }

/* Chapter */
.chapter { padding: 1.5em 0; }
.eyebrow {
  font-size: 0.65em;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${primary};
  margin: 0 0 0.5em;
}
h2 {
  font-size: 1.6em;
  font-weight: 700;
  line-height: 1.15;
  margin: 0 0 0.75em;
  letter-spacing: -0.01em;
}
.body-text p { margin: 0 0 0.75em; text-align: justify; }

/* Checklist */
.checklist { list-style: none; padding: 0; margin: 0.5em 0; }
.checklist li {
  padding: 0.4em 0;
  border-bottom: 1px dotted #ddd;
  display: flex;
  gap: 0.5em;
}
.checklist li::before { content: "☐"; color: ${primary}; flex-shrink: 0; }

/* CTA */
.cta { background: ${primary}; color: #fff; padding: 1.5em; border-radius: 0.3em; }
.cta .eyebrow { color: rgba(255,255,255,.7); }
.cta h2 { color: #fff; }
.cta-body p { color: rgba(255,255,255,.85); margin: 0 0 0.5em; }

/* References */
.references { padding-left: 1.2em; font-size: 0.8em; color: #444; }
.references li { margin-bottom: 0.6em; line-height: 1.5; }
.references a { color: ${primary}; word-break: break-all; }

/* Kindle / e-ink friendly */
@media amzn-mobi, amzn-kf8 {
  body { font-size: medium; }
  .cover-page { background: none; color: #000; }
  .cta { background: none; border: 1px solid #000; color: #000; }
  .cta h2, .cta-body p { color: #000; }
}
`;
  writeFileSync(join(styles, 'main.css'), css);

  /* ── Navigation document (EPUB 3 nav.xhtml) ── */
  const navItems = chapterFiles.map(c =>
    `<li><a href="${esc(c.file)}">${esc(c.title)}</a></li>`
  ).join('\n        ');

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(title)} — Navigation</title>
  <link rel="stylesheet" type="text/css" href="styles/main.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h2>Contents</h2>
    <ol>
      ${navItems}
    </ol>
  </nav>
</body>
</html>`;
  writeFileSync(join(oebps, 'nav.xhtml'), navXhtml);

  /* ── NCX (EPUB 2 / Kindle legacy) ── */
  const ncxNavPoints = chapterFiles.map((c, i) => `
    <navPoint id="nav-${c.id}" playOrder="${i + 1}">
      <navLabel><text>${esc(c.title)}</text></navLabel>
      <content src="${esc(c.file)}"/>
    </navPoint>`).join('');

  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${esc(title)}</text></docTitle>
  <navMap>${ncxNavPoints}
  </navMap>
</ncx>`;
  writeFileSync(join(oebps, 'toc.ncx'), ncx);

  /* ── content.opf ── */
  const manifestItems = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="css" href="styles/main.css" media-type="text/css"/>`,
    ...chapterFiles.map(c =>
      `<item id="${c.id}" href="${esc(c.file)}" media-type="application/xhtml+xml"${c.properties ? ` properties="${c.properties}"` : ''}/>`)
  ].join('\n    ');

  const spineItems = chapterFiles.map(c =>
    `<itemref idref="${c.id}"/>`
  ).join('\n    ');

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf"
         version="3.0"
         unique-identifier="uid"
         xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="uid">${uuid}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    ${subtitle ? `<dc:description>${esc(subtitle)}</dc:description>` : ''}
    <dc:creator>${esc(author)}</dc:creator>
    <dc:publisher>${esc(publisher)}</dc:publisher>
    <dc:language>${lang}</dc:language>
    <dc:rights>${esc(copyright)}</dc:rights>
    <dc:date>${now}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
    <meta name="cover" content="cover"/>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine toc="ncx">
    ${spineItems}
  </spine>
</package>`;
  writeFileSync(join(oebps, 'content.opf'), opf);

  /* ── META-INF/container.xml ── */
  writeFileSync(join(metaInf, 'container.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  /* ── mimetype (must be first, uncompressed) ── */
  writeFileSync(join(workDir, 'mimetype'), 'application/epub+zip');

  /* ── Zip into EPUB using system zip ── */
  const outFile = join(tmpdir(), `pg-epub-out-${id}.epub`);
  // EPUB spec: mimetype must be first and stored (not deflated)
  execSync(`cd "${workDir}" && zip -X0 "${outFile}" mimetype && zip -rX9 "${outFile}" META-INF OEBPS`, { stdio: 'pipe' });

  const { readFileSync } = await import('node:fs');
  const buffer = readFileSync(outFile);

  // Cleanup
  try {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(outFile, { force: true });
  } catch {}

  return buffer;
}

/* ── XHTML document wrapper ── */
function xhtmlDoc (id, title, inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${String(title ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</title>
  <link rel="stylesheet" type="text/css" href="../styles/main.css"/>
</head>
<body>
${inner}
</body>
</html>`;
}
