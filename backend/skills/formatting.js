/**
 * PathGuru Publishers — Layout Engine  (Phase 3 Complete)
 *
 * New vs Phase 2:
 *  1. Reads structured designIntent JSON — precise, not guessed
 *  2. Produces renderReport per section — feeds feedback loop
 *  3. Niche typography system — distinct visual personality per niche
 *  4. Callout stat blocks from designIntent.calloutStat
 *  5. Subheading injection from designIntent.subheadings array
 *  6. Widow/orphan control, optical margin, text-rendering
 *  7. Cover injected as first break page
 */

import { detectNiche } from './editorial.js';

/* ── Publisher style overrides (take precedence over niche typo) ─────── */
const PUBLISHER_TYPO = {
  // Digital Nation Inc. — Navy + Gold authority style
  digitalNation: { chNum:'82pt', chOp:'.08', hSize:'22pt', hWeight:'700', bSize:'10.5pt', lh:'1.65', pqSize:'14pt', pqStyle:'normal', track:'.14em', drop:'58pt', shSize:'12pt', shWeight:'700', gap:'0.56in' },
  // PathFinda Publishers — Navy + Blue editorial style
  pathfinda:     { chNum:'80pt', chOp:'.09', hSize:'22pt', hWeight:'700', bSize:'10.5pt', lh:'1.62', pqSize:'13.5pt', pqStyle:'normal', track:'.13em', drop:'56pt', shSize:'11.5pt', shWeight:'700', gap:'0.54in' },
};

/* ── Niche typography overrides ─────────────────────── */
const NICHE_TYPO = {
  business:   { chNum:'80pt', chOp:'.10', hSize:'22pt', hWeight:'700', bSize:'10.5pt', lh:'1.62', pqSize:'14pt', pqStyle:'normal', track:'.14em', drop:'58pt', shSize:'11.5pt', shWeight:'700', gap:'0.55in' },
  marketing:  { chNum:'88pt', chOp:'.09', hSize:'24pt', hWeight:'900', bSize:'11pt',   lh:'1.60', pqSize:'15pt', pqStyle:'normal', track:'.16em', drop:'62pt', shSize:'12pt',   shWeight:'800', gap:'0.52in' },
  wellness:   { chNum:'72pt', chOp:'.12', hSize:'21pt', hWeight:'700', bSize:'11pt',   lh:'1.70', pqSize:'13.5pt',pqStyle:'italic',track:'.12em', drop:'56pt', shSize:'11pt',   shWeight:'600', gap:'0.58in' },
  finance:    { chNum:'76pt', chOp:'.10', hSize:'21pt', hWeight:'700', bSize:'10.5pt', lh:'1.64', pqSize:'13pt', pqStyle:'normal', track:'.13em', drop:'56pt', shSize:'11pt',   shWeight:'700', gap:'0.54in' },
  leadership: { chNum:'76pt', chOp:'.10', hSize:'22pt', hWeight:'700', bSize:'10.5pt', lh:'1.62', pqSize:'13pt', pqStyle:'normal', track:'.13em', drop:'56pt', shSize:'11.5pt', shWeight:'700', gap:'0.54in' },
  faith:      { chNum:'70pt', chOp:'.13', hSize:'21pt', hWeight:'700', bSize:'11pt',   lh:'1.72', pqSize:'14pt', pqStyle:'italic', track:'.11em', drop:'56pt', shSize:'11pt',   shWeight:'600', gap:'0.58in' },
  parenting:  { chNum:'72pt', chOp:'.11', hSize:'21pt', hWeight:'700', bSize:'11pt',   lh:'1.68', pqSize:'13.5pt',pqStyle:'italic',track:'.12em', drop:'56pt', shSize:'11pt',   shWeight:'600', gap:'0.56in' },
  beauty:     { chNum:'82pt', chOp:'.09', hSize:'23pt', hWeight:'700', bSize:'11pt',   lh:'1.62', pqSize:'14pt', pqStyle:'italic', track:'.14em', drop:'60pt', shSize:'12pt',   shWeight:'700', gap:'0.54in' },
  selfdev:    { chNum:'84pt', chOp:'.09', hSize:'23pt', hWeight:'900', bSize:'11pt',   lh:'1.60', pqSize:'14pt', pqStyle:'normal', track:'.15em', drop:'60pt', shSize:'12pt',   shWeight:'700', gap:'0.52in' },
  technology: { chNum:'76pt', chOp:'.10', hSize:'21pt', hWeight:'700', bSize:'10.5pt', lh:'1.62', pqSize:'13pt', pqStyle:'normal', track:'.13em', drop:'54pt', shSize:'11pt',   shWeight:'700', gap:'0.54in' },
  aging:      { chNum:'82pt', chOp:'.09', hSize:'23pt', hWeight:'700', bSize:'11.5pt', lh:'1.68', pqSize:'14.5pt',pqStyle:'italic',track:'.13em', drop:'60pt', shSize:'12pt',   shWeight:'700', gap:'0.56in' },
  creative:   { chNum:'74pt', chOp:'.11', hSize:'21pt', hWeight:'700', bSize:'11pt',   lh:'1.70', pqSize:'14pt', pqStyle:'italic', track:'.12em', drop:'58pt', shSize:'11pt',   shWeight:'600', gap:'0.56in' },
  default:    { chNum:'76pt', chOp:'.12', hSize:'21pt', hWeight:'700', bSize:'11pt',   lh:'1.64', pqSize:'13.5pt',pqStyle:'italic',track:'.13em', drop:'56pt', shSize:'11.5pt', shWeight:'700', gap:'0.54in' },
};

/* ── Main export ─────────────────────────────────────── */
export async function runFormattingAgent(project, manuscript, design, options = {}) {
  const includeCover = options.includeCover !== false; // default true

  /* ── Token resolution ── */
  const p           = design?.design?.palette   || {};
  const fontImport    = design?.design?.fontImport || '';
  const inlineFontCss = design?.design?.inlineFontCss || '';
  const coverHtml   = design?.coverHtml          || '';
  const titleFont   = design?.design?.titleFont   || "'DM Sans', Arial, sans-serif";
  const headingFont = design?.design?.headingFont || "'DM Sans', Arial, sans-serif";
  const bodyFont    = design?.design?.bodyFont    || "'DM Sans', Arial, sans-serif";

  const accent     = p.accent         || '#2bb3a3';
  const pageBg     = p.pageBackground || '#ffffff';
  const pageFg     = p.pageFg         || '#16213e';
  const ruleColor  = p.ruleColor      || '#d1dce8';
  const pullBg     = p.pullBg         || '#eef4fb';
  const pullBorder = p.pullBorder     || accent;
  const ctaBg      = p.ctaBg          || '#16213e';
  const ctaFg      = p.ctaFg          || '#ffffff';
  const eyebrowClr = p.eyebrowColor   || accent;
  const checkColor = p.checkColor     || accent;
  const chNumClr   = p.chapterNumFg   || accent;

  /* ── KDP page spec ── */
  const kdp        = project.kdpProfile || {};
  const pageW      = kdp.pageWidthIn    || 6;
  const pageH      = kdp.pageHeightIn   || 9;
  const bleed      = kdp.bleed          || false;
  const bleedPad   = bleed ? 0.125 : 0;          // 0.125in bleed on each side
  const gutter     = (kdp.safeMarginIn  || 0.75) + bleedPad;
  const margin     = 0.5 + bleedPad;

  /* ── Interior images from design agent ── */
  const interiorImages = design?.design?.interiorImages || {};

  const title     = manuscript?.title    || project.title    || 'Untitled';
  const author    = project.author       || '';
  const publisher = project.publisher    || 'PathGuru Publishers';
  const copyright = project.copyright   || `© ${new Date().getFullYear()} ${author}. All rights reserved.`;
  const sections  = manuscript?.sections || project.sections || [];
  const citations = manuscript?.citations || project.citations || [];

  /* ── Detect niche for typography (publisher style overrides niche) ── */
  const { niche } = detectNiche(project.topic || title, project.writingMode || '');
  const pubStyle = (design?.design?.style || '').toLowerCase();
  const t = PUBLISHER_TYPO[pubStyle] || NICHE_TYPO[niche] || NICHE_TYPO.default;

  /* ── Render report ── */
  const renderReport = { niche, sections: [], totalSections: sections.length, warnings: [] };

  /* ════════════════════════════════════════════════
     BODY PARSER
  ════════════════════════════════════════════════ */
  function parseBody(raw = '', opts = {}) {
    if (!raw.trim()) return '';
    const { forCta = false, subheadings = [] } = opts;

    /* sanitise residual HTML */
    let text = raw;
    if (/<[a-z]/i.test(text)) {
      text = text
        .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
        .replace(/<b>([\s\S]*?)<\/b>/gi,           '**$1**')
        .replace(/<em>([\s\S]*?)<\/em>/gi,          '_$1_')
        .replace(/<i>([\s\S]*?)<\/i>/gi,            '_$1_')
        .replace(/<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/gi, '\n\n$1\n\n')
        .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi,     '\n- $1')
        .replace(/<br\s*\/?>/gi,                    '\n')
        .replace(/<\/p>/gi,                         '\n\n')
        .replace(/<p[^>]*>/gi,                      '')
        .replace(/<[^>]+>/g,                        '')
        .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'")
        .replace(/\n{3,}/g,'\n\n').trim();
    }

    const blocks = text.split(/\n{2,}/);
    const out = [];
    let paraIdx = 0;
    let shIdx   = 0;
    const seenSubheads = new Set();

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i].trim();
      if (!b) continue;

      /* inject subheading from designIntent at paragraph 3 and 6 */
      if (subheadings.length && shIdx < subheadings.length && (paraIdx === 3 || paraIdx === 6)) {
        const sh = subheadings[shIdx++];
        const key = sh.toUpperCase();
        if (!seenSubheads.has(key)) {
          seenSubheads.add(key);
          out.push(`<h3 class="body-subhead">${esc(sh)}</h3>`);
        }
      }

      /* pull-quote >> — handled in prepareChapterBody for chapters; skip duplicate inline */
      if (b.startsWith('>>')) {
        continue;
      }

      /* bullet list */
      if (/^[-•]\s/.test(b)) {
        const items = b.split('\n').filter(l=>/^[-•]\s/.test(l.trim()))
          .map(l=>`<li>${ri(l.replace(/^[-•]\s/,''))}</li>`).join('');
        if (items) { out.push(`<ul class="body-list">${items}</ul>`); continue; }
      }

      /* numbered list */
      if (/^\d+\.\s/.test(b)) {
        const items = b.split('\n').filter(l=>/^\d+\.\s/.test(l.trim()))
          .map(l=>`<li>${ri(l.replace(/^\d+\.\s/,''))}</li>`).join('');
        if (items) { out.push(`<ol class="body-list">${items}</ol>`); continue; }
      }

      /* ALL CAPS subheading — skip consecutive duplicates */
      if (/^[A-Z][A-Z\s\d:,'\-–]{5,}$/.test(b) && b.length < 80) {
        const key = b.toUpperCase();
        if (seenSubheads.has(key)) continue;
        seenSubheads.add(key);
        out.push(`<h3 class="body-subhead">${ri(b)}</h3>`);
        continue;
      }

      /* normal paragraph */
      const cls   = (paraIdx === 0) ? '' : ' class="indented"';
      const color = forCta ? ' style="color:rgba(255,255,255,.82)"' : '';
      out.push(`<p${cls}${color}>${ri(b)}</p>`);
      paraIdx++;
    }
    return out.join('\n');
  }

  /* inline formatting */
  function ri(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/_(.+?)_/g,'<em>$1</em>');
  }

  /** Strip >> pull lines from body; return one pull string for end-of-chapter display. */
  function prepareChapterBody(raw = '') {
    const blocks = String(raw || '').split(/\n{2,}/);
    const kept = [];
    let pull = null;
    for (const block of blocks) {
      const t = block.trim();
      if (!t) continue;
      if (t.startsWith('>>')) {
        if (!pull) pull = t.replace(/^>>\s*/, '').trim();
        continue;
      }
      kept.push(block);
    }
    return { text: kept.join('\n\n'), pull };
  }

  function renderChapterBody(raw, subheadings = [], pullQuote = null) {
    const html = parseBody(raw, { subheadings });
    if (pullQuote) {
      return `${html}\n<blockquote class="inline-pull chapter-pull">${ri(pullQuote)}</blockquote>`;
    }
    return html;
  }

  /* callout stat */
  function calloutStat(stat) {
    if (!stat) return '';
    const m = stat.match(/^([\d.,]+[%x+k]*)\s+(.+)$/);
    if (m) return `<div class="callout-stat"><span class="callout-stat-value">${esc(m[1])}</span><span class="callout-stat-label">${esc(m[2])}</span></div>`;
    return `<div class="callout-stat-text">${esc(stat)}</div>`;
  }

  /* auto pull-quote extractor */
  function autoPull(body = '') {
    const clean = body.replace(/<[^>]+>/g,'').replace(/\*\*|_/g,'');
    const sents = clean.match(/[^.!?]{45,130}[.!?]/g) || [];
    const power = /\b(never|always|every|secret|truth|power|change|transform|only|real|stop|start|must|key|best|worst|fact)\b/i;
    return sents.find(s => power.test(s))?.trim() || sents[2]?.trim() || null;
  }

  const minChapterWords = project.pageBudget?.minWordsPerChapter || 1200;

  /* section quality checker */
  function checkSection(s) {
    const issues = [];
    const wc = (s.body||'').split(/\s+/).filter(Boolean).length;
    const type = (s.designIntent?.layout || s.type || 'chapter').toLowerCase();
    if (['imprint-sigil','publisher-intro','title-page','copyright-page','toc'].includes(type)) {
      return issues;
    }
    if (['chapter','section','introduction','intro','conclusion'].includes(type)) {
      if (wc < minChapterWords)            issues.push(`body too short (${wc} words, need ${minChapterWords}+)`);
      if (!s.body?.includes('>>') && !s.designIntent?.pullQuote) issues.push('no pull quote — add >> sentence');
      if (/<[a-z]/i.test(s.body||''))      issues.push('HTML tags detected in body');
    }
    if (type === 'checklist') {
      const lines = (s.body||'').split('\n').filter(l=>l.trim()).length;
      if (lines < 5) issues.push(`checklist has only ${lines} items (need 5+)`);
    }
    if (type === 'cta' && wc < 60) issues.push('CTA body too short');
    return issues;
  }

  /* ════════════════════════════════════════════════
     SECTION RENDERERS
  ════════════════════════════════════════════════ */

  function renderImprintSigil(s) {
    const logo = s.logoUrl || project.publisherProfile?.logoUrl || '';
    renderReport.sections.push({ title: s.title, type: 'imprint-sigil', issues: [] });
    return `
<section class="pg-section pg-imprint-sigil">
  <div class="imprint-sigil-inner">
    ${logo ? `<img class="imprint-sigil-logo" src="${esc(logo)}" alt="${esc(publisher)}">` : `<p class="imprint-sigil-text">${esc(publisher)}</p>`}
  </div>
</section>`;
  }

  function renderPublisherIntro(s) {
    renderReport.sections.push({ title: s.title, type: 'publisher-intro', issues: [] });
    return `
<section class="pg-section pg-publisher-intro">
  <div class="publisher-intro-inner">
    <h2 class="publisher-intro-title">${esc(s.title)}</h2>
    <div class="publisher-intro-body">${parseBody(s.body)}</div>
  </div>
</section>`;
  }

  function renderTitlePage(s) {
    renderReport.sections.push({ title: s.title, type: 'title-page', issues: [] });
    const lines = (s.body || '').split(/\n{2,}/).filter(Boolean);
    return `
<section class="pg-section pg-title-page">
  <div class="title-page-inner">
    <h1 class="title-page-heading">${esc(s.title)}</h1>
    ${lines.map(l => `<p class="title-page-line">${esc(l)}</p>`).join('')}
  </div>
</section>`;
  }

  function renderCopyrightPage(s) {
    renderReport.sections.push({ title: s.title, type: 'copyright-page', issues: [] });
    return `
<section class="pg-section pg-copyright-page">
  <div class="copyright-page-inner">
    <div class="copyright-body">${parseBody(s.body)}</div>
  </div>
</section>`;
  }

  function renderFrontmatter(s) {
    renderReport.sections.push({ title: s.title, type: 'frontmatter', issues: [] });
    return `
<section class="pg-section pg-frontmatter">
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

  function renderToc(all) {
    const items = all
      .filter(s => !['frontmatter','copyright','toc','references'].includes(s.type))
      .map((s,i) => `
      <li class="toc-item">
        <span class="toc-num">${i+1}</span>
        <span class="toc-dots"></span>
        <span class="toc-title">${esc(s.title)}</span>
      </li>`).join('');
    renderReport.sections.push({ title:'TOC', type:'toc', issues:[] });
    return `
<section class="pg-section pg-toc">
  <p class="eyebrow">Contents</p>
  <h2 class="section-heading">Table of Contents</h2>
  <ul class="toc-list">${items}</ul>
</section>`;
  }

  function renderChapter(s, num) {
    const intent  = s.designIntent || {};
    const stat    = intent.calloutStat || null;
    const subh    = Array.isArray(intent.subheadings) ? intent.subheadings : [];
    const issues  = checkSection(s);
    renderReport.sections.push({ title: s.title, type: 'chapter', issues, wordCount: (s.body||'').split(/\s+/).length });

    const { text: bodyText, pull: extractedPull } = prepareChapterBody(s.body);
    let pull = intent.pullQuote || extractedPull || null;
    if (!pull) pull = autoPull(bodyText);

    const imgUrl  = s.imageUrl || interiorImages[s.title] || null;
    const imgHtml = imgUrl ? `
  <div class="ch-image-band">
    <img src="${imgUrl}" alt="${esc(s.title)}" class="ch-image" loading="eager">
  </div>` : '';
    return `
<section class="pg-section pg-chapter" aria-label="${esc(s.title)}">
  <div class="chapter-opener">
    <span class="chapter-number" aria-hidden="true">${num}</span>
    <p class="eyebrow chapter-eyebrow">Chapter ${num}</p>
    <h2 class="section-heading">${esc(s.title)}</h2>
    <div class="chapter-rule"></div>
  </div>
  ${imgHtml}
  ${stat ? calloutStat(stat) : ''}
  <div class="chapter-body">${renderChapterBody(bodyText, subh, pull)}</div>
</section>`;
  }

  function renderChecklist(s) {
    const lines = (s.body||'').split('\n')
      .map(l => l.replace(/^[-•✓☐✗\d.]+\s*/,'').trim()).filter(l=>l.length>2);
    const items = lines.map(l=>`
      <li class="check-item">
        <span class="check-box"></span>
        <span class="check-text">${ri(l)}</span>
      </li>`).join('');
    renderReport.sections.push({ title:s.title, type:'checklist', issues:checkSection(s) });
    return `
<section class="pg-section pg-checklist" aria-label="${esc(s.title)}">
  <p class="eyebrow">Checklist</p>
  <h2 class="section-heading">${esc(s.title)}</h2>
  <ul class="check-list">${items}</ul>
</section>`;
  }

  function renderWorksheet(s) {
    const lines = (s.body||'').split('\n')
      .map(l=>l.replace(/^[-•\d.]+\s*/,'').trim()).filter(l=>l.length>2);
    const items = lines.map(l=>`
      <div class="ws-item">
        <p class="ws-prompt">${ri(l)}</p>
        <div class="ws-lines"><div class="ws-line"></div><div class="ws-line"></div><div class="ws-line"></div></div>
      </div>`).join('');
    renderReport.sections.push({ title:s.title, type:'worksheet', issues:[] });
    return `
<section class="pg-section pg-worksheet" aria-label="${esc(s.title)}">
  <p class="eyebrow">Exercise</p>
  <h2 class="section-heading">${esc(s.title)}</h2>
  <div class="ws-grid">${items}</div>
</section>`;
  }

  function renderCta(s) {
    const issues = checkSection(s);
    renderReport.sections.push({ title:s.title, type:'cta', issues });
    return `
<section class="pg-section pg-cta" aria-label="Call to action">
  <div class="cta-inner">
    <p class="eyebrow cta-eyebrow">Your Next Step</p>
    <div class="cta-rule"></div>
    <h2 class="cta-heading">${esc(s.title)}</h2>
    <div class="cta-body">${parseBody(s.body, { forCta:true })}</div>
  </div>
</section>`;
  }

  function renderPullquote(s) {
    const quote = (s.body||s.title||'').replace(/^[""']|[""']$/g,'').trim();
    renderReport.sections.push({ title:s.title, type:'pullquote', issues:[] });
    return `
<section class="pg-section pg-pullquote" aria-label="Quote">
  <div class="standalone-quote">
    <div class="sq-mark" aria-hidden="true">"</div>
    <blockquote class="sq-text">${esc(quote)}</blockquote>
    ${s.title && s.title !== quote ? `<cite class="sq-attr">— ${esc(s.title)}</cite>` : ''}
  </div>
</section>`;
  }

  function renderStatblock(s) {
    const lines = (s.body||'').split('\n').map(l=>l.trim()).filter(Boolean);
    const stats = lines.map(l => {
      const m = l.match(/^([^:–—]+)[:\s–—]+(.+)$/);
      return m ? { label:m[1].trim(), value:m[2].trim() } : { label:'', value:l };
    });
    const cols = stats.map(st=>`
      <div class="stat-col">
        <p class="stat-value">${esc(st.value)}</p>
        <p class="stat-label">${esc(st.label)}</p>
      </div>`).join('');
    renderReport.sections.push({ title:s.title, type:'statblock', issues:[] });
    return `
<section class="pg-section pg-statblock" aria-label="${esc(s.title)}">
  <p class="eyebrow">By the numbers</p>
  <h2 class="section-heading">${esc(s.title)}</h2>
  <div class="stat-grid">${cols}</div>
</section>`;
  }

  function renderReferences(cits) {
    if (!cits.length) return '';
    const items = cits.map((c,i)=>`
      <li class="ref-item">
        <span class="ref-num">${i+1}.</span>
        <div class="ref-body">
          <strong>${esc(c.title||'Source')}</strong>
          ${c.url ? `<br><a href="${esc(c.url)}" class="ref-link">${esc(c.url)}</a>` : ''}
          ${c.content ? `<br><em class="ref-excerpt">${esc(c.content.slice(0,180))}</em>` : ''}
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
    const issues = checkSection(s);
    renderReport.sections.push({ title:s.title, type:'default', issues });
    return `
<section class="pg-section pg-default" aria-label="${esc(s.title)}">
  <p class="eyebrow">${esc(s.type||'Section')}</p>
  <h2 class="section-heading">${esc(s.title)}</h2>
  <div class="section-body">${parseBody(s.body)}</div>
</section>`;
  }

  /* ── Router ── */
  const CHAPTER_TYPES = new Set(['chapter','section','introduction','intro','conclusion']);
  const NON_CHAPTER_PREFIX = new Set(['imprint-sigil','publisher-intro','title-page','copyright-page','frontmatter','copyright','toc']);
  function route(s, num, all) {
    const layout = (s.designIntent?.layout || s.type || 'chapter').toLowerCase().trim();
    switch (layout) {
      case 'imprint-sigil':                 return renderImprintSigil(s);
      case 'publisher-intro':               return renderPublisherIntro(s);
      case 'title-page':                    return renderTitlePage(s);
      case 'copyright-page':                return renderCopyrightPage(s);
      case 'frontmatter': case 'copyright': return renderFrontmatter(s);
      case 'toc':                           return renderToc(all);
      case 'chapter': case 'section':
      case 'introduction': case 'intro':
      case 'conclusion':                    return renderChapter(s, num);
      case 'checklist':                     return renderChecklist(s);
      case 'worksheet': case 'exercise':    return renderWorksheet(s);
      case 'cta':                           return renderCta(s);
      case 'pullquote': case 'quote':       return renderPullquote(s);
      case 'statblock': case 'stats':       return renderStatblock(s);
      default:                              return renderDefault(s);
    }
  }

  let chCount = 0;
  const sectionsHtml = sections.map(s => {
    const layout = (s.designIntent?.layout || s.type || '').toLowerCase();
    if (CHAPTER_TYPES.has(layout) && !NON_CHAPTER_PREFIX.has(layout)) chCount++;
    return route(s, chCount, sections);
  }).join('\n');

  const refsHtml    = renderReferences(citations);
  const backCoverBlock = project.backCoverHtml
    ? `<div class="back-cover-frame">${project.backCoverHtml}</div>`
    : '';
  const coverBlock  = (includeCover && coverHtml) ? `<div class="cover-frame">${coverHtml}</div>` : '';
  const weakCount   = renderReport.sections.filter(s => s.issues?.length > 0).length;
  if (weakCount) renderReport.warnings.push(`${weakCount} section(s) flagged for feedback loop`);

  /* ════════════════════════════════════════════════
     FULL HTML DOCUMENT
  ════════════════════════════════════════════════ */
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  ${inlineFontCss || (fontImport ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="${fontImport}" rel="stylesheet">` : '')}
  <style>
    /* KDP @page — page size includes 0.125in bleed on all sides when bleed:true */
    @page {
      size: ${pageW}in ${pageH}in;
      margin-top: ${margin}in; margin-bottom: ${(margin+0.14).toFixed(3)}in;
      margin-outside: ${margin}in; margin-inside: ${gutter}in;
      ${bleed ? '/* bleed: 0.125in on all sides — background fills to page edge */' : ''}
    }
    @page :left  { @top-left   { content:"${esc(title)}";  font-family:${bodyFont}; font-size:7pt; color:#aaa; letter-spacing:.04em; } @bottom-center { content:counter(page); font-family:${bodyFont}; font-size:7.5pt; color:#bbb; } }
    @page :right { @top-right  { content:"${esc(author)}"; font-family:${bodyFont}; font-size:7pt; color:#aaa; letter-spacing:.04em; } @bottom-center { content:counter(page); font-family:${bodyFont}; font-size:7.5pt; color:#bbb; } }
    @page :first { @top-left:none; @top-right:none; @bottom-center:none; }

    *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
    html { font-size:11pt; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    body {
      font-family:${bodyFont}; font-size:${t.bSize}; line-height:${t.lh};
      color:${pageFg}; background:${pageBg};
      hyphens:auto; -webkit-hyphens:auto;
      orphans:3; widows:3;
      text-rendering:optimizeLegibility;
    }
    .book-wrap { max-width:${pageW}in; margin:0 auto; background:${pageBg}; }
    @media screen { body{padding:.4in;background:#dde0e6;} .book-wrap{padding:${margin}in ${gutter}in;box-shadow:0 2px 48px rgba(0,0,0,.18);} }

    .cover-frame { width:100%; break-after:page; page-break-after:always; overflow:hidden; }

    .pg-section { padding:${t.gap} 0 0.44in; border-bottom:.5pt solid ${ruleColor}; break-inside:avoid; page-break-inside:avoid; }
    .pg-section:last-child { border-bottom:none; }

    .eyebrow { display:block; font-family:${bodyFont}; font-size:7pt; font-weight:700; letter-spacing:${t.track}; text-transform:uppercase; color:${eyebrowClr}; margin:0 0 9pt; }
    .section-heading { font-family:${headingFont}; font-size:${t.hSize}; font-weight:${t.hWeight}; line-height:1.10; letter-spacing:-.022em; color:${pageFg}; margin:0 0 14pt; }

    p { margin:0 0 8pt; font-size:${t.bSize}; line-height:${t.lh}; }
    p.indented { text-indent:1.5em; }
    strong { font-weight:700; }
    em { font-style:italic; }
    h3.body-subhead { font-family:${headingFont}; font-size:${t.shSize}; font-weight:${t.shWeight}; margin:18pt 0 8pt; color:${pageFg}; letter-spacing:-.01em; break-after:avoid; }
    .body-list { padding-left:15pt; margin:7pt 0 12pt; }
    .body-list li { margin-bottom:5pt; font-size:${t.bSize}; line-height:1.56; }
    ol.body-list li::marker { color:${eyebrowClr}; font-weight:700; }
    blockquote.inline-pull { background:${pullBg}; border-left:3pt solid ${pullBorder}; padding:10pt 14pt; margin:15pt 0; font-size:10.5pt; font-style:italic; color:${pageFg}; border-radius:0 4pt 4pt 0; break-inside:avoid; }

    .callout-stat { display:flex; flex-direction:column; align-items:center; padding:14pt 0 18pt; text-align:center; break-inside:avoid; }
    .callout-stat-value { font-family:${titleFont}; font-size:38pt; font-weight:900; color:${accent}; line-height:1; letter-spacing:-.03em; }
    .callout-stat-label { font-size:9pt; font-weight:600; text-transform:uppercase; letter-spacing:.10em; color:#888; margin-top:4pt; }
    .callout-stat-text { background:${pullBg}; border-left:3pt solid ${accent}; padding:10pt 14pt; margin:14pt 0; font-size:10.5pt; font-weight:600; }

    .pg-imprint-sigil { min-height:7.2in; display:flex; align-items:center; justify-content:center; break-after:page; page-break-after:always; border-bottom:none; padding:0; }
    .imprint-sigil-inner { text-align:center; width:100%; }
    .imprint-sigil-logo { max-width:3.2in; max-height:3.2in; object-fit:contain; }
    .imprint-sigil-text { font-family:${titleFont}; font-size:22pt; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:${pageFg}; }

    .pg-publisher-intro { break-after:page; page-break-after:always; padding-top:0.6in; }
    .publisher-intro-title { font-family:${titleFont}; font-size:18pt; font-weight:800; letter-spacing:.08em; text-transform:uppercase; text-align:center; margin:0 0 28pt; color:${accent}; }
    .publisher-intro-body p { font-size:10.5pt; line-height:1.62; margin-bottom:10pt; text-align:justify; }

    .pg-title-page { min-height:6.5in; display:flex; align-items:center; break-after:page; page-break-after:always; border-bottom:none; }
    .title-page-inner { width:100%; text-align:center; }
    .title-page-heading { font-family:${titleFont}; font-size:28pt; font-weight:700; line-height:1.08; margin:0 0 14pt; letter-spacing:-.02em; }
    .title-page-line { font-size:12pt; color:#666; margin:0 0 8pt; }

    .pg-copyright-page { break-after:page; page-break-after:always; padding-top:0.5in; border-bottom:none; }
    .copyright-page-inner { max-width:4.5in; }
    .copyright-body p { font-size:8.5pt; line-height:1.55; color:#555; margin-bottom:8pt; }

    .back-cover-frame { width:100%; break-before:page; page-break-before:always; overflow:hidden; }
    .back-cover-page { min-height:${pageH}in; padding:${margin}in; background:${pageBg}; color:${pageFg}; display:flex; align-items:flex-start; }
    .back-cover-inner { width:100%; }
    .back-cover-blurb { font-size:11pt; line-height:1.58; margin-bottom:14pt; }
    .back-cover-bullets { margin:0 0 16pt 16pt; font-size:10pt; line-height:1.5; }
    .back-cover-bullets li { margin-bottom:6pt; }
    .back-cover-author { font-size:9pt; color:#666; margin-bottom:12pt; font-style:italic; }
    .back-cover-publisher { font-size:8pt; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:${eyebrowClr}; }
    .back-cover-barcode { margin-top:24pt; width:2in; height:1in; border:1pt dashed #ccc; display:flex; align-items:center; justify-content:center; font-size:7pt; color:#aaa; }

    .pg-frontmatter { min-height:5.8in; display:flex; align-items:center; break-after:page; page-break-after:always; }
    .frontmatter-inner { max-width:5in; }
    .fm-publisher { font-size:7.5pt; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:${eyebrowClr}; margin-bottom:18pt; }
    .fm-title { font-family:${titleFont}; font-size:26pt; font-weight:700; line-height:1.06; letter-spacing:-.022em; margin:0 0 8pt; }
    .fm-subtitle { font-size:12pt; color:#666; font-style:italic; margin:0 0 22pt; }
    .fm-rule { width:28pt; height:2pt; background:${accent}; margin:0 0 22pt; border-radius:1pt; }
    .fm-body p { font-size:9pt; color:#555; margin-bottom:5pt; }
    .fm-copyright { margin-top:24pt; font-size:8pt; color:#aaa; }

    .pg-toc { break-after:page; page-break-after:always; }
    .toc-list { list-style:none; margin-top:12pt; }
    .toc-item { display:flex; align-items:baseline; gap:6pt; padding:7pt 0; border-bottom:.5pt dotted ${ruleColor}; }
    .toc-item:last-child { border-bottom:none; }
    .toc-num { font-family:${headingFont}; font-weight:700; font-size:8.5pt; color:${chNumClr}; min-width:16pt; flex-shrink:0; }
    .toc-dots { flex:1; border-bottom:1pt dotted ${ruleColor}; margin-bottom:3pt; }
    .toc-title { font-size:10.5pt; color:${pageFg}; }

    .pg-chapter { break-before:page; page-break-before:always; }
    .chapter-opener { margin-bottom:18pt; }
    .chapter-number { display:block; font-family:${titleFont}; font-size:${t.chNum}; font-weight:900; line-height:1; color:${accent}; opacity:${t.chOp}; letter-spacing:-.05em; margin-bottom:-26pt; user-select:none; }
    .chapter-rule { width:100%; height:.5pt; background:${ruleColor}; margin:16pt 0 22pt; }
    .ch-image-band { width:100%; margin:0 0 22pt; break-inside:avoid; overflow:hidden; border-radius:4pt; }
    .ch-image { width:100%; max-height:2.4in; object-fit:cover; display:block; }
    .chapter-eyebrow { letter-spacing:.06em; }
    .chapter-body { clear:both; }
    .chapter-body p { text-align:justify; hyphens:auto; max-width:100%; }
    .chapter-body p:first-child { text-indent:0; }
    .chapter-body p:first-child::first-letter {
      float:left; font-family:${titleFont}; font-size:${t.drop}; line-height:.82;
      font-weight:700; color:${accent}; margin:2pt 8pt 0 0; padding:0;
    }
    blockquote.chapter-pull { margin-top:18pt; break-inside:avoid; page-break-inside:avoid; }

    .check-list { list-style:none; margin:10pt 0 0; }
    .check-item { display:flex; align-items:flex-start; gap:10pt; padding:9pt 0; border-bottom:.5pt solid ${ruleColor}; break-inside:avoid; }
    .check-item:last-child { border-bottom:none; }
    .check-box { flex-shrink:0; width:13pt; height:13pt; border:1.5pt solid ${checkColor}; border-radius:3pt; margin-top:1pt; }
    .check-text { font-size:10.5pt; line-height:1.52; flex:1; }

    .ws-grid { display:flex; flex-direction:column; gap:18pt; margin-top:12pt; }
    .ws-item { break-inside:avoid; }
    .ws-prompt { font-size:10.5pt; font-weight:600; margin-bottom:8pt; }
    .ws-lines { display:flex; flex-direction:column; gap:10pt; }
    .ws-line { height:0; border-bottom:1pt solid ${ruleColor}; }

    .pg-cta { background:${ctaBg}; color:${ctaFg}; border:none; padding:0; }
    .cta-inner { padding:.62in .55in; min-height:3.8in; display:flex; flex-direction:column; justify-content:center; }
    .cta-eyebrow { color:${accent}; }
    .cta-rule { width:32pt; height:3pt; background:${accent}; border-radius:1.5pt; margin:0 0 20pt; }
    .cta-heading { font-family:${titleFont}; font-size:26pt; font-weight:700; line-height:1.08; color:${ctaFg}; letter-spacing:-.022em; margin:0 0 18pt; max-width:4.5in; }
    .cta-body p { color:rgba(255,255,255,.82); font-size:11pt; line-height:1.64; }
    .cta-body .body-list li { color:rgba(255,255,255,.82); }

    .pg-pullquote { min-height:4.8in; display:flex; align-items:center; justify-content:center; break-before:page; page-break-before:always; border:none; }
    .standalone-quote { text-align:center; max-width:4.2in; }
    .sq-mark { font-family:${titleFont}; font-size:72pt; line-height:.68; color:${accent}; opacity:.28; display:block; margin-bottom:12pt; }
    .sq-text { font-family:${titleFont}; font-size:16pt; font-style:italic; line-height:1.44; color:${pageFg}; }
    .sq-attr { display:block; margin-top:14pt; font-size:8.5pt; color:${eyebrowClr}; letter-spacing:.08em; text-transform:uppercase; }

    .stat-grid { display:flex; margin-top:14pt; border-top:2pt solid ${accent}; border-bottom:2pt solid ${accent}; }
    .stat-col { flex:1; padding:15pt 12pt; text-align:center; border-right:.5pt solid ${ruleColor}; }
    .stat-col:last-child { border-right:none; }
    .stat-value { font-family:${titleFont}; font-size:26pt; font-weight:900; color:${accent}; line-height:1; margin:0 0 4pt; }
    .stat-label { font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#888; margin:0; }

    .ref-list { list-style:none; margin-top:10pt; }
    .ref-item { display:flex; gap:8pt; margin-bottom:10pt; font-size:8.5pt; break-inside:avoid; }
    .ref-num { color:${eyebrowClr}; font-weight:700; flex-shrink:0; min-width:14pt; }
    .ref-body { flex:1; line-height:1.5; }
    .ref-link { color:${accent}; word-break:break-all; font-size:8pt; }
    .ref-excerpt { color:#777; display:block; margin-top:2pt; }

    .book-footer { text-align:center; padding:16pt 0 22pt; font-size:7.5pt; color:#bbb; border-top:.5pt solid ${ruleColor}; margin-top:20pt; }

    @media print { body{background:#fff;padding:0;} .book-wrap{box-shadow:none;max-width:none;padding:0;} }
  </style>
</head>
<body>
<div class="book-wrap">
  ${coverBlock}
  ${sectionsHtml}
  ${refsHtml}
  ${backCoverBlock}
  <footer class="book-footer">${esc(copyright)} &nbsp;·&nbsp; ${esc(publisher)}</footer>
</div>
</body>
</html>`;

  return { html, renderReport };
}

function esc(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
