/**
 * Chunked KDP editorial — outline + per-chapter generation (avoids token truncation).
 */

import {
  buildEditorialPrompt,
  parseEditorialResponse,
  normalizeSection,
  detectNiche,
} from '../editorial.js';
import { getLibraryContext, getIntentFolderContext } from '../../referenceLibrary.js';
import { resolvePageBudget, budgetSummaryLine } from './pageBudget.js';
import { normalizeManuscriptSections } from './manuscriptValidator.js';
import { applyImprintToManuscript } from './imprintPack.js';

function parseJson(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : raw;
  return JSON.parse(body);
}

function buildOutlinePrompt(input, project, research, nicheProfile, budget, libraryContext) {
  const profile = nicheProfile?.profile || nicheProfile;
  return `You are PathGuru Publishers — senior acquisitions editor.

Create a DETAILED book outline only. Do NOT write chapter bodies.

${libraryContext ? libraryContext + '\n' : ''}
PAGE BUDGET: ${budgetSummaryLine(budget)}
You MUST plan exactly ${budget.targetChapterCount} chapters (modules), plus optional introduction and conclusion sections.

PROJECT:
- Title: ${project.title}
- Topic: ${project.topic}
- Audience: ${project.audience}
- Outcome: ${project.outcome}
- Voice: ${profile?.voice || 'expert guide'}

RESEARCH:
${(research?.summary || '').slice(0, 3500)}

Return STRICT JSON ONLY:
{
  "title": "publishable title",
  "subtitle": "marketable subtitle",
  "positioning": "one paragraph promise",
  "writingPersonality": "voice description",
  "chapters": [
    {
      "title": "chapter title without Chapter N prefix",
      "type": "introduction|chapter|conclusion",
      "summary": "2-3 sentences on what this section covers",
      "subheadings": ["ALL CAPS SUBHEAD A", "ALL CAPS SUBHEAD B", "ALL CAPS SUBHEAD C"]
    }
  ],
  "citations": [{"title":"source","url":"url","content":"note"}]
}

Rules:
- Exactly ${budget.targetChapterCount} items in chapters array.
- First may be type introduction if appropriate; last may be conclusion or lead into CTA.
- Every chapter needs 3+ subheadings in ALL CAPS.
- No HTML. No chapter bodies.`;
}

function buildChapterPrompt(input, project, research, nicheProfile, budget, chapter, chapterIndex, totalChapters, libraryContext) {
  const profile = nicheProfile?.profile || nicheProfile;
  const wcTarget = budget.wordsPerChapter;

  return `You are PathGuru Publishers — write ONE section of a premium nonfiction book.

${libraryContext ? libraryContext.slice(0, 2000) + '\n' : ''}
NICHE VOICE: ${profile?.voice || 'expert'} · ${profile?.rhythm || ''}
Chapter opening style: ${profile?.chapterOpenStyle || 'strong hook'}

BOOK: ${project.title}
AUDIENCE: ${project.audience}
SECTION ${chapterIndex + 1} of ${totalChapters}: "${chapter.title}"
TYPE: ${chapter.type || 'chapter'}
SECTION PLAN: ${chapter.summary || ''}
REQUIRED SUBHEADINGS (use as ALL CAPS lines in body): ${(chapter.subheadings || []).join(' | ')}

RESEARCH (use facts/examples):
${(research?.summary || '').slice(0, 2500)}

Return STRICT JSON ONLY:
{
  "title": "${chapter.title.replace(/"/g, '\\"')}",
  "type": "${chapter.type || 'chapter'}",
  "body": "PLAIN TEXT ONLY. Minimum ${wcTarget} words. Double newlines between paragraphs. ALL CAPS lines for subheadings. >> for one pull-quote sentence. - for bullets. Expand with examples — never summarize.",
  "designIntent": {
    "layout": "chapter",
    "pullQuote": null,
    "openingHook": "chapter",
    "visualWeight": "medium",
    "pageBreakBefore": true,
    "calloutStat": null,
    "subheadings": ${JSON.stringify(chapter.subheadings || [])},
    "listType": "bullet"
  }
}

MANDATORY: body must exceed ${wcTarget} words. Include all listed subheadings as ALL CAPS lines.`;
}

function buildCtaPrompt(project, research) {
  return `Write the closing CTA section for "${project.title}".
Audience: ${project.audience}. Outcome: ${project.outcome}.

Return STRICT JSON:
{
  "title": "Your Next Step",
  "type": "cta",
  "body": "80-150 words. Plain text. Clear call to action.",
  "designIntent": { "layout": "cta", "pageBreakBefore": true, "listType": "none" }
}`;
}

export async function runChunkedEditorial(input, project, research, provider, callAi) {
  const { niche, profile } = detectNiche(project.topic || project.title, project.writingMode || '');
  const budget = resolvePageBudget(input, project);

  const style = project.publisherProfile?.resolvedStyle || input.style || 'modern';
  let libraryContext = await getLibraryContext(style).catch(() => '');
  const intentCtx = await getIntentFolderContext(
    input.publishingIntent || project.publishingIntent,
    input.ebookGenre || project.ebookGenre,
  ).catch(() => '');
  if (intentCtx) libraryContext = `${libraryContext}\n\n${intentCtx}`.trim();

  project.pageBudget = budget;
  project.niche = niche;

  const outlinePrompt = buildOutlinePrompt(input, project, research, { profile }, budget, libraryContext);
  const outlineRaw = await callAi(provider, outlinePrompt);
  const outline = parseJson(outlineRaw);

  const chapters = Array.isArray(outline.chapters) ? outline.chapters : [];
  if (chapters.length < 3) {
    throw new Error('Outline failed — too few chapters planned');
  }

  console.log(`[KDP Editorial] Chunked write: ${chapters.length} sections, target ${budget.wordsPerChapter} w/ch`);

  const writtenSections = [];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const chPrompt = buildChapterPrompt(
      input, project, research, { profile }, budget, ch, i, chapters.length, libraryContext,
    );
    try {
      const raw = await callAi(provider, chPrompt);
      const parsed = parseJson(raw);
      writtenSections.push(normalizeSection({
        type:  parsed.type || ch.type || 'chapter',
        title: parsed.title || ch.title,
        body:  parsed.body || '',
        designIntent: parsed.designIntent || { layout: 'chapter' },
      }));
      const wc = (parsed.body || '').split(/\s+/).filter(Boolean).length;
      console.log(`[KDP Editorial]   ✓ "${ch.title}" — ${wc} words`);
    } catch (e) {
      console.warn(`[KDP Editorial]   ✗ chapter failed "${ch.title}":`, e.message);
    }
  }

  let ctaSection = null;
  try {
    const ctaRaw = await callAi(provider, buildCtaPrompt(project, research));
    const cta = parseJson(ctaRaw);
    ctaSection = normalizeSection({ ...cta, type: 'cta' });
  } catch {
    ctaSection = normalizeSection({
      type: 'cta',
      title: 'Your Next Step',
      body: project.conversionGoal || 'Take the next step toward your goal today.',
      designIntent: { layout: 'cta' },
    });
  }

  let manuscript = {
    title:                outline.title || project.title,
    subtitle:             outline.subtitle || project.subtitle,
    positioning:          outline.positioning || '',
    writingPersonality:   outline.writingPersonality || input.writingPersonality || profile.voice,
    proofreaderNotes:     [],
    sections:             [...writtenSections, ctaSection],
    citations:            outline.citations || research?.sources || [],
  };

  manuscript.sections = normalizeManuscriptSections(manuscript.sections);

  const assetBase = input.assetBaseUrl || process.env.PATHGURU_PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`;
  manuscript = await applyImprintToManuscript(manuscript, project, { assetBaseUrl: assetBase });

  return manuscript;
}

/** Fallback: single-shot editorial (legacy) with budget-aware prompt. */
export async function runSingleShotEditorial(input, project, research, provider, callAi) {
  const { profile } = detectNiche(project.topic || project.title, project.writingMode || '');
  const budget = resolvePageBudget(input, project);
  const style = project.publisherProfile?.resolvedStyle || input.style || 'modern';
  let libraryContext = await getLibraryContext(style).catch(() => '');
  const intentCtx = await getIntentFolderContext(
    input.publishingIntent || '',
    input.ebookGenre || '',
  ).catch(() => '');
  if (intentCtx) libraryContext = `${libraryContext}\n\n${intentCtx}`.trim();

  let prompt = buildEditorialPrompt(input, project, research, profile, libraryContext);
  prompt += `\n\nPAGE BUDGET (MANDATORY):\n${budgetSummaryLine(budget)}\n`;
  prompt += `Plan ${budget.targetChapterCount} chapters at ${budget.wordsPerChapter}+ words each.\n`;
  prompt += `Do NOT include copyright or title pages — imprint handles front matter.\n`;
  prompt += `Start sections with introduction or chapter types only.\n`;

  const text = await callAi(provider, prompt);
  const parsed = parseEditorialResponse(text);

  let manuscript = {
    title:              parsed.title || project.title,
    subtitle:           parsed.subtitle || project.subtitle,
    positioning:        parsed.positioning || '',
    writingPersonality: parsed.writingPersonality || '',
    proofreaderNotes:   parsed.proofreaderNotes || [],
    sections:           normalizeManuscriptSections((parsed.sections || []).map(normalizeSection)),
    citations:          parsed.citations || research?.sources || [],
  };

  const assetBase = input.assetBaseUrl || process.env.PATHGURU_PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`;
  return applyImprintToManuscript(manuscript, project, { assetBaseUrl: assetBase });
}
