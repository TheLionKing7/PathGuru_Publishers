import { createComplianceReport, createKdpProfile, getPageCss } from "./kdpCompliance.js";
import { createAiPublishingPackage } from "./aiPipeline.js";

const publisherProfiles = {
  pathfinda: {
    brandName: "PathFinda Publishers",
    theme: "Modern editorial authority",
    style: "pathfinda",
    colors: ["#0B172A", "#3EA1FF", "#F6F8FB", "#FFFFFF"],
    fonts: ["DM Sans", "Arial", "Helvetica"],
    layoutNotes: "Modern publishing brand with crisp blue accents, clean editorial forms, and premium white space. Chapter openers: full-page dark navy. Callout boxes: navy background with gold left border. Tables: navy header row, alternating light blue rows.",
    logoHint: "PathFinda brand logo",
    logoUrl: ""
  },
  digitalNation: {
    brandName: "Digital Nation Inc.",
    theme: "Deep navy authority with gold accents",
    style: "digitalNation",
    colors: ["#1B2A4A", "#C9A446", "#FFFFFF", "#F5F0DC"],
    fonts: ["DM Sans", "Arial", "Helvetica"],
    layoutNotes: "Premium authority brand: deep navy (#1B2A4A) + gold (#C9A446). Chapter openers: full dark navy page, gold 'CHAPTER X' label, white bold title. Insider boxes: navy background, gold left border, gold label. Formula boxes: cream (#F5F0DC) background. Data-viz cover with exponential growth chart, no stock photos.",
    logoHint: "Digital Nation brand mark",
    logoUrl: ""
  }
};

const styleSystems = {
  premium: {
    theme: "Premium editorial",
    colors: ["#111827", "#C08A2D", "#F7F2EA", "#FFFFFF"],
    fonts: ["Georgia", "Inter", "Arial"],
    layoutNotes: "Elegant serif headings, generous margins, warm accent rules, and strong chapter openers."
  },
  modern: {
    theme: "Modern authority",
    colors: ["#16213E", "#2BB3A3", "#F6F8FB", "#FFFFFF"],
    fonts: ["Inter", "Arial", "Helvetica"],
    layoutNotes: "Clean sans-serif hierarchy, structured modules, sharp callouts, and concise action blocks."
  },
  bold: {
    theme: "Bold conversion",
    colors: ["#171717", "#E84855", "#FFE66D", "#FFFFFF"],
    fonts: ["Arial", "Helvetica", "Georgia"],
    layoutNotes: "High-contrast chapter pages, punchy pull quotes, bold CTA panels, and energetic section rhythm."
  }
};

function resolvePublisherProfile(input, publisher) {
  const requested = String(input.publisherProfile || "").trim().toLowerCase();
  const name = String(publisher || "").trim();
  const normalized = name.toLowerCase();
  const aliases = {
    "pathfinda": "pathfinda",
    "pathfinda publishers": "pathfinda",
    "digital nation": "digitalNation",
    "digital nation inc.": "digitalNation",
    "digitalnation": "digitalNation"
  };
  const key = aliases[requested] || aliases[normalized] || "custom";
  const profile = publisherProfiles[key];

  const customColors = [];
  if (input.brandPrimaryColor) customColors.push(input.brandPrimaryColor);
  if (input.brandSecondaryColor) customColors.push(input.brandSecondaryColor);
  const customFonts = parseBrandFonts(input.brandFontStack);
  const logoUrl = clean(input.brandLogoUrl, "");

  if (profile) {
    return {
      ...profile,
      colors: customColors.length ? customColors : profile.colors,
      fonts: customFonts.length ? customFonts : profile.fonts,
      logoUrl: logoUrl || profile.logoUrl,
      // Pass the style key through so runDesignAgent uses the right token set
      resolvedStyle: profile.style || null,
    };
  }

  return {
    brandName: clean(name, "PathGuru Publishers"),
    theme: "Custom brand style",
    colors: customColors,
    fonts: customFonts,
    layoutNotes: "Custom publisher brand using the selected design style.",
    logoHint: clean(input.brandLogoUrl, "Custom publisher logo"),
    logoUrl
  };
}

function parseBrandFonts(value) {
  if (!value || typeof value !== "string") return [];
  return value.split(",").map((font) => font.trim()).filter(Boolean);
}

function mergeDesignSystem(styleSystem, publisherProfile) {
  return {
    theme: publisherProfile.theme || styleSystem.theme,
    colors: publisherProfile.colors.length ? publisherProfile.colors : styleSystem.colors,
    fonts: publisherProfile.fonts.length ? publisherProfile.fonts : styleSystem.fonts,
    layoutNotes: [styleSystem.layoutNotes, publisherProfile.layoutNotes].filter(Boolean).join(" ")
  };
}

const formatLabels = {
  pdf: "PDF ebook",
  epub: "EPUB ebook",
  docx: "DOCX manuscript"
};

export async function createDesignPackage(input) {
  const project = createBaseProject(input);
  try {
    const aiPackage = await createAiPublishingPackage(input, project);
    applyAiPackage(project, aiPackage);
    // Attach generated HTML and design package if provided by AI pipeline
    if (aiPackage.html) project.generatedHtml = aiPackage.html;
    if (aiPackage.design) project.designPackage = aiPackage.design;
  } catch (error) {
    project.aiNotes = [`AI pipeline failed, fallback draft used: ${error.message}`];
  }

  project.complianceReport = createComplianceReport(project);
  return project;
}

export function createBaseProject(input) {
  const topic = clean(input.topic, "Untitled expertise guide");
  const audience = clean(input.audience, "busy professionals who need practical guidance");
  const outcome = clean(input.outcome, "understand the topic and take confident action");
  const tone = clean(input.tone, "expert, clear, persuasive");
  const format = input.format && formatLabels[input.format] ? input.format : "pdf";
  const style = input.style && styleSystems[input.style] ? input.style : "modern";
  const length = clean(input.length, "concise");
  const inputPublisher = clean(input.publisher, "");
  const publisherProfile = resolvePublisherProfile(input, inputPublisher);
  const publisher = clean(inputPublisher, publisherProfile.brandName || "PathGuru Publishers");
  const designSystem = mergeDesignSystem(styleSystems[style], publisherProfile);
  const kdpProfile = createKdpProfile(input);
  const persona = inferPersona(topic);
  const title = extractPublishableTitle(topic);
  const conversionGoal = `Move ${audience} from curiosity to trust, then invite them to take the next step toward ${outcome}.`;
  const author = clean(input.author, "PathGuru Author");
  const copyright = clean(input.copyright, `Copyright ${new Date().getFullYear()} ${author}. All rights reserved.`);

  const project = {
    id: `dg-${Date.now()}`,
    createdAt: new Date().toISOString(),
    title: clean(input.title, title),
    subtitle: clean(input.subtitle, createSubtitle({ format, audience, outcome })),
    author,
    publisher,
    publisherProfile,
    copyright,
    topic,
    niche: inferNiche(topic),
    persona,
    audience,
    outcome,
    tone,
    writingMode: clean(input.writingMode, "nonfiction guide"),
    length,
    format,
    conversionGoal,
    designSystem,
    kdpProfile,
    sections: buildSections({ title, topic, audience, outcome, tone, persona, conversionGoal, author, publisher, copyright }),
    citations: [],
    exportNotes: {
      pdf: "Use the preview page print command for the MVP. Production should render with a paged-media engine.",
      epub: "Production should convert sections into XHTML chapters and package them with OPF metadata.",
      docx: "Production should map sections into styled Word paragraphs, headings, tables, and callouts."
    }
  };

  return project;
}

export function renderDocumentHtml(project) {
  const colors = project.designSystem.colors;
  const pageCss = getPageCss(project.kdpProfile);
  const sectionHtml = project.sections.map((section, index) => {
    const eyebrow = section.type === "chapter" ? `Chapter ${index}` : section.type;
    return `
      <section class="doc-section ${section.type}">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h2>${escapeHtml(section.title)}</h2>
        ${renderBody(section.body)}
        <aside>${escapeHtml(section.designIntent)}</aside>
      </section>
    `;
  }).join("");

  const brandLogo = project.publisherProfile?.logoUrl;
  const coverLogoHtml = brandLogo
    ? `<img class="cover-logo" src="${escapeHtml(brandLogo)}" alt="${escapeHtml(project.publisherProfile.brandName || project.publisher)} logo">`
    : `<p class="brand-name">${escapeHtml(project.publisherProfile.brandName || project.publisher)}</p>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(project.title)}</title>
  <style>
    @page { ${pageCss} }
    body {
      margin: 0;
      background: ${colors[2]};
      color: ${colors[0]};
      font-family: ${project.designSystem.fonts[1]}, Arial, sans-serif;
      line-height: 1.65;
      font-size: 11pt;
    }
    main {
      max-width: ${project.kdpProfile.pageWidthIn}in;
      margin: 0 auto;
      background: ${colors[3]};
      min-height: 100vh;
    }
    .cover {
      min-height: calc(${project.kdpProfile.pageHeightIn}in - ${project.kdpProfile.safeMarginIn * 2}in);
      padding: .25in 0;
      display: grid;
      align-content: end;
      background: ${colors[0]};
      color: ${colors[3]};
    }
    .kicker {
      color: ${colors[1]};
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    h1 {
      font-family: ${project.designSystem.fonts[0]}, Georgia, serif;
      font-size: 34pt;
      line-height: 1.05;
      margin: 18px 0;
      max-width: 4.45in;
      overflow-wrap: anywhere;
    }
    .subtitle {
      font-size: 13pt;
      max-width: 620px;
      color: rgba(255,255,255,.78);
    }
    .meta {
      margin-top: 42px;
      display: grid;
      gap: 8px;
      color: rgba(255,255,255,.72);
    }
    .doc-section {
      padding: .48in 0;
      border-bottom: 1px solid #e5e7eb;
      break-inside: avoid;
    }
    .eyebrow {
      color: ${colors[1]};
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
      margin: 0 0 12px;
    }
    h2 {
      font-family: ${project.designSystem.fonts[0]}, Georgia, serif;
      font-size: 34px;
      line-height: 1.12;
      margin: 0 0 18px;
    }
    p { margin: 0 0 16px; font-size: 11pt; }
    aside {
      margin-top: 26px;
      padding: 16px 18px;
      border-left: 4px solid ${colors[1]};
      background: ${colors[2]};
      font-weight: 700;
    }
    .cta {
      background: ${colors[0]};
      color: ${colors[3]};
    }
    .cta .eyebrow, .cta aside { color: ${colors[1]}; }
    .cta aside { background: rgba(255,255,255,.08); }
    @media print {
      body { background: #fff; }
      main { max-width: none; }
      .cover { break-after: page; }
      .doc-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <section class="cover">
      <div class="cover-brand">${coverLogoHtml}</div>
      <p class="kicker">${escapeHtml(project.niche)}</p>
      <h1>${escapeHtml(project.title)}</h1>
      <p class="subtitle">${escapeHtml(project.subtitle)}</p>
      <div class="meta">
        <span>By ${escapeHtml(project.author)}</span>
        <span>${escapeHtml(project.publisher)}</span>
        <span>${escapeHtml(project.persona)}</span>
        <span>${escapeHtml(project.designSystem.theme)}</span>
        <span>${escapeHtml(project.conversionGoal)}</span>
      </div>
    </section>
    ${sectionHtml}
  </main>
</body>
</html>`;
}

function buildSections({ topic, audience, outcome, tone, persona, conversionGoal, author, publisher, copyright }) {
  return [
    {
      type: "copyright",
      title: "Copyright",
      body: `${copyright}\n\nPublished by ${publisher}. Written by ${author}.\n\nThis publication is for educational purposes and should be adapted to the reader's context before professional, financial, legal, medical, or safety decisions are made.`,
      designIntent: "Use restrained frontmatter typography with clear ownership and rights information."
    },
    {
      type: "chapter",
      title: "The Reader Promise",
      body: `This guide is built for ${audience}. It opens with a direct promise: by the end, the reader will know how to ${outcome}. The voice should feel ${tone}, with the credibility of ${persona}.`,
      designIntent: "Use this as a high-trust opening spread with a short promise block and a visual hierarchy that makes the outcome obvious."
    },
    {
      type: "chapter",
      title: "What The Reader Must Understand First",
      body: `Before giving tactics, frame the core belief shift behind ${topic}. Explain what most people misunderstand, what actually matters, and why the reader should care now.`,
      designIntent: "Add a pull quote or statistic callout here once research is connected."
    },
    {
      type: "chapter",
      title: "The Practical Framework",
      body: `Convert the topic into a named framework with three to five steps. Each step should define the principle, show an example, and give the reader one action to complete.`,
      designIntent: "Render this chapter with numbered modules, side notes, and repeated action boxes."
    },
    {
      type: "checklist",
      title: "Implementation Checklist",
      body: `Give the reader a page they can use immediately. Include preparation, execution, review, and improvement checkpoints connected to ${outcome}.`,
      designIntent: "Use checkboxes, compact spacing, and a clean worksheet layout."
    },
    {
      type: "cta",
      title: "Next Step",
      body: conversionGoal,
      designIntent: "Finish with a strong CTA panel, short confidence-building recap, and a clear action button or link in production exports."
    }
  ];
}

function applyAiPackage(project, aiPackage) {
  project.aiSource = aiPackage.source;
  project.aiNotes = aiPackage.notes;
  project.researchBrief = aiPackage.research;

  if (!aiPackage.manuscript) return;

  project.title = aiPackage.manuscript.title;
  project.subtitle = aiPackage.manuscript.subtitle;
  project.positioning = aiPackage.manuscript.positioning;
  project.writingPersonality = aiPackage.manuscript.writingPersonality;
  project.sections = aiPackage.manuscript.sections;
  project.citations = aiPackage.manuscript.citations;
  project.proofreaderNotes = aiPackage.manuscript.proofreaderNotes;
}

function inferPersona(topic) {
  const lower = topic.toLowerCase();
  if (/(health|fitness|diet|wellness|medical|anxiety|therapy)/.test(lower)) return "Health educator and evidence-aware wellness strategist";
  if (/(money|finance|invest|tax|wealth|budget)/.test(lower)) return "Financial education strategist";
  if (/(law|legal|contract|compliance)/.test(lower)) return "Legal education specialist";
  if (/(marketing|sales|brand|business|startup|offer)/.test(lower)) return "Conversion strategist and business designer";
  if (/(teacher|course|student|education|learning)/.test(lower)) return "Instructional designer and education specialist";
  return "Subject-matter expert, editorial strategist, and publication designer";
}

function inferNiche(topic) {
  const lower = topic.toLowerCase();
  if (/(marketing|sales|business|startup|offer)/.test(lower)) return "Business and marketing";
  if (/(health|fitness|diet|wellness|medical)/.test(lower)) return "Health and wellness";
  if (/(money|finance|invest|wealth|budget)/.test(lower)) return "Finance education";
  if (/(faith|church|bible|spiritual)/.test(lower)) return "Faith and personal growth";
  if (/(course|teacher|student|education|learning)/.test(lower)) return "Education";
  return "Expert publishing";
}

function clean(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function extractPublishableTitle(prompt) {
  const value = clean(prompt, "Untitled Expertise Guide");
  const quoted = value.match(/[“"]([^”"]{6,90})[”"]/);
  if (quoted) return titleCase(quoted[1]);

  const titled = value.match(/\b(?:called|titled|title(?:d)?\s+as|named)\s+["“]?([^".\n]{6,90})/i);
  if (titled) return titleCase(titled[1]);

  const firstSentence = value.split(/[.!?\n]/)[0] || value;
  const cleaned = firstSentence
    .replace(/^(create|write|design|make|generate|produce|draft)\s+(a|an|the)?\s*/i, "")
    .replace(/\b(kdp-ready|publish-ready|pdf|ebook|guide|book|paperback)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const words = (cleaned || value).split(/\s+/).slice(0, 9).join(" ");
  return titleCase(words || "Untitled Expertise Guide");
}

function createSubtitle({ format, audience, outcome }) {
  const reader = clean(audience, "your target reader");
  const result = clean(outcome, "take confident action");
  return `A ${formatLabels[format]} helping ${reader} ${result}`;
}

function titleCase(value) {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function renderBody(body) {
  return escapeHtml(body)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ══════════════════════════════════════════════════════
   FEEDBACK LOOP — runs after first format pass
   Sends renderReport weak sections back to AI for rewrite
   then re-renders those sections only
══════════════════════════════════════════════════════ */
async function runFeedbackLoop(manuscript, renderReport, nicheProfile, project) {
  try {
    const { buildFeedbackPrompt, parseFeedbackResponse } = await import('./skills/editorial.js');
    const prompt = buildFeedbackPrompt(manuscript, renderReport, nicheProfile);
    if (!prompt) return manuscript; // nothing weak — return as-is

    console.log(`[PathGuru] Feedback loop: fixing ${renderReport.sections.filter(s=>s.issues?.length>0).length} weak sections...`);

    let rawResponse = '';
    const provider = process.env.AI_PROVIDER || 'gemini';

    if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role:'user', parts:[{ text: prompt }] }],
            generationConfig: { temperature: 0.6, responseMimeType: 'application/json' },
          }),
        }
      );
      const data = await res.json();
      rawResponse = data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim() || '';
    }

    if (!rawResponse) return manuscript;

    const feedback = parseFeedbackResponse(rawResponse);
    const revisions = feedback?.revisions || [];

    if (!revisions.length) return manuscript;

    // Apply revisions to matching sections
    const { normalizeSection } = await import('./skills/editorial.js');
    const improved = { ...manuscript };
    improved.sections = manuscript.sections.map(s => {
      const rev = revisions.find(r => r.title === s.title);
      if (!rev) return s;
      return normalizeSection({ ...s, body: rev.body || s.body, designIntent: rev.designIntent || s.designIntent });
    });

    console.log(`[PathGuru] Feedback loop: applied ${revisions.length} revision(s)`);
    return improved;

  } catch (err) {
    console.warn('[PathGuru] Feedback loop skipped:', err.message);
    return manuscript;
  }
}

/* ══════════════════════════════════════════════════════
   buildProject v3 — orchestrates full Phase 3 pipeline
   with feedback loop + PDF post-processing
══════════════════════════════════════════════════════ */
export async function buildProject(input) {
  const project = createBaseProject(input);

  let manuscript  = null;
  let design      = null;
  let html        = null;
  let pdfBuffer   = null;
  let renderReport = null;
  let nicheProfile = null;

  try {
    const { createAiPublishingPackage }  = await import('./aiPipeline.js');
    const { runDesignAgent }             = await import('./skills/design.js');
    const { runFormattingAgent }         = await import('./skills/formatting.js');
    const { exportToPdf }                = await import('./exporter.js');
    const { detectNiche, validateEditorialPackage } = await import('./skills/editorial.js');

    // Phases 1–4 run inside createAiPublishingPackage:
    // Phase 1: Research agent (Tavily 4-query deep search)
    // Phase 2: Editorial quality gate (grades research, fills gaps, extracts cover stats)
    // Phase 3: Editorial writing (manuscript from approved research brief)
    // Phase 4: Design agent (cover composed from research-driven stats)
    console.log('[PathGuru] Phases 1–4: Research → Quality Gate → Editorial → Design...');
    const aiPackage = await createAiPublishingPackage(input, project);
    applyAiPackage(project, aiPackage);
    manuscript = validateEditorialPackage(aiPackage.manuscript, project);

    // 5. Detect niche
    const { niche, profile } = detectNiche(project.topic || manuscript.title, project.writingMode || '');
    nicheProfile = profile;
    project.niche = niche;
    console.log(`[PathGuru] Niche detected: ${niche}`);

    // Design already generated in Phase 4 — retrieve from aiPackage
    console.log('[PathGuru] Phase 5: Finalising design tokens & cover...');
    design = await runDesignAgent(input, project, aiPackage.research || null, manuscript);
    project.coverHtml = design.coverHtml;

    // 4. Format pass 1 → get renderReport
    console.log('[PathGuru] Phase 3: Layout engine (pass 1)...');
    const pass1 = await runFormattingAgent(project, manuscript, design);
    html        = pass1.html;
    renderReport = pass1.renderReport;

    // 5. Feedback loop (AI writing pass 2 — fixes weak sections)
    const weakCount = (renderReport?.sections || []).filter(s => s.issues?.length > 0).length;
    if (weakCount > 0) {
      console.log(`[PathGuru] Phase 4: Feedback loop (${weakCount} sections to improve)...`);
      manuscript = await runFeedbackLoop(manuscript, renderReport, nicheProfile, project);

      // 6. Format pass 2 — re-render with improved content
      console.log('[PathGuru] Phase 5: Layout engine (pass 2 — post-feedback)...');
      const pass2 = await runFormattingAgent(project, manuscript, design);
      html        = pass2.html;
      renderReport = pass2.renderReport;
    }

    // 7. PDF post-processing
    console.log('[PathGuru] Phase 6: PDF post-processing (metadata, bookmarks, page labels)...');
    pdfBuffer = await exportToPdf(html, project, manuscript, renderReport);

  } catch (err) {
    console.error('[PathGuru] Pipeline error:', err.message);
    html = html || renderDocumentHtml(project);
    // Try bare Playwright export as fallback
    try {
      const { exportToPdf } = await import('./exporter.js');
      pdfBuffer = await exportToPdf(html, project, manuscript || {}, renderReport);
    } catch {}
  }

  // Compliance report
  project.complianceReport = createComplianceReport(project);
  const compliance = project.complianceReport;

  return {
    html,
    pdfBase64:   pdfBuffer ? pdfBuffer.toString('base64') : null,
    manuscript:  manuscript || { title: project.title, subtitle: project.subtitle, sections: project.sections || [] },
    design:      design     || { design: { palette:{}, fontStack:'Georgia, serif' }, coverHtml:'' },
    compliance,
    renderReport,
    project: {
      title:            project.title,
      subtitle:         project.subtitle,
      author:           project.author,
      publisher:        project.publisher,
      copyright:        project.copyright,
      niche:            project.niche,
      kdpProfile:       project.kdpProfile,
      publisherProfile: project.publisherProfile,
    },
    positioning:       manuscript?.positioning       || '',
    writingPersonality:manuscript?.writingPersonality || '',
    proofreaderNotes:  manuscript?.proofreaderNotes  || project.proofreaderNotes || [],
  };
}
