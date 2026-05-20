/**
 * PathGuru Publishers — Layout Engine  (Phase 3)
 *
 * Fixes vs Phase 2:
 *  ✓ Body parser handles BOTH plain text AND residual HTML tags safely
 *  ✓ Chapter number pulled from sequential counter, NOT from title string
 *  ✓ designIntent NEVER leaks into rendered body content
 *  ✓ Cover HTML injected as first page-break page
 *  ✓ <strong>/<em>/<h3>/<ol>/<ul> inside body rendered properly
 *  ✓ Inline pull-quotes (>> prefix) rendered as callout blocks
 *  ✓ Sub-headings (ALL CAPS lines) rendered as <h3>
 */

export async function runFormattingAgent(project, manuscript, design) {

  /* ── Token resolution ── */
  const p          = design?.design?.palette   || {};
  const fontImport = design?.design?.fontImport || '';
  const coverHtml  = design?.coverHtml         || '';

  const accent       = p.accent         || '#2bb3a3';
  const accentDim    = p.accentDim      || '#1d7a70';
  const pageBg       = p.pageBackground || '#ffffff';
  const pageFg       = p.pageFg         || '#16213e';
  const ruleColor    = p.ruleColor      || '#d1dce8';
  const pullBg       = p.pullBg         || '#eef4fb';
  const pullBorder   = p.pullBorder     || accent;
  const ctaBg        = p.ctaBg          || '#16213e';
  const ctaFg        = p.ctaFg          || '#ffffff';
  const eyebrow      = p.eyebrowColor   || accent;
  const checkColor   = p.checkColor     || accent;
  const chapterNum   = p.chapterNumFg   || accent;

  const titleFont   = design?.design?.titleFont   || "'DM Sans', Arial, sans-serif";
  const headingFont = design?.design?.headingFont || "'DM Sans', Arial, sans-serif";
  const bodyFont    = design?.design?.bodyFont    || "'DM Sans', Arial, sans-serif";

  const kdp     = project.kdpProfile || {};
  const pageW   = kdp.pageWidthIn    || 6;
  const pageH   = kdp.pageHeightIn   || 9;
  const gutter  = kdp.safeMarginIn   || 0.75;
  const margin  = 0.5;

  const title     = manuscript?.title    || project.title    || 'Untitled';
  const author    = project.author       || '';
  const publisher = project.publisher   || 'PathGuru Publishers';
  const copyright = project.copyright   || `© ${new Date().getFullYear()} ${author}. All rights reserved.`;
  const sections  = manuscript?.sections || project.sections || [];
  const citations = manuscript?.citations || project.citations || [];

  /* ══════════════════════════════════════════════════
     BODY PARSER — handles plain text AND residual HTML
  ══════════════════════════════════════════════════ */
  function parseBody(raw = '', forCta = false) {
    if (!raw.trim()) return '';

    // If residual HTML tags slipped through, sanitise to safe subset then process
    const hasHtml = /<[a-z][\s\S]*?>/i.test(raw);
    let text = raw;

    if (hasHtml) {
      // Convert safe semantic tags to our markers, strip the rest
      text = text
        .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
        .replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
        .replace(/<em>([\s\S]*?)<\/em>/gi, '_$1_')
        .replace(/<i>([\s\S]*?)<\/i>/gi, '_$1_')
        .replace(/<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/gi, '\n\n$1\n\n')
        .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<[^>]+>/g, '')  // strip remaining tags
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    // Split on double newlines into blocks
    const blocks = text.split(/\n{2,}/);
    const out = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i].trim();
      if (!block) continue;

      // Pull-quote marker >>
      if (block.startsWith('>>')) {
        const q = block.replace(/^>>\s*/, '');
        out.push(`<blockquote class="inline-pull">${renderInline(q)}</blockquote>`);
        continue;
      }

      // Bullet list block — collect consecutive bullet lines
      if (/^[-•]\s/.test(block)) {
        const items = block.split('\n')
          .map(l => l.trim())
          .filter(l => /^[-•]\s/.test(l))
          .map(l => `<li>${renderInline(l.replace(/^[-•]\s/, ''))}</li>`)
          .join('');
        out.push(`<ul class="body-list">${items}</ul>`);
        continue;
      }

      // Numbered list block
      if (/^\d+\.\s/.test(block)) {
        const items = block.split('\n')
          .map(l => l.trim())
          .filter(l => /^\d+\.\s/.test(l))
          .map(l => `<li>${renderInline(l.replace(/^\d+\.\s/, ''))}</li>`)
          .join('');
        out.push(`<ol class="body-list">${items}</ol>`);
        continue;
      }

      // ALL CAPS sub-heading (6+ chars, no lowercase)
      if (/^[A-Z][A-Z\s\d:,'-]{5,}$/.test(block) && block.length < 80) {
        out.push(`<h3 class="body-subhead">${renderInline(block)}</h3>`);
        continue;
      }

      // Normal paragraph
      const indent = (i === 0 || out.length === 0) ? '' : ' class="indented"';
      const textColor = forCta ? 'style="color:rgba(255,255,255,.82)"' : '';
      out.push(`<p${indent} ${textColor}>${renderInline(block)}</p>`);
    }

    return out.join('\n');
  }

  /* Inline formatting: **bold**, _italic_ */
  function renderInline(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>');
  }

  /* Drop-cap on first letter of first paragraph */
  function dropCapBody(raw) {
    const html = parseBody(raw);
    return html.replace(/(<p[^>]*>)([A-Z"'"«])/, '$1<span class="drop-cap">$2</span>');
  }

  /* ══════════════════════════════════════════════════
     SECTION RENDERERS
  ══════════════════════════════════════════════════ */

  function renderFrontmatter(s) {
    return `
<section class="pg-section pg-frontmatter" aria-label="Frontmatter">
  <div class="frontmatter-inner">
    <p class="fm-publisher">${esc(publisher)}</p>
    <h1 class="fm-title">${esc(title)}</h1>
    ${manuscript?.subtitle ? `<p class="fm-subtitle">${esc(manuscript.subtitle)}</p>` : ''}
    <div class="fm-rule"></div>
    <div class="fm-body">${parseBody(s.body)}</div>
    <p class="fm-copyright">${esc(copyright)}</p>
  </div>
</section>`;
  }

  function renderToc(allSections) {
    const items = allSections
      .filter(s => !['frontmatter','copyright','toc','references'].includes(s.type))
      .map((s, i) => `
      <li class="toc-item">
        <span class="toc-num">${i + 1}</span>
        <span class="toc-dots"></span>
        <span class="toc-title">${esc(s.title)}</span>
      </li>`).join('');
    return `
<section class="pg-section pg-toc" aria-label="Table of Contents">
  <p class="eyebrow">Contents</p>
  <h2 class="section-heading">Table of Contents</h2>
  <ul class="toc-list">${items}</ul>
</section>`;
  }

  function renderChapter(s, num) {
    const intent    = s.designIntent || '';
    const pullMatch = intent.match(/pull[- ]?quote[:\s]+[""']?([^""'.\n]{20,120})/i);
    const pullQuote = pullMatch ? pullMatch[1].trim() : extractPullQuote(s.body);

    return `
<section class="pg-section pg-chapter" aria-label="${esc(s.title)}">
  <div class="chapter-opener">
    <span class="chapter-number" aria-hidden="true">${num}</span>
    <p class="eyebrow">Chapter</p>
    <h2 class="section-heading">${esc(s.title)}</h2>
    <div class="chapter-rule"></div>
  </div>
  <div class="chapter-body">
    ${dropCapBody(s.body)}
  </div>
  ${pullQuote ? `
  <aside class="pull-quote" aria-label="Pull quote">
    <div class="pull-quote-mark" aria-hidden="true">"</div>
    <blockquote>${esc(pullQuote)}</blockquote>
  </aside>` : ''}
</section>`;
  }

  /* Extract a compelling sentence from body for auto pull-quote */
  function extractPullQuote(body = '') {
    if (!body) return null;
    const clean = body.replace(/<[^>]+>/g, '').replace(/\*\*|_/g, '');
    const sentences = clean.match(/[^.!?]{40,120}[.!?]/g) || [];
    // Pick the most impactful-sounding sentence (contains power words)
    const power = /\b(secret|truth|never|always|every|power|change|transform|must|real|only|best|worst|key|stop|start)\b/i;
    return sentences.find(s => power.test(s))?.trim() || sentences[1]?.trim() || null;
  }

  function renderChecklist(s) {
    const lines = s.body.split('\n')
      .map(l => l.replace(/^[-•✓☐✗\d.]+\s*/, '').trim())
      .filter(l => l.length > 2);

    const items = lines.map(line => `
      <li class="check-item">
        <span class="check-box" aria-hidden="true"></span>
        <span class="check-text">${renderInline(line)}</span>
      </li>`).join('');

    return `
<section class="pg-section pg-checklist" aria-label="${esc(s.title)}">
  <p class="eyebrow">Checklist</p>
  <h2 class="section-heading">${esc(s.title)}</h2>
  ${s.designIntent ? `<p class="section-intro">${esc(s.designIntent)}</p>` : ''}
  <ul class="check-list">${items}</ul>
</section>`;
  }

  function renderWorksheet(s) {
    const lines = s.body.split('\n')
      .map(l => l.replace(/^[-•\d.]+\s*/, '').trim())
      .filter(l => l.length > 2);

    const items = lines.map(line => `
      <div class="ws-item">
        <p class="ws-prompt">${renderInline(line)}</p>
        <div class="ws-lines">
          <div class="ws-line"></div>
          <div class="ws-line"></div>
          <div class="ws-line"></div>
        </div>
      </div>`).join('');

    return `
<section class="pg-section pg-worksheet" aria-label="${esc(s.title)}">
  <p class="eyebrow">Exercise</p>
  <h2 class="section-heading">${esc(s.title)}</h2>
  <div class="ws-grid">${items}</div>
</section>`;
  }

  function renderCta(s) {
    // designIntent must NOT appear in the rendered body — only use s.body
    return `
<section class="pg-section pg-cta" aria-label="Call to action">
  <div class="cta-inner">
    <p class="eyebrow cta-eyebrow">Your Next Step</p>
    <div class="cta-rule"></div>
    <h2 class="cta-heading">${esc(s.title)}</h2>
    <div class="cta-body">${parseBody(s.body, true)}</div>
  </div>
</section>`;
  }

  function renderPullquote(s) {
    const quote = s.body.replace(/^[""']|[""']$/g, '').trim();
    return `
<section class="pg-section pg-pullquote" aria-label="Quote">
  <div class="standalone-quote">
    <div class="sq-mark" aria-hidden="true">"</div>
    <blockquote class="sq-text">${esc(quote)}</blockquote>
    ${s.title ? `<cite class="sq-attr">— ${esc(s.title)}</cite>` : ''}
  </div>
</section>`;
  }

  function renderStatblock(s) {
    const lines = s.body.split('\n').map(l => l.trim()).filter(Boolean);
    const stats  = lines.map(line => {
      const m = line.match(/^([^:–—]+)[:\s–—]+(.+)$/);
      return m ? { label: m[1].trim(), value: m[2].trim() } : { label: '', value: line };
    });
    const cols = stats.map(st => `
      <div class="stat-col">
        <p class="stat-value">${esc(st.value)}</p>
        <p class="stat-label">${esc(st.label)}</p>
      </div>`).join('');

    return `
<section class="pg-section pg-statblock" aria-label="${esc(s.title)}">
  <p class="eyebrow">By the numbers</p>
  <h2 class="section-heading">${esc(s.title)}</h2>
  <div class="stat-grid">${cols}</div>
</section>`;
  }

  function renderReferences(cits) {
    if (!cits.length) return '';
    const items = cits.map((c, i) => `
      <li class="ref-item">
        <span class="ref-num">${i + 1}.</span>
        <div class="ref-body">
          <strong>${esc(c.title || 'Source')}</strong>
          ${c.url ? `<br><a href="${esc(c.url)}" class="ref-link">${esc(c.url)}</a>` : ''}
          ${c.content ? `<br><em class="ref-excerpt">${esc(c.content.slice(0, 180))}</em>` : ''}
        </div>
      </li>`).join('');
    return `
<section class="pg-section pg-references" aria-label="References">
  <p class="eyebrow">Sources</p>
  <h2 class="section-heading">References</h2>
  <ol class="ref-list">${items}</ol>
</section>`;
  }

  function renderDefault(s) {
    return `
<section class="pg-section pg-default" aria-label="${esc(s.title)}">
  <p class="eyebrow">${esc(s.type || 'Section')}</p>
  <h2 class="section-heading">${esc(s.title)}</h2>
  <div class="section-body">${parseBody(s.body)}</div>
</section>`;
  }

  /* ── Section router ── */
  function routeSection(s, chapterNum, allSections) {
    const t = s.type.toLowerCase().trim();
    switch (t) {
      case 'frontmatter':
      case 'copyright':       return renderFrontmatter(s);
      case 'toc':             return renderToc(allSections);
      case 'chapter':
      case 'section':
      case 'introduction':
      case 'intro':
      case 'conclusion':      return renderChapter(s, chapterNum);
      case 'checklist':       return renderChecklist(s);
      case 'worksheet':
      case 'exercise':        return renderWorksheet(s);
      case 'cta':             return renderCta(s);
      case 'pullquote':
      case 'quote':           return renderPullquote(s);
      case 'statblock':
      case 'stats':           return renderStatblock(s);
      default:
        // Infer from designIntent
        if (/checklist/i.test(s.designIntent))        return renderChecklist(s);
        if (/worksheet|exercise/i.test(s.designIntent)) return renderWorksheet(s);
        if (/cta|call.to.action/i.test(s.designIntent)) return renderCta(s);
        return renderDefault(s);
    }
  }

  /* ── Render all sections ── */
  const CHAPTER_TYPES = new Set(['chapter','section','introduction','intro','conclusion']);
  let chapterCount = 0;
  const sectionsHtml = sections.map(s =>
    routeSection(s, CHAPTER_TYPES.has(s.type) ? ++chapterCount : chapterCount, sections)
  ).join('\n');

  const refsHtml = renderReferences(citations);

  /* ── Cover page (injected as separate framed page) ── */
  const coverSection = coverHtml
    ? `<div class="cover-frame">${coverHtml}</div>`
    : '';

  /* ── Complete HTML document ── */
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  ${fontImport ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="${fontImport}" rel="stylesheet">` : ''}
  <style>

    /* ── KDP Page spec ── */
    @page {
      size: ${pageW}in ${pageH}in;
      margin-top:    ${margin}in;
      margin-bottom: ${margin + 0.12}in;
      margin-outside: ${margin}in;
      margin-inside:  ${gutter}in;
    }
    @page :left  { @top-left   { content: "${esc(title)}"; font-family: ${bodyFont}; font-size: 7.5pt; color: #aaa; } @bottom-center { content: counter(page); font-family: ${bodyFont}; font-size: 8pt; color: #aaa; } }
    @page :right { @top-right  { content: "${esc(author)}"; font-family: ${bodyFont}; font-size: 7.5pt; color: #aaa; } @bottom-center { content: counter(page); font-family: ${bodyFont}; font-size: 8pt; color: #aaa; } }
    @page .cover-frame { margin: 0; }

    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 11pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: ${bodyFont};
      font-size: 1rem;
      line-height: 1.64;
      color: ${pageFg};
      background: ${pageBg};
      hyphens: auto;
      -webkit-hyphens: auto;
    }

    /* ── Screen wrapper ── */
    .book-wrap { max-width: ${pageW}in; margin: 0 auto; background: ${pageBg}; }
    @media screen { .book-wrap { box-shadow: 0 0 48px rgba(0,0,0,.12); } }

    /* ── Cover frame ── */
    .cover-frame {
      width: 100%;
      break-after: page;
      page-break-after: always;
      overflow: hidden;
    }
    .cover-frame html, .cover-frame body { width: 100% !important; height: auto !important; }

    /* ── Section base ── */
    .pg-section {
      padding: 0.52in 0 0.46in;
      border-bottom: 0.5pt solid ${ruleColor};
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .pg-section:last-child { border-bottom: none; }

    /* ── Typography ── */
    .eyebrow {
      font-family: ${bodyFont};
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: .13em;
      text-transform: uppercase;
      color: ${eyebrow};
      margin: 0 0 8pt;
      display: block;
    }
    .section-heading {
      font-family: ${headingFont};
      font-size: 21pt;
      font-weight: 700;
      line-height: 1.12;
      letter-spacing: -.02em;
      color: ${pageFg};
      margin: 0 0 13pt;
    }
    .section-intro {
      font-size: 10pt;
      color: #777;
      font-style: italic;
      margin: 0 0 16pt;
      border-left: 2pt solid ${ruleColor};
      padding-left: 10pt;
    }

    /* Body text */
    p { margin: 0 0 9pt; font-size: 11pt; line-height: 1.64; }
    p.indented { text-indent: 1.4em; }
    strong { font-weight: 700; }
    em { font-style: italic; }

    h3.body-subhead {
      font-family: ${headingFont};
      font-size: 12pt;
      font-weight: 700;
      margin: 16pt 0 7pt;
      color: ${pageFg};
      letter-spacing: -.01em;
    }
    .body-list { padding-left: 15pt; margin: 8pt 0 13pt; }
    .body-list li { margin-bottom: 5pt; font-size: 10.5pt; line-height: 1.55; }
    ol.body-list li::marker { color: ${eyebrow}; font-weight: 700; }

    blockquote.inline-pull {
      background: ${pullBg};
      border-left: 3pt solid ${pullBorder};
      padding: 10pt 14pt;
      margin: 16pt 0;
      font-size: 10.5pt;
      font-style: italic;
      color: ${pageFg};
      border-radius: 0 4pt 4pt 0;
    }

    /* ── Frontmatter ── */
    .pg-frontmatter { min-height: 5.5in; display:flex; align-items:center; break-after:page; page-break-after:always; }
    .frontmatter-inner { max-width: 5in; }
    .fm-publisher { font-size:8pt; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:${eyebrow}; margin-bottom:16pt; }
    .fm-title { font-family:${titleFont}; font-size:24pt; font-weight:700; line-height:1.08; letter-spacing:-.02em; margin:0 0 7pt; }
    .fm-subtitle { font-size:12pt; color:#666; font-style:italic; margin:0 0 20pt; }
    .fm-rule { width:26pt; height:2pt; background:${accent}; margin:0 0 20pt; border-radius:1pt; }
    .fm-body p { font-size:9pt; color:#555; margin-bottom:5pt; }
    .fm-copyright { margin-top:22pt; font-size:8pt; color:#999; }

    /* ── TOC ── */
    .pg-toc { break-after:page; page-break-after:always; }
    .toc-list { list-style:none; margin-top:10pt; }
    .toc-item { display:flex; align-items:baseline; gap:6pt; padding:6pt 0; border-bottom:.5pt dotted ${ruleColor}; font-size:10.5pt; }
    .toc-item:last-child { border-bottom:none; }
    .toc-num { font-family:${headingFont}; font-weight:700; font-size:9pt; color:${chapterNum}; min-width:16pt; flex-shrink:0; }
    .toc-dots { flex:1; border-bottom:1pt dotted ${ruleColor}; margin-bottom:3pt; }
    .toc-title { font-size:10.5pt; color:${pageFg}; }

    /* ── Chapter opener ── */
    .pg-chapter { break-before:page; page-break-before:always; }
    .chapter-opener { margin-bottom:20pt; }
    .chapter-number {
      display:block;
      font-family:${titleFont};
      font-size:72pt;
      font-weight:900;
      line-height:1;
      color:${accent};
      opacity:.14;
      letter-spacing:-.04em;
      margin-bottom:-22pt;
    }
    .chapter-rule { width:100%; height:.5pt; background:${ruleColor}; margin:16pt 0 20pt; }
    .drop-cap {
      float:left;
      font-family:${titleFont};
      font-size:54pt;
      line-height:.82;
      font-weight:700;
      color:${accent};
      margin:4pt 6pt 0 0;
    }
    .chapter-body { clear:both; }
    .chapter-body p { text-align:justify; }
    .pull-quote { margin:22pt 0; padding:18pt 20pt; background:${pullBg}; border-top:2pt solid ${pullBorder}; border-bottom:2pt solid ${pullBorder}; text-align:center; break-inside:avoid; }
    .pull-quote-mark { font-family:${titleFont}; font-size:44pt; line-height:.7; color:${pullBorder}; opacity:.35; margin-bottom:5pt; }
    .pull-quote blockquote { font-family:${titleFont}; font-size:13.5pt; font-style:italic; line-height:1.45; color:${pageFg}; max-width:4in; margin:0 auto; }

    /* ── Checklist ── */
    .check-list { list-style:none; margin:0; }
    .check-item { display:flex; align-items:flex-start; gap:10pt; padding:9pt 0; border-bottom:.5pt solid ${ruleColor}; break-inside:avoid; }
    .check-item:last-child { border-bottom:none; }
    .check-box { flex-shrink:0; width:13pt; height:13pt; border:1.5pt solid ${checkColor}; border-radius:3pt; margin-top:1pt; }
    .check-text { font-size:10.5pt; line-height:1.5; flex:1; }

    /* ── Worksheet ── */
    .ws-grid { display:flex; flex-direction:column; gap:18pt; margin-top:10pt; }
    .ws-item { break-inside:avoid; }
    .ws-prompt { font-size:10.5pt; font-weight:600; margin-bottom:8pt; }
    .ws-lines { display:flex; flex-direction:column; gap:9pt; }
    .ws-line { height:0; border-bottom:1pt solid ${ruleColor}; }

    /* ── CTA spread ── */
    .pg-cta { background:${ctaBg}; color:${ctaFg}; border:none; padding:0; }
    .cta-inner { padding:.58in .52in; min-height:3.8in; display:flex; flex-direction:column; justify-content:center; }
    .cta-eyebrow { color:${accent}; }
    .cta-rule { width:30pt; height:2.5pt; background:${accent}; border-radius:1.5pt; margin:0 0 18pt; }
    .cta-heading { font-family:${titleFont}; font-size:24pt; font-weight:700; line-height:1.1; color:${ctaFg}; letter-spacing:-.02em; margin:0 0 16pt; max-width:4.4in; }
    .cta-body p { color:rgba(255,255,255,.82); font-size:11pt; line-height:1.62; text-align:left; }
    .cta-body ul.body-list li, .cta-body ol.body-list li { color:rgba(255,255,255,.82); }

    /* ── Standalone pullquote ── */
    .pg-pullquote { min-height:4.5in; display:flex; align-items:center; justify-content:center; break-before:page; page-break-before:always; border:none; }
    .standalone-quote { text-align:center; max-width:4.2in; }
    .sq-mark { font-family:${titleFont}; font-size:68pt; line-height:.7; color:${accent}; opacity:.3; display:block; margin-bottom:10pt; }
    .sq-text { font-family:${titleFont}; font-size:15.5pt; font-style:italic; line-height:1.45; color:${pageFg}; }
    .sq-attr { display:block; margin-top:12pt; font-size:9pt; color:${eyebrow}; letter-spacing:.06em; text-transform:uppercase; }

    /* ── Stat block ── */
    .stat-grid { display:flex; gap:0; margin-top:14pt; border-top:2pt solid ${accent}; border-bottom:2pt solid ${accent}; }
    .stat-col { flex:1; padding:15pt 12pt; text-align:center; border-right:.5pt solid ${ruleColor}; }
    .stat-col:last-child { border-right:none; }
    .stat-value { font-family:${titleFont}; font-size:24pt; font-weight:900; color:${accent}; line-height:1; margin:0 0 4pt; }
    .stat-label { font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#888; margin:0; }

    /* ── References ── */
    .ref-list { list-style:none; margin-top:10pt; }
    .ref-item { display:flex; gap:8pt; margin-bottom:10pt; font-size:9pt; break-inside:avoid; }
    .ref-num { color:${eyebrow}; font-weight:700; flex-shrink:0; min-width:14pt; }
    .ref-body { flex:1; line-height:1.5; }
    .ref-link { color:${accent}; word-break:break-all; font-size:8pt; }
    .ref-excerpt { color:#777; display:block; margin-top:2pt; }

    /* ── Book footer ── */
    .book-footer { text-align:center; padding:16pt 0 22pt; font-size:8pt; color:#bbb; border-top:.5pt solid ${ruleColor}; margin-top:22pt; }

    /* ── Print ── */
    @media print {
      body { background:#fff; }
      .book-wrap { box-shadow:none; max-width:none; }
    }

    /* ── Screen extras ── */
    @media screen {
      body { padding:.3in; background:#e5e8ed; }
      .book-wrap { padding:${margin}in ${gutter}in; }
    }
  </style>
</head>
<body>
<div class="book-wrap">

  ${coverSection}

  ${sectionsHtml}

  ${refsHtml}

  <footer class="book-footer">
    ${esc(copyright)} &nbsp;·&nbsp; ${esc(publisher)}
  </footer>

</div>
</body>
</html>`;

  return { html };
}

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
