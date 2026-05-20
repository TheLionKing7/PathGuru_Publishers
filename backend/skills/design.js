/**
 * PathGuru Publishers — Design Agent  (Phase 2)
 *
 * Responsibilities:
 *  1. Resolve full design token set from publisher profile + style system
 *  2. Search Pexels for a cover image matching the book niche/topic
 *  3. Compose a proper cover: full-bleed image, gradient scrim, typographic hierarchy
 *  4. Return a design package consumed by formatting.js
 *
 * Cover anatomy (top → bottom of 6×9in page):
 *   ┌─────────────────────────────┐
 *   │  [publisher name / logo]    │  ← publisher bar, top
 *   │                             │
 *   │   [full-bleed Pexels photo] │  ← fills entire cover
 *   │                             │
 *   │  ░░░░ gradient scrim ░░░░░  │  ← darkens bottom 60% for legibility
 *   │                             │
 *   │  ▬ accent rule              │
 *   │  Book Title in Display Type │
 *   │  Subtitle in italic body    │
 *   │  ─────────────────────────  │
 *   │  By Author Name             │
 *   └─────────────────────────────┘
 */

import { searchPexels } from '../pexelsAssets.js';
import { getInlineFontCss } from '../fontEmbedder.js';

/* ── Style token library ──────────────────────────────────────────────── */
const STYLE_TOKENS = {
  premium: {
    coverScrim:     'linear-gradient(to top, rgba(10,8,4,0.97) 0%, rgba(10,8,4,0.82) 45%, rgba(10,8,4,0.25) 75%, transparent 100%)',
    coverBg:        '#1a1008',
    titleFont:      "'Playfair Display', Georgia, 'Times New Roman', serif",
    headingFont:    "'Playfair Display', Georgia, serif",
    bodyFont:       "'DM Sans', Garamond, Georgia, serif",
    accent:         '#c9a84c',
    accentDim:      '#8a6f2e',
    pageBackground: '#fffdf8',
    pageFg:         '#1a1008',
    ruleColor:      '#e8dcc8',
    pullBg:         '#f7f2e8',
    pullBorder:     '#c9a84c',
    ctaBg:          '#1a1008',
    ctaFg:          '#fffdf8',
    chapterNumFg:   '#c9a84c',
    eyebrowColor:   '#c9a84c',
    checkColor:     '#c9a84c',
    shadowCard:     'rgba(26,16,8,0.10)',
  },
  modern: {
    coverScrim:     'linear-gradient(to top, rgba(6,18,42,0.96) 0%, rgba(6,18,42,0.75) 45%, rgba(6,18,42,0.18) 78%, transparent 100%)',
    coverBg:        '#06122a',
    titleFont:      "'DM Sans', Inter, Arial, sans-serif",
    headingFont:    "'DM Sans', Inter, Arial, sans-serif",
    bodyFont:       "'DM Sans', Inter, Arial, sans-serif",
    accent:         '#2bb3a3',
    accentDim:      '#1d7a70',
    pageBackground: '#f6f8fb',
    pageFg:         '#16213e',
    ruleColor:      '#d1dce8',
    pullBg:         '#eef4fb',
    pullBorder:     '#2bb3a3',
    ctaBg:          '#16213e',
    ctaFg:          '#f6f8fb',
    chapterNumFg:   '#2bb3a3',
    eyebrowColor:   '#2bb3a3',
    checkColor:     '#2bb3a3',
    shadowCard:     'rgba(22,33,62,0.10)',
  },
  bold: {
    coverScrim:     'linear-gradient(to top, rgba(10,10,10,0.97) 0%, rgba(10,10,10,0.72) 42%, rgba(10,10,10,0.15) 72%, transparent 100%)',
    coverBg:        '#0a0a0a',
    titleFont:      "'DM Sans', 'Arial Black', Arial, sans-serif",
    headingFont:    "'DM Sans', 'Arial Black', Arial, sans-serif",
    bodyFont:       "'DM Sans', Arial, Helvetica, sans-serif",
    accent:         '#e84855',
    accentDim:      '#a02030',
    pageBackground: '#ffffff',
    pageFg:         '#171717',
    ruleColor:      '#e0e0e0',
    pullBg:         '#fff5f5',
    pullBorder:     '#e84855',
    ctaBg:          '#171717',
    ctaFg:          '#ffffff',
    chapterNumFg:   '#e84855',
    eyebrowColor:   '#e84855',
    checkColor:     '#e84855',
    shadowCard:     'rgba(0,0,0,0.12)',
  },
};

const FONT_IMPORTS = {
  premium: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500;600&display=swap',
  modern:  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap',
  bold:    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap',
};

/* ── Cover image search ───────────────────────────────────────────────── */
async function fetchCoverImage(project, manuscript) {
  try {
    const niche   = project.niche  || '';
    const topic   = project.topic  || manuscript?.title || '';
    const keyword = buildCoverKeyword(niche, topic);
    const images  = await searchPexels(keyword, { orientation: 'portrait', perPage: 15 });
    if (!images?.length) return null;
    const portrait = images.filter(i => i.height >= i.width);
    const pool     = portrait.length >= 3 ? portrait : images;
    return { url: pool[0].src?.large || pool[0].src?.medium || '', credit: pool[0].photographer || 'Pexels', keyword };
  } catch {
    return null;
  }
}

function buildCoverKeyword(niche, topic) {
  const map = {
    'marketing|sales|brand|copywriting':    'professional marketing strategy laptop',
    'business|startup|entrepreneur':        'professional business office success',
    'finance|invest|money|wealth':          'finance investment modern',
    'health|wellness|nutrition':            'healthy lifestyle wellness nature',
    'fitness|gym|workout|exercise':         'fitness training athlete lifestyle',
    'mindset|productivity|habit|goal':      'mindset clarity focus meditation',
    'leadership|management|team':           'leadership team boardroom',
    'education|course|teach|learn':         'learning books education desk',
    'technology|digital|ai|software':       'technology digital innovation abstract',
    'real estate|property|housing':         'real estate modern architecture',
    'beauty|salon|skincare|hair':           'beauty salon professional studio',
    'parenting|family|children|kids':       'family warmth home children',
    'faith|spiritual|church|christian':     'peaceful nature light spiritual',
    'food|culinary|recipe|cooking':         'gourmet food culinary kitchen',
    'travel|adventure|explore':             'travel adventure landscape',
  };
  const lower = (niche + ' ' + topic).toLowerCase();
  for (const [pattern, kw] of Object.entries(map)) {
    if (new RegExp(pattern).test(lower)) return kw;
  }
  const words = topic.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(w => w.length > 3).slice(0, 3);
  return words.length ? words.join(' ') : 'professional success achievement light';
}

/* ── Cover compositor ─────────────────────────────────────────────────── */
function composeCoverHtml({ project, manuscript, tokens, coverImage, fontImport, inlineFontCss }) {
  const title     = esc(manuscript?.title    || project.title    || 'Untitled');
  const subtitle  = manuscript?.subtitle || project.subtitle || '';
  const author    = project.author || '';
  const publisher = project.publisher || 'PathGuru Publishers';
  const niche     = project.niche || '';
  const logoUrl   = project.publisherProfile?.logoUrl || '';

  const logoHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(publisher)}"
           style="height:26px;object-fit:contain;filter:brightness(0) invert(1);opacity:.88;">`
    : `<span style="font-family:${tokens.bodyFont};font-size:9.5pt;font-weight:700;
                    letter-spacing:.07em;color:rgba(255,255,255,.85);">${esc(publisher)}</span>`;

  const imageLayer = coverImage?.url
    ? `<img src="${esc(coverImage.url)}" alt="Cover visual"
           style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;z-index:0;">`
    : `<div style="position:absolute;inset:0;
                   background:linear-gradient(155deg, ${tokens.accent}22 0%, ${tokens.coverBg} 60%);
                   z-index:0;"></div>`;

  const creditLine = coverImage?.credit
    ? `<p style="position:absolute;bottom:5pt;right:8pt;z-index:4;
                  font-size:6pt;color:rgba(255,255,255,.28);
                  font-family:${tokens.bodyFont};margin:0;">
         Photo: ${esc(coverImage.credit)} / Pexels
       </p>`
    : '';

  const subtitleHtml = subtitle
    ? `<p style="font-family:${tokens.bodyFont};font-size:12.5pt;font-weight:400;
                  font-style:italic;color:rgba(255,255,255,.76);
                  line-height:1.45;margin:0 0 18pt;max-width:4.2in;">
         ${esc(subtitle)}
       </p>`
    : '';

  const authorHtml = author
    ? `<div style="margin-top:16pt;">
         <div style="width:100%;height:.5pt;background:rgba(255,255,255,.22);margin-bottom:12pt;"></div>
         <p style="font-family:${tokens.bodyFont};font-size:10pt;font-weight:500;
                    color:rgba(255,255,255,.72);letter-spacing:.02em;margin:0;">
           By ${esc(author)}
         </p>
       </div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  ${inlineFontCss || `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="${fontImport}" rel="stylesheet">`}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: ${tokens.coverBg}; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover {
      position: relative;
      width: 6in; height: 9in;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    @media screen { .cover { margin: 0 auto; box-shadow: 0 12px 60px rgba(0,0,0,.5); } }
    @media print  { .cover { break-after: page; } }
  </style>
</head>
<body>
<div class="cover">

  ${imageLayer}

  <!-- Scrim -->
  <div style="position:absolute;inset:0;background:${tokens.coverScrim};z-index:1;"></div>

  <!-- Publisher bar (top) -->
  <div style="position:relative;z-index:3;
              display:flex;align-items:center;justify-content:space-between;
              padding:20pt 22pt 0;">
    ${logoHtml}
    ${niche ? `<span style="font-family:${tokens.bodyFont};font-size:7pt;font-weight:700;
                             letter-spacing:.12em;text-transform:uppercase;
                             background:${tokens.accent};color:#fff;
                             padding:2.5pt 8pt;border-radius:2pt;">${esc(niche)}</span>` : ''}
  </div>

  <!-- Flex spacer -->
  <div style="flex:1;"></div>

  <!-- Bottom text block -->
  <div style="position:relative;z-index:3;padding:0 22pt 28pt;">

    <!-- Accent rule -->
    <div style="width:32pt;height:3pt;background:${tokens.accent};
                border-radius:1.5pt;margin-bottom:16pt;"></div>

    <!-- Title -->
    <h1 style="font-family:${tokens.titleFont};
               font-size:33pt;
               font-weight:700;
               line-height:1.06;
               letter-spacing:-0.02em;
               color:#fff;
               margin:0 0 13pt;
               max-width:4.6in;">
      ${title}
    </h1>

    ${subtitleHtml}
    ${authorHtml}

  </div>

  ${creditLine}
</div>
</body>
</html>`;
}

/* ── Main export ──────────────────────────────────────────────────────── */
export async function runDesignAgent(input, project, research, manuscript) {
  const style      = ((input.style || project.style || 'modern')).toLowerCase();
  const tokens     = STYLE_TOKENS[style] || STYLE_TOKENS.modern;
  const fontImport = FONT_IMPORTS[style]  || FONT_IMPORTS.modern;

  const palette = {
    primary:        input.brandPrimaryColor   || tokens.accent,
    secondary:      input.brandSecondaryColor || tokens.ctaBg,
    accent:         tokens.accent,
    accentDim:      tokens.accentDim,
    pageBackground: tokens.pageBackground,
    pageFg:         tokens.pageFg,
    ruleColor:      tokens.ruleColor,
    pullBg:         tokens.pullBg,
    pullBorder:     tokens.pullBorder,
    ctaBg:          tokens.ctaBg,
    ctaFg:          tokens.ctaFg,
    eyebrowColor:   tokens.eyebrowColor,
    checkColor:     tokens.checkColor,
    chapterNumFg:   tokens.chapterNumFg,
    shadowCard:     tokens.shadowCard,
  };

  const coverImage = await fetchCoverImage(project, manuscript);

  const inlineFontCss = await getInlineFontCss(style).catch(() => '');

  const coverHtml = composeCoverHtml({ project, manuscript, tokens, coverImage, fontImport, inlineFontCss });

  return {
    design: {
      style,
      palette,
      fontStack:   input.brandFontStack || tokens.bodyFont,
      titleFont:   tokens.titleFont,
      headingFont: tokens.headingFont,
      bodyFont:    tokens.bodyFont,
      fontImport,
      inlineFontCss,
      coverImage,
      tokens,
    },
    coverHtml,
  };
}

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
