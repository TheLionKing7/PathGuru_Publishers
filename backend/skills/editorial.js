/**
 * PathGuru Publishers — Editorial Agent  (Phase 3)
 *
 * Key fixes vs Phase 2:
 *  - Body text prompt now EXPLICITLY forbids HTML tags (Gemini kept injecting them)
 *  - Body uses double-newline paragraph separation — plain prose only
 *  - Added blog post prompt + parser
 */

/* ── Book manuscript prompt ─────────────────────────── */
export function buildEditorialPrompt(input, project, research) {
  return `You are PathGuru Publishers — a world-class publishing team with five internal agents:

1. Research Agent: extracts market context, reader pain points, and factual support.
2. Copywriter: writes persuasive, reader-friendly nonfiction that sells without hype.
3. Humanizing Editor: rewrites mechanical AI phrasing into natural, varied human prose.
4. Proofreader: improves clarity, flow, grammar, and consistency.
5. Design-aware Publisher: structures content for KDP PDF/EPUB.

Create a publish-ready draft package as STRICT JSON ONLY. No markdown. No code fences.

Metadata:
- Title: ${project.title}
- Subtitle: ${project.subtitle}
- Author: ${project.author}
- Publisher: ${project.publisher}
- Copyright: ${project.copyright}
- Audience: ${project.audience}
- Reader outcome: ${project.outcome}
- Tone: ${project.tone}
- Writing personality: ${input.writingPersonality || 'authoritative, clear, practical'}
- Writing mode: ${input.writingMode || 'nonfiction guide'}
- Format: ${project.format}
- KDP profile: ${JSON.stringify(project.kdpProfile)}

User prompt:
${project.topic}

Research summary:
${research.summary}

Sources:
${(research.sources || []).slice(0, 5).map((s, i) => `${i + 1}. ${s.title || 'Source'} — ${s.url || ''}`).join('\n')}

Return EXACTLY this JSON shape:
{
  "title": "short publishable title",
  "subtitle": "marketable subtitle",
  "positioning": "one paragraph on the book promise and market angle",
  "writingPersonality": "specific personality used",
  "sections": [
    {
      "type": "frontmatter|chapter|checklist|worksheet|cta|pullquote|statblock",
      "title": "section title WITHOUT 'Chapter N:' prefix — just the title itself",
      "body": "PLAIN TEXT ONLY. No HTML tags whatsoever. No <p>, <strong>, <li>, <ol>, <ul>, <h3> or any other tags. Use double newlines to separate paragraphs. Use >> at the start of a line for a pull-quote. Use - at the start of a line for a bullet point. Use 1. 2. 3. for numbered lists. Use ALL CAPS for sub-headings. Write 400-800 words for chapter sections.",
      "designIntent": "brief layout instruction: pull-quote candidate, use checklist grid, open with stat callout, etc."
    }
  ],
  "proofreaderNotes": ["short quality note"],
  "citations": [{"title":"source title","url":"source url","content":"short relevance note"}]
}

CRITICAL RULES:
- body field: PLAIN TEXT ONLY. Absolutely no HTML tags. Ever. This is non-negotiable.
- Section titles: do NOT include "Chapter 1:", "Chapter 2:" etc. Just the title. Example: "Why Aging Disgracefully is Your New Superpower" not "Chapter 1: Why Aging Disgracefully..."
- Include a copyright/frontmatter section as the FIRST section.
- Include 6 to 10 sections total for a full guide.
- Write substantive content — minimum 400 words per chapter section.
- End with a strong CTA section (type: "cta").
- Make content genuinely useful and publication-ready.`;
}

/* ── Blog post prompt ───────────────────────────────── */
export function buildBlogPrompt(input, research) {
  return `You are an award-winning professional copywriter and content strategist.
Your blog posts rank on Google, convert readers to buyers, and get shared widely.

Write a complete, publish-ready blog post as STRICT JSON ONLY. No markdown. No code fences.

Brief:
- Topic: ${input.topic}
- Target audience: ${input.audience || 'general readers'}
- Goal: ${input.goal || 'inform and engage'}
- Tone: ${input.tone || 'conversational, expert'}
- Word count target: ${input.wordCount || '1200-1800 words'}
- SEO focus keyword: ${input.seoKeyword || input.topic}
- CTA goal: ${input.ctaGoal || 'subscribe / share / buy'}
- Site name: ${input.siteName || ''}
- Author: ${input.author || ''}

Research:
${research?.summary || 'Use your expert knowledge on this topic.'}

Return EXACTLY this JSON shape:
{
  "title": "Compelling, SEO-optimised post title (60 chars max)",
  "metaDescription": "155-char meta description with keyword",
  "slug": "url-friendly-slug-from-title",
  "focusKeyword": "primary keyword phrase",
  "excerpt": "2-sentence hook for social sharing",
  "readingTimeMinutes": 6,
  "sections": [
    {
      "type": "hook|h2|h3|bulletList|numberedList|pullquote|cta|conclusion",
      "heading": "section heading (empty string for hook/cta/conclusion)",
      "body": "PLAIN TEXT ONLY. No HTML. Double newlines = paragraph breaks. >> prefix = pull-quote. - prefix = bullet. 1. prefix = numbered."
    }
  ],
  "tags": ["tag1", "tag2", "tag3"],
  "categories": ["category"],
  "featuredImageKeyword": "pexels search term for featured image",
  "socialCaption": "Twitter/X caption under 280 chars with hashtags",
  "linkedinCaption": "LinkedIn post intro (3 sentences)",
  "proofreaderNotes": ["improvement note"]
}

COPYWRITING RULES:
- Hook section: open with a bold claim, striking stat, or vivid scenario. No fluff.
- body field: PLAIN TEXT ONLY. No HTML tags. Ever.
- Use the Inverted Pyramid: most important info first.
- Every H2 should promise a benefit or answer a question.
- Include at least one pull-quote (>> prefix) that readers will want to screenshot.
- CTA section: specific, single action. No "click here."
- Conclusion: summarise + reinforce the CTA.
- Natural keyword placement — not forced.
- Short paragraphs (2-3 sentences max). Conversational. Active voice.
- Write the FULL post, not a summary or outline.`;
}

/* ── Parsers ────────────────────────────────────────── */
export function parseEditorialResponse(text) {
  const clean = stripCodeFences(text);
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Editorial response did not return valid JSON.');
    return JSON.parse(match[0]);
  }
}

export function parseBlogResponse(text) {
  const clean = stripCodeFences(text);
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Blog response did not return valid JSON.');
    return JSON.parse(match[0]);
  }
}

function stripCodeFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

/* ── Normalise section (shared) ─────────────────────── */
export function normalizeSection(s) {
  return {
    type:         String(s.type         || 'chapter').toLowerCase().trim(),
    title:        stripChapterPrefix(String(s.title       || '')),
    body:         stripHtmlTags(String(s.body         || '')),
    designIntent: String(s.designIntent || ''),
    heading:      String(s.heading      || ''),
  };
}

/* ── Strip "Chapter N:" prefix from titles ──────────── */
function stripChapterPrefix(title) {
  return title.replace(/^chapter\s+\d+\s*[:\-–—]\s*/i, '').trim();
}

/* ── Strip any HTML tags the AI smuggled in ─────────── */
export function stripHtmlTags(str) {
  return str
    .replace(/<\/?[a-z][a-z0-9]*(?:\s[^>]*)?\s*\/?>/gi, '') // remove all tags
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\*([^*]+)\*/g, '$1')  // strip markdown bold *text*
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ── Validate editorial package ─────────────────────── */
export function validateEditorialPackage(pkg, project = {}) {
  if (!pkg || typeof pkg !== 'object') throw new Error('Invalid editorial package');
  const out = { ...pkg };
  out.title    = (pkg.title    && String(pkg.title).trim())    || project.title    || 'Untitled';
  out.subtitle = (pkg.subtitle && String(pkg.subtitle).trim()) || project.subtitle || '';

  out.sections = Array.isArray(pkg.sections)
    ? pkg.sections.map(normalizeSection)
    : [{ type: 'frontmatter', title: 'Copyright', body: `© ${project.author || ''} ${new Date().getFullYear()}`, designIntent: '' }];

  const hasFront = out.sections.some(s => ['frontmatter','copyright'].includes(s.type));
  if (!hasFront) {
    out.sections.unshift({
      type: 'frontmatter',
      title: 'Copyright',
      body: `© ${project.author || ''} ${new Date().getFullYear()}. All rights reserved.`,
      designIntent: '',
    });
  }

  out.proofreaderNotes = Array.isArray(pkg.proofreaderNotes) ? pkg.proofreaderNotes : [];
  out.citations        = Array.isArray(pkg.citations)        ? pkg.citations        : [];
  return out;
}
