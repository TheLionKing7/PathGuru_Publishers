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
  // ── Digital Nation Inc. — deep navy + gold authority (Van Shelby / Henry Haastrup style)
  digitalNation: {
    coverScrim:     'linear-gradient(to top, rgba(27,42,74,0.97) 0%, rgba(27,42,74,0.85) 40%, rgba(27,42,74,0.40) 68%, transparent 100%)',
    coverBg:        '#1B2A4A',
    titleFont:      "'DM Sans', Arial, sans-serif",
    headingFont:    "'DM Sans', Arial, sans-serif",
    bodyFont:       "'DM Sans', Arial, sans-serif",
    accent:         '#C9A446',
    accentDim:      '#8a6f2e',
    pageBackground: '#FFFFFF',
    pageFg:         '#1A1A1A',
    ruleColor:      '#D1DCE8',
    pullBg:         '#F5F0DC',
    pullBorder:     '#C9A446',
    ctaBg:          '#1B2A4A',
    ctaFg:          '#FFFFFF',
    chapterNumFg:   '#C9A446',
    eyebrowColor:   '#C9A446',
    checkColor:     '#C9A446',
    shadowCard:     'rgba(27,42,74,0.12)',
    // extras used by the chapter opener
    chapterOpenerBg: '#1B2A4A',
    chapterOpenerFg: '#FFFFFF',
    chapterOpenerAccent: '#C9A446',
    tableHeaderBg:  '#1B2A4A',
    tableAltRow:    '#EEF1F8',
    calloutInsiderBg: '#1B2A4A',
    calloutFormulaBg: '#F5F0DC',
  },
  // ── PathFinda Publishers — sophisticated navy + electric blue (James Baldwin style)
  pathfinda: {
    coverScrim:     'linear-gradient(to top, rgba(11,23,42,0.97) 0%, rgba(11,23,42,0.82) 42%, rgba(11,23,42,0.22) 72%, transparent 100%)',
    coverBg:        '#0B172A',
    titleFont:      "'DM Sans', Inter, Arial, sans-serif",
    headingFont:    "'DM Sans', Inter, Arial, sans-serif",
    bodyFont:       "'DM Sans', Inter, Arial, sans-serif",
    accent:         '#3EA1FF',
    accentDim:      '#1a6bbf',
    pageBackground: '#F6F8FB',
    pageFg:         '#0B172A',
    ruleColor:      '#D1DCE8',
    pullBg:         '#EEF4FB',
    pullBorder:     '#3EA1FF',
    ctaBg:          '#0B172A',
    ctaFg:          '#F6F8FB',
    chapterNumFg:   '#3EA1FF',
    eyebrowColor:   '#3EA1FF',
    checkColor:     '#3EA1FF',
    shadowCard:     'rgba(11,23,42,0.10)',
    chapterOpenerBg: '#0B172A',
    chapterOpenerFg: '#FFFFFF',
    chapterOpenerAccent: '#3EA1FF',
    tableHeaderBg:  '#0B172A',
    tableAltRow:    '#EEF4FB',
    calloutInsiderBg: '#0B172A',
    calloutFormulaBg: '#EEF4FB',
  },
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
  digitalNation: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;900&display=swap',
  pathfinda:     'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;900&display=swap',
  premium:       'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500;600&display=swap',
  modern:        'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap',
  bold:          'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap',
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

/* ── Data-viz cover (Digital Nation Inc. / PathFinda style) ────────────── */
function composeDataVizCover({ project, manuscript, tokens, fontImport, inlineFontCss, style }) {
  const title     = manuscript?.title    || project.title    || 'Untitled';
  const subtitle  = manuscript?.subtitle || project.subtitle || '';
  const author    = project.author || '';
  const publisher = project.publisher || 'PathGuru Publishers';
  const stats     = project.coverStats || [];

  // Build stats bar HTML (3–4 boxes)
  const defaultStats = [
    { label: project.chapterCount ? `${project.chapterCount} CHAPTERS` : '10 CHAPTERS', sub: '' },
    { label: 'BEGINNER FRIENDLY', sub: '' },
    { label: '2026 EDITION', sub: '' },
  ];
  const statItems = (stats.length ? stats : defaultStats).slice(0, 4);
  const statsBarHtml = statItems.map(s => `
    <div style="flex:1;border:0.5pt solid ${tokens.accent}44;background:rgba(255,255,255,0.06);
                padding:7pt 6pt;text-align:center;">
      <div style="font-family:${tokens.bodyFont};font-size:8pt;font-weight:700;
                  color:${tokens.accent};letter-spacing:.06em;">${esc(s.label)}</div>
      ${s.sub ? `<div style="font-size:6.5pt;color:rgba(255,255,255,.55);margin-top:2pt;">${esc(s.sub)}</div>` : ''}
    </div>`).join('');

  // Title split: "INVESTING FOR" / "BEGINNERS" pattern
  const titleWords = title.toUpperCase().split(/\s+/);
  const titleLine1 = titleWords.length > 2 ? titleWords.slice(0, -1).join(' ') : titleWords[0] || title.toUpperCase();
  const titleLine2 = titleWords.length > 1 ? titleWords[titleWords.length - 1] : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  ${inlineFontCss || `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="${fontImport}" rel="stylesheet">`}
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    html,body{width:100%;height:100%;background:${tokens.coverBg};}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .cover{position:relative;width:6in;height:9in;overflow:hidden;
           display:flex;flex-direction:column;background:${tokens.coverBg};}
    @media screen{.cover{margin:0 auto;box-shadow:0 12px 60px rgba(0,0,0,.5);}}
    @media print{.cover{break-after:page;}}
  </style>
</head>
<body>
<div class="cover">

  <!-- Dot-grid background -->
  <svg style="position:absolute;inset:0;width:100%;height:100%;z-index:0;opacity:.18;" xmlns="http://www.w3.org/2000/svg">
    <defs><pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.2" fill="${tokens.accent}"/>
    </pattern></defs>
    <rect width="100%" height="100%" fill="url(#dots)"/>
  </svg>

  <!-- Growth chart (exponential curve SVG) -->
  <svg style="position:absolute;left:5%;top:10%;width:90%;height:44%;z-index:1;" viewBox="0 0 500 280" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Fill area -->
    <path d="M0,280 C60,270 120,255 180,230 C240,202 290,165 340,120 C390,74 440,40 500,10 L500,280 Z"
          fill="${tokens.accent}22" stroke="none"/>
    <!-- Curve line -->
    <path d="M0,280 C60,270 120,255 180,230 C240,202 290,165 340,120 C390,74 440,40 500,10"
          fill="none" stroke="${style === 'digitalNation' ? '#2ECC71' : tokens.accent}" stroke-width="3" stroke-linecap="round"/>
    <!-- Data point dots -->
    <circle cx="180" cy="230" r="7" fill="${tokens.accent}" opacity=".9"/>
    <circle cx="340" cy="120" r="7" fill="${style === 'digitalNation' ? '#2E8B8B' : tokens.accent}" opacity=".9"/>
    <!-- Labels -->
    <text x="195" y="225" font-family="DM Sans, Arial" font-size="11" font-weight="700" fill="${tokens.accent}">START</text>
    <text x="355" y="115" font-family="DM Sans, Arial" font-size="11" font-weight="700" fill="${style === 'digitalNation' ? '#2ECC71' : tokens.accent}">GROWTH</text>
  </svg>

  <!-- Publisher bar (top) -->
  <div style="position:relative;z-index:4;display:flex;align-items:center;
              justify-content:space-between;padding:18pt 20pt 0;">
    <span style="font-family:${tokens.bodyFont};font-size:8pt;font-weight:700;
                 letter-spacing:.10em;color:${tokens.accent};text-transform:uppercase;">
      ${esc(publisher)}
    </span>
    ${project.niche ? `<span style="font-family:${tokens.bodyFont};font-size:6.5pt;font-weight:700;
                             letter-spacing:.10em;text-transform:uppercase;color:rgba(255,255,255,.55);">
      ${esc(project.niche)}</span>` : ''}
  </div>

  <!-- Gold top rule -->
  <div style="position:relative;z-index:4;margin:10pt 20pt 0;
              height:1pt;background:${tokens.accent};opacity:.6;"></div>

  <!-- Spacer pushes content to bottom half -->
  <div style="flex:1;min-height:2.2in;"></div>

  <!-- Stats bar -->
  <div style="position:relative;z-index:4;display:flex;gap:0;margin:0 20pt 14pt;">
    ${statsBarHtml}
  </div>

  <!-- Title block -->
  <div style="position:relative;z-index:4;padding:0 20pt 0;">
    <div style="font-family:${tokens.bodyFont};font-size:18pt;font-weight:700;
                color:#FFFFFF;letter-spacing:-.01em;line-height:1.1;margin-bottom:2pt;">
      ${esc(titleLine1)}
    </div>
    <div style="font-family:${tokens.bodyFont};font-size:44pt;font-weight:900;
                color:${tokens.accent};letter-spacing:-.03em;line-height:.92;margin-bottom:10pt;">
      ${esc(titleLine2 || titleLine1)}
    </div>
    ${subtitle ? `<div style="font-family:${tokens.bodyFont};font-size:9pt;font-weight:400;
                               color:rgba(255,255,255,.70);line-height:1.45;margin-bottom:12pt;
                               max-width:4.2in;">${esc(subtitle)}</div>` : ''}
  </div>

  <!-- Gold divider -->
  <div style="position:relative;z-index:4;margin:0 20pt;height:1pt;background:${tokens.accent};opacity:.55;"></div>

  <!-- Author + copyright -->
  <div style="position:relative;z-index:4;padding:8pt 20pt 18pt;
              display:flex;justify-content:space-between;align-items:flex-end;">
    <span style="font-family:${tokens.bodyFont};font-size:11pt;font-weight:700;
                 color:${tokens.accent};letter-spacing:.02em;">${esc(author.toUpperCase())}</span>
    <span style="font-family:${tokens.bodyFont};font-size:6.5pt;color:rgba(255,255,255,.45);
                 letter-spacing:.03em;">© ${new Date().getFullYear()} ${esc(publisher)}</span>
  </div>

</div>
</body>
</html>`;
}

/* ── Standard photo cover compositor ─────────────────────────────────────── */
function composeCoverHtml({ project, manuscript, tokens, coverImage, fontImport, inlineFontCss, style }) {
  // Digital Nation / PathFinda get the data-viz cover regardless of image availability
  if (style === 'digitalNation' || style === 'pathfinda') {
    return composeDataVizCover({ project, manuscript, tokens, fontImport, inlineFontCss, style });
  }

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
  // Publisher profile style takes precedence over generic style input
  const style      = ((project.publisherProfile?.resolvedStyle || input.style || project.style || 'modern')).toLowerCase();
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

  // Inject research-driven cover stats if the quality gate extracted them
  if (research?.coverStats?.length && !project.coverStats?.length) {
    project.coverStats = research.coverStats;
  }

  // If no research stats, extract key data points from research summary for cover
  if (!project.coverStats?.length && research?.summary) {
    const statsMatches = research.summary.match(/\d[\d,.]+\s*(?:%|billion|million|x\b|times|percent|studies|hours?|days?|years?)[^\n.]{0,60}/gi) || [];
    if (statsMatches.length >= 2) {
      project.coverStats = statsMatches.slice(0, 3).map(s => ({
        label: s.replace(/['"]/g, '').trim().slice(0, 40).toUpperCase(),
        sub: '',
      }));
    }
  }

  const coverImage = await fetchCoverImage(project, manuscript);

  const inlineFontCss = await getInlineFontCss(style).catch(() => '');

  const coverHtml = composeCoverHtml({ project, manuscript, tokens, coverImage, fontImport, inlineFontCss, style });

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
