/**
 * PathGuru Publishers — Editorial Agent  (Phase 3 Complete)
 *
 * What's new vs Phase 2:
 *  1. Structured designIntent — AI returns a JSON object per section,
 *     not free text. Formatter reads precise layout keys.
 *  2. Render feedback loop — formatter reports what it rendered,
 *     a second AI pass reviews and rewrites weak sections.
 *  3. Niche personality system — 12 niche profiles each with their
 *     own typographic voice, rhythm, and visual vocabulary.
 *  4. HTML tag stripping is now bulletproof.
 */

/* ══════════════════════════════════════════════════════
   NICHE PERSONALITY PROFILES
   Maps topic keywords → distinct typographic + tonal identity
══════════════════════════════════════════════════════ */
export const NICHE_PROFILES = {
  business: {
    keywords: ['business','entrepreneur','startup','marketing','sales','brand','strategy','revenue','profit','growth'],
    voice: 'authoritative strategist: data-backed, commercially sharp, no fluff',
    rhythm: 'short punchy sentences. Power verbs. Specifics over generalities.',
    pullQuoteStyle: 'stat-led or contrarian business insight',
    chapterOpenStyle: 'open with a market reality or surprising statistic',
    palette: 'modern',
    headingCase: 'sentence',
    listStyle: 'numbered-action',
  },
  marketing: {
    keywords: ['marketing','copywriting','content','social media','instagram','reels','facebook','ads','funnel','email','seo','brand'],
    voice: 'bold conversion copywriter: direct, benefit-led, reader-obsessed',
    rhythm: 'punchy. Benefit first. Then the how. Short paragraphs — never more than 3 sentences.',
    pullQuoteStyle: 'conversion insight or surprising result with a number',
    chapterOpenStyle: 'open with the reader\'s pain point or a bold promise',
    palette: 'bold',
    headingCase: 'sentence',
    listStyle: 'bullet-benefit',
  },
  wellness: {
    keywords: ['health','wellness','nutrition','fitness','yoga','meditation','mindset','mental health','anxiety','stress','sleep'],
    voice: 'warm supportive guide: evidence-aware, empowering, never preachy',
    rhythm: 'warm and flowing. Conversational. Second person — speak directly to the reader.',
    pullQuoteStyle: 'affirming truth or science-backed insight stated simply',
    chapterOpenStyle: 'open with an empathetic scenario the reader recognises',
    palette: 'premium',
    headingCase: 'sentence',
    listStyle: 'bullet-gentle',
  },
  finance: {
    keywords: ['finance','invest','money','wealth','budget','savings','stocks','crypto','real estate','income','passive'],
    voice: 'trusted financial educator: precise, myth-busting, cautiously optimistic',
    rhythm: 'clear and measured. Define terms simply. Never oversimplify numbers.',
    pullQuoteStyle: 'counterintuitive financial truth or surprising statistic',
    chapterOpenStyle: 'open with a common money mistake or misconception',
    palette: 'premium',
    headingCase: 'sentence',
    listStyle: 'numbered-step',
  },
  leadership: {
    keywords: ['leadership','management','team','executive','CEO','culture','productivity','delegation','communication','coaching'],
    voice: 'executive peer: direct, experience-led, respectful of the reader\'s intelligence',
    rhythm: 'confident and precise. Frameworks and models welcome. No corporate jargon.',
    pullQuoteStyle: 'leadership principle or hard-won insight',
    chapterOpenStyle: 'open with a leadership scenario or decision moment',
    palette: 'modern',
    headingCase: 'sentence',
    listStyle: 'numbered-principle',
  },
  faith: {
    keywords: ['faith','christian','church','spiritual','bible','prayer','god','ministry','devotion','purpose'],
    voice: 'pastoral guide: warm, scripturally grounded, personally honest',
    rhythm: 'reflective and measured. Weave story with truth. Invite rather than instruct.',
    pullQuoteStyle: 'scripture or pastoral insight stated as personal truth',
    chapterOpenStyle: 'open with a personal story or a scriptural moment',
    palette: 'premium',
    headingCase: 'sentence',
    listStyle: 'bullet-reflective',
  },
  parenting: {
    keywords: ['parenting','family','children','kids','motherhood','fatherhood','baby','teenager','school','discipline'],
    voice: 'experienced parent-friend: honest, non-judgemental, practically useful',
    rhythm: 'conversational and real. Acknowledge the hard parts. Humour welcome.',
    pullQuoteStyle: 'relatable parenting truth or reassuring insight',
    chapterOpenStyle: 'open with a scenario every parent will immediately recognise',
    palette: 'modern',
    headingCase: 'sentence',
    listStyle: 'bullet-practical',
  },
  beauty: {
    keywords: ['beauty','salon','skincare','hair','makeup','nails','aesthetic','spa','lash','brow','barbershop'],
    voice: 'industry insider: confident, trend-aware, business-savvy',
    rhythm: 'energetic and visual. Speak the language of the industry. Be specific.',
    pullQuoteStyle: 'industry insight or client psychology revelation',
    chapterOpenStyle: 'open with a salon scenario or client booking moment',
    palette: 'bold',
    headingCase: 'sentence',
    listStyle: 'bullet-action',
  },
  selfdev: {
    keywords: ['self','personal development','habit','goal','mindset','productivity','motivation','confidence','success','discipline'],
    voice: 'honest life coach: evidence-based, no toxic positivity, real accountability',
    rhythm: 'direct and energising. Challenge the reader. Back claims with research or story.',
    pullQuoteStyle: 'mindset-shifting reframe or behaviour science insight',
    chapterOpenStyle: 'open with a relatable self-sabotage moment',
    palette: 'bold',
    headingCase: 'sentence',
    listStyle: 'numbered-action',
  },
  technology: {
    keywords: ['technology','ai','software','coding','digital','automation','saas','app','developer','data','cybersecurity'],
    voice: 'knowledgeable practitioner: precise, jargon-light, practically focused',
    rhythm: 'clear and structured. Define acronyms. Show don\'t just tell — use examples.',
    pullQuoteStyle: 'industry trend or technical insight stated plainly',
    chapterOpenStyle: 'open with a real-world technology scenario or failure case',
    palette: 'modern',
    headingCase: 'sentence',
    listStyle: 'numbered-step',
  },
  aging: {
    keywords: ['aging','retirement','senior','older','50+','60+','70+','life stage','second act','grandparent'],
    voice: 'irreverent life celebrant: witty, empowering, refusing to condescend',
    rhythm: 'conversational and warm. Humour is welcome. Treat readers as fully capable adults.',
    pullQuoteStyle: 'liberating reframe or funny but true life observation',
    chapterOpenStyle: 'open with a cultural myth about aging to immediately challenge',
    palette: 'bold',
    headingCase: 'sentence',
    listStyle: 'bullet-action',
  },
  creative: {
    keywords: ['creative','writing','art','design','photography','music','storytelling','author','craft','fiction','poetry'],
    voice: 'master practitioner: generous, specific, deeply respectful of the craft',
    rhythm: 'rich and considered. Show with specific craft examples. Avoid abstraction.',
    pullQuoteStyle: 'craft insight or creative philosophy stated memorably',
    chapterOpenStyle: 'open with a vivid creative scenario or artist\'s struggle',
    palette: 'premium',
    headingCase: 'sentence',
    listStyle: 'bullet-reflective',
  },
};

export function detectNiche(topic = '', writingMode = '') {
  const lower = (topic + ' ' + writingMode).toLowerCase();
  for (const [niche, profile] of Object.entries(NICHE_PROFILES)) {
    if (profile.keywords.some(kw => lower.includes(kw))) return { niche, profile };
  }
  return { niche: 'business', profile: NICHE_PROFILES.business };
}

/* ══════════════════════════════════════════════════════
   STRUCTURED DESIGN INTENT SCHEMA
   Every section gets a precise JSON layout object,
   not free-text guesswork
══════════════════════════════════════════════════════ */
const DESIGN_INTENT_SCHEMA = `"designIntent": {
  "layout": "chapter|checklist|worksheet|cta|pullquote|statblock|default",
  "pullQuote": "exact sentence to pull (or null)",
  "openingHook": "chapter|stat|story|question|myth (for chapter sections)",
  "visualWeight": "light|medium|heavy",
  "pageBreakBefore": true|false,
  "calloutStat": "e.g. 73% of readers or null",
  "subheadings": ["subheading 1", "subheading 2"] or [],
  "listType": "bullet|numbered|checklist|none"
}`;

/* ══════════════════════════════════════════════════════
   EDITORIAL PROMPT — BOOK MANUSCRIPT
══════════════════════════════════════════════════════ */
export function buildEditorialPrompt(input, project, research, nicheProfile) {
  const profile = nicheProfile || NICHE_PROFILES.business;

  return `You are PathGuru Publishers — a world-class publishing team. Your output must be indistinguishable from a book produced by a top professional publisher.

NICHE VOICE PROFILE:
- Voice: ${profile.voice}
- Rhythm: ${profile.rhythm}
- Pull quote style: ${profile.pullQuoteStyle}
- Chapter opening style: ${profile.chapterOpenStyle}

PROJECT METADATA:
- Title: ${project.title || '(generate a compelling title)'}
- Subtitle: ${project.subtitle || '(generate a marketable subtitle)'}
- Author: ${project.author || 'PathGuru Author'}
- Publisher: ${project.publisher || 'PathGuru Publishers'}
- Copyright: ${project.copyright || `© ${new Date().getFullYear()} ${project.author || 'Author'}. All rights reserved.`}
- Audience: ${project.audience || 'general readers'}
- Reader outcome: ${project.outcome || 'gain practical knowledge'}
- Tone: ${project.tone || 'expert, clear, persuasive'}
- Writing mode: ${input.writingMode || 'nonfiction guide'}

BOOK PROMPT:
${project.topic}

RESEARCH SUMMARY:
${research?.summary || 'Use your expert knowledge.'}

SOURCES:
${(research?.sources || []).slice(0, 6).map((s, i) => `${i + 1}. ${s.title || 'Source'} — ${s.url || ''}`).join('\n')}

OUTPUT FORMAT: Return STRICT JSON ONLY. No markdown. No code fences. No explanation.

REQUIRED JSON SHAPE:
{
  "title": "compelling publishable title",
  "subtitle": "marketable subtitle that amplifies the promise",
  "positioning": "one sharp paragraph: book promise, reader transformation, market angle",
  "writingPersonality": "the specific personality voice used",
  "sections": [
    {
      "type": "frontmatter|chapter|checklist|worksheet|cta|pullquote|statblock",
      "title": "section title — NO 'Chapter N:' prefix. Just the title itself.",
      "body": "PLAIN TEXT ONLY. Zero HTML tags of any kind. Use double newlines between paragraphs. Use >> at the START of a line for a pull-quote. Use - at the start for bullets. Use 1. for numbered lists. Use ALL CAPS LINE for sub-headings. Write 500-900 words for chapter sections.",
      ${DESIGN_INTENT_SCHEMA}
    }
  ],
  "proofreaderNotes": ["specific improvement the proofreader flagged"],
  "citations": [{"title":"source title","url":"url","content":"relevance note"}]
}

ABSOLUTE RULES — VIOLATIONS WILL CAUSE REJECTION:
1. body: PLAIN TEXT ONLY. No HTML. No <p> <strong> <li> <ol> <ul> <br> or ANY tag. Ever.
2. Section titles: Never include "Chapter 1:" etc. Just the title.
3. designIntent.layout must be one of the exact enum values listed.
4. designIntent.pullQuote must be an exact verbatim sentence from body, or null.
5. Include frontmatter as section 0, CTA as the final section.
6. Write FULL content — minimum 500 words per chapter. No stubs.
7. Include 7 to 10 sections total.
8. Every chapter must have a genuine opening hook matching the chapterOpenStyle above.`;
}

/* ══════════════════════════════════════════════════════
   RENDER FEEDBACK LOOP
   After the formatter runs, this prompt reviews what
   was rendered and rewrites any weak sections
══════════════════════════════════════════════════════ */
export function buildFeedbackPrompt(manuscript, renderReport, nicheProfile) {
  const profile = nicheProfile || NICHE_PROFILES.business;

  const weakSections = renderReport.sections
    .filter(s => s.issues?.length > 0)
    .map(s => `Section "${s.title}" (${s.type}): ${s.issues.join('; ')}`)
    .join('\n');

  if (!weakSections) return null; // nothing to fix

  return `You are the PathGuru proofreader reviewing a rendered book draft.

NICHE VOICE: ${profile.voice}

The formatter has rendered the manuscript and identified these layout/content issues:

${weakSections}

For each section listed above, return an improved version. Output STRICT JSON ONLY:
{
  "revisions": [
    {
      "title": "exact section title from above",
      "body": "PLAIN TEXT ONLY. Improved body content. No HTML tags.",
      "designIntent": {
        "layout": "corrected layout type",
        "pullQuote": "better pull quote or null",
        "visualWeight": "light|medium|heavy",
        "pageBreakBefore": true|false,
        "calloutStat": "stat or null",
        "subheadings": [],
        "listType": "bullet|numbered|checklist|none"
      }
    }
  ]
}

FIX THESE SPECIFIC ISSUES:
- "body too short": expand to 500+ words
- "no pull quote found": add a >> prefixed sentence worth quoting
- "HTML tags detected": rewrite body as clean plain text
- "designIntent mismatch": correct the layout type
- "weak opening hook": rewrite opening paragraph per chapterOpenStyle: ${profile.chapterOpenStyle}`;
}

/* ══════════════════════════════════════════════════════
   BLOG POST PROMPT
══════════════════════════════════════════════════════ */
export function buildBlogPrompt(input, research) {
  return `You are an award-winning professional copywriter and SEO content strategist.
Your blog posts rank on Google page 1, convert readers to buyers, and get shared widely.

BRIEF:
- Topic: ${input.topic}
- Target audience: ${input.audience || 'general readers'}
- Goal: ${input.goal || 'inform and engage'}
- Tone: ${input.tone || 'conversational, expert'}
- Word count: ${input.wordCount || '1200-1800 words'}
- SEO focus keyword: ${input.seoKeyword || input.topic}
- CTA goal: ${input.ctaGoal || 'subscribe / share / buy'}
- Site: ${input.siteName || ''}
- Author: ${input.author || ''}

RESEARCH:
${research?.summary || 'Use your expert knowledge on this topic.'}

OUTPUT FORMAT: STRICT JSON ONLY. No markdown. No code fences.

{
  "title": "SEO-optimised post title, 60 chars max, keyword near start",
  "metaDescription": "exactly 150-155 chars, includes keyword, ends with benefit",
  "slug": "url-friendly-slug",
  "focusKeyword": "primary keyword phrase",
  "excerpt": "2-sentence hook for social sharing and preview cards",
  "readingTimeMinutes": 6,
  "sections": [
    {
      "type": "hook|h2|h3|bulletList|numberedList|pullquote|cta|conclusion",
      "heading": "section heading (empty string for hook/cta/conclusion)",
      "body": "PLAIN TEXT ONLY. No HTML. Double newlines = paragraph breaks. >> = pull-quote. - = bullet. 1. = numbered."
    }
  ],
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "categories": ["primary category"],
  "featuredImageKeyword": "3-word Pexels search term",
  "socialCaption": "Twitter/X under 270 chars with 2-3 hashtags",
  "linkedinCaption": "LinkedIn 3-sentence opener that drives clicks",
  "proofreaderNotes": ["one specific improvement suggestion"]
}

COPYWRITING RULES:
1. Hook: bold claim, striking stat, or vivid scene. First sentence must stop the scroll.
2. body: PLAIN TEXT ONLY. No HTML tags. Ever.
3. Every H2 promises a benefit or answers a question.
4. Include at least 2 pull-quotes (>> prefix) that readers screenshot.
5. CTA: one specific action. Never "click here."
6. Keyword appears in: title, first 100 words, one H2, meta description.
7. Paragraphs: 2-3 sentences max. Active voice. Conversational.
8. Write the COMPLETE post — no stubs, no placeholders.`;
}

/* ══════════════════════════════════════════════════════
   PARSERS
══════════════════════════════════════════════════════ */
export function parseEditorialResponse(text) {
  return parseJson(text, 'Editorial');
}

export function parseBlogResponse(text) {
  return parseJson(text, 'Blog');
}

export function parseFeedbackResponse(text) {
  return parseJson(text, 'Feedback');
}

function parseJson(text, label) {
  const clean = stripCodeFences(text);
  try {
    return JSON.parse(clean);
  } catch {
    // Try to extract JSON object
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    throw new Error(`${label} response did not return valid JSON. First 200 chars: ${clean.slice(0, 200)}`);
  }
}

function stripCodeFences(text) {
  return (text || '')
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
}

/* ══════════════════════════════════════════════════════
   NORMALISE SECTION
══════════════════════════════════════════════════════ */
export function normalizeSection(s) {
  const rawIntent = s.designIntent;
  let intent;

  // Handle both old free-text and new structured object
  if (rawIntent && typeof rawIntent === 'object') {
    intent = {
      layout:          rawIntent.layout         || 'default',
      pullQuote:       rawIntent.pullQuote       || null,
      openingHook:     rawIntent.openingHook     || 'chapter',
      visualWeight:    rawIntent.visualWeight    || 'medium',
      pageBreakBefore: rawIntent.pageBreakBefore !== false,
      calloutStat:     rawIntent.calloutStat     || null,
      subheadings:     Array.isArray(rawIntent.subheadings) ? rawIntent.subheadings : [],
      listType:        rawIntent.listType        || 'none',
    };
  } else {
    // Legacy free-text — infer from content
    const str = String(rawIntent || '');
    intent = {
      layout:          inferLayout(str, s.type),
      pullQuote:       extractPullQuoteFromText(str),
      openingHook:     /stat|number|%/.test(str) ? 'stat' : 'chapter',
      visualWeight:    /heavy|bold|prominent/.test(str) ? 'heavy' : 'medium',
      pageBreakBefore: true,
      calloutStat:     null,
      subheadings:     [],
      listType:        /checklist|checkbox/.test(str) ? 'checklist' : /numbered/.test(str) ? 'numbered' : /bullet/.test(str) ? 'bullet' : 'none',
    };
  }

  return {
    type:         String(s.type    || 'chapter').toLowerCase().trim(),
    title:        stripChapterPrefix(String(s.title || '')),
    body:         stripHtmlTags(String(s.body  || '')),
    designIntent: intent,
    heading:      String(s.heading || ''),
  };
}

function inferLayout(str, type) {
  const t = (type || '').toLowerCase();
  if (['checklist','worksheet','cta','pullquote','statblock'].includes(t)) return t;
  if (/checklist|checkbox/i.test(str))  return 'checklist';
  if (/worksheet|exercise/i.test(str))  return 'worksheet';
  if (/cta|call.to.action/i.test(str))  return 'cta';
  if (/pull.quote|pullquote/i.test(str))return 'pullquote';
  if (/stat.?block|stats/i.test(str))   return 'statblock';
  return 'chapter';
}

function extractPullQuoteFromText(str) {
  const m = str.match(/pull.?quote[:\s]+["']?([^"'\n]{20,120})/i);
  return m ? m[1].trim() : null;
}

function stripChapterPrefix(title) {
  return title.replace(/^chapter\s+\d+\s*[:\-–—]\s*/i, '').trim();
}

export function stripHtmlTags(str) {
  return String(str || '')
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em>([\s\S]*?)<\/em>/gi, '_$1_')
    .replace(/<i>([\s\S]*?)<\/i>/gi, '_$1_')
    .replace(/<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/gi, '\n\n$1\n\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\*\*\s+\*\*/g, '')
    .trim();
}

export function validateEditorialPackage(pkg, project = {}) {
  if (!pkg || typeof pkg !== 'object') throw new Error('Invalid editorial package');
  const out = { ...pkg };
  out.title    = (pkg.title    && String(pkg.title).trim())    || project.title    || 'Untitled';
  out.subtitle = (pkg.subtitle && String(pkg.subtitle).trim()) || project.subtitle || '';
  out.sections = Array.isArray(pkg.sections)
    ? pkg.sections.map(normalizeSection)
    : [{ type: 'frontmatter', title: 'Copyright', body: `© ${project.author || ''} ${new Date().getFullYear()}`, designIntent: { layout: 'default' } }];

  const hasFront = out.sections.some(s => ['frontmatter','copyright'].includes(s.type));
  if (!hasFront) {
    out.sections.unshift({ type: 'frontmatter', title: 'Copyright', body: `© ${project.author || ''} ${new Date().getFullYear()}. All rights reserved.`, designIntent: { layout: 'default' } });
  }

  out.proofreaderNotes = Array.isArray(pkg.proofreaderNotes) ? pkg.proofreaderNotes : [];
  out.citations        = Array.isArray(pkg.citations)        ? pkg.citations        : [];
  return out;
}
