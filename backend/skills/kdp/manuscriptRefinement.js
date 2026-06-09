/**
 * Refine imported manuscripts — structure, proofread, reorganize, polish.
 * Skips research + greenfield generation; uses existing prose as source.
 */

import { normalizeSection, detectNiche } from '../editorial.js';
import { getLibraryContext, getIntentFolderContext } from '../../referenceLibrary.js';
import { normalizeManuscriptSections } from './manuscriptValidator.js';
import { applyImprintToManuscript } from './imprintPack.js';
import { parseImportedText } from './manuscriptImport.js';
import { buildEditorialDirective } from './editorialDirective.js';
import { resolvePageBudget } from './pageBudget.js';

function parseJson(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : raw;
  return JSON.parse(body);
}

function buildStructurePrompt(project, sections, libraryContext, editorialDirective) {
  const outline = sections.map((s, i) => `${i + 1}. [${s.type}] ${s.title} (~${(s.body || '').split(/\s+/).filter(Boolean).length} words)`).join('\n');

  return `You are PathGuru Publishers — senior developmental editor and proofreader.

An author submitted an EXISTING manuscript. Your job is to propose a professional book structure — NOT to rewrite yet.
Honor the author's requested style, tone, voice, and depth throughout.

${libraryContext ? libraryContext.slice(0, 2000) + '\n' : ''}
BOOK: ${project.title}

EDITORIAL DIRECTIVE (mandatory — structure and proofreading must follow this):
${editorialDirective}

CURRENT SECTIONS:
${outline}

Return STRICT JSON ONLY:
{
  "title": "refined publishable title",
  "subtitle": "marketable subtitle",
  "positioning": "one paragraph reader promise",
  "writingPersonality": "voice description for proofreading pass",
  "proofreaderNotes": ["structural note 1", "structural note 2"],
  "sections": [
    {
      "index": 0,
      "title": "refined section title",
      "type": "introduction|chapter|conclusion|cta",
      "action": "keep|merge|split|reorder",
      "mergeWith": null,
      "editorialBrief": "what to fix in proofreading pass"
    }
  ]
}

Rules:
- Preserve the author's facts, stories, and meaning — reorganize only where it improves flow.
- Every section needs a clear type and editorialBrief for the proofreading pass.
- Flag typos, weak openings, and missing transitions in proofreaderNotes.
- No HTML. No rewritten bodies yet.`;
}

function buildRefineSectionPrompt(project, section, brief, nicheProfile, libraryContext, editorialDirective) {
  const profile = nicheProfile?.profile || nicheProfile;
  return `You are PathGuru Publishers — professional proofreader and line editor.

Refine ONE section of an imported manuscript.
Match the EDITORIAL DIRECTIVE below for tone, voice personality, depth, and style.
Preserve the author's facts and stories — fix grammar, spelling, flow, and organization.
Improve paragraph breaks; add ALL CAPS subheadings where the section needs structure.
Add exactly one >> pull-quote sentence if none exists.
Do NOT invent new facts or change the core message.

${libraryContext ? libraryContext.slice(0, 1200) + '\n' : ''}
NICHE VOICE: ${profile?.voice || ''}
BOOK: ${project.title}

EDITORIAL DIRECTIVE:
${editorialDirective}

SECTION: "${section.title}" (${section.type || 'chapter'})
SECTION EDITORIAL BRIEF: ${brief || 'Polish and professionalize per directive above.'}

SOURCE TEXT:
"""
${(section.body || '').slice(0, 12000)}
"""

Return STRICT JSON ONLY:
{
  "title": "${(section.title || '').replace(/"/g, '\\"')}",
  "type": "${section.type || 'chapter'}",
  "body": "PLAIN TEXT ONLY. Refined prose. Double newlines between paragraphs. ALL CAPS subheadings. >> for one pull quote.",
  "designIntent": {
    "layout": "chapter",
    "pullQuote": null,
    "openingHook": "chapter",
    "visualWeight": "medium",
    "pageBreakBefore": true,
    "subheadings": [],
    "listType": "none"
  }
}

MANDATORY: Return the full refined section — never truncate or summarize.`;
}

export async function runManuscriptRefinement(input, project, provider, callAi) {
  const rawText = input.sourceManuscript?.text
    || input.manuscriptText
    || input.importedText
    || '';
  const preParsed = input.sourceManuscript?.sections?.length
    ? input.sourceManuscript
    : parseImportedText(rawText, { title: input.title || project.title, subtitle: input.subtitle });

  const roughSections = (preParsed.sections || []).map(s => ({
    type:  s.type || 'chapter',
    title: s.title || 'Section',
    body:  s.body || '',
  }));

  if (!roughSections.length) {
    throw new Error('No manuscript content found — upload a file or paste text.');
  }

  const { profile } = detectNiche(project.topic || project.title, project.writingMode || '');
  const style = project.publisherProfile?.resolvedStyle || input.style || 'modern';
  let libraryContext = await getLibraryContext(style).catch(() => '');
  const intentCtx = await getIntentFolderContext(
    input.publishingIntent || project.publishingIntent,
    input.ebookGenre || project.ebookGenre,
  ).catch(() => '');
  if (intentCtx) libraryContext = `${libraryContext}\n\n${intentCtx}`.trim();

  const editorialDirective = buildEditorialDirective(input, project);
  project.pageBudget = project.pageBudget || resolvePageBudget(input, project);

  console.log(`[KDP Refine] Analyzing structure (${roughSections.length} sections, ${preParsed.wordCount || '?'} words)...`);
  const structureRaw = await callAi(provider, buildStructurePrompt(
    project, roughSections, libraryContext, editorialDirective,
  ));
  const structure = parseJson(structureRaw);

  const plan = Array.isArray(structure.sections) ? structure.sections : [];
  const refinedSections = [];
  const proofreaderNotes = [...(structure.proofreaderNotes || [])];

  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    const srcIdx = Number.isFinite(item.index) ? item.index : i;
    const src = roughSections[srcIdx] || roughSections[i];
    if (!src) continue;

    console.log(`[KDP Refine]   Polishing "${src.title}"...`);
    try {
      const raw = await callAi(provider, buildRefineSectionPrompt(
        project, src, item.editorialBrief || '', { profile }, libraryContext, editorialDirective,
      ));
      const parsed = parseJson(raw);
      refinedSections.push(normalizeSection({
        type:  parsed.type || item.type || src.type || 'chapter',
        title: parsed.title || item.title || src.title,
        body:  parsed.body || src.body,
        designIntent: parsed.designIntent || { layout: 'chapter' },
      }));
    } catch (e) {
      console.warn(`[KDP Refine]   Section failed "${src.title}":`, e.message);
      refinedSections.push(normalizeSection({ ...src, type: item.type || src.type }));
      proofreaderNotes.push(`Section "${src.title}" used source text (AI refine failed).`);
    }
  }

  if (!refinedSections.length) {
    for (const s of roughSections) {
      refinedSections.push(normalizeSection(s));
    }
  }

  let manuscript = {
    title:              structure.title || preParsed.title || project.title,
    subtitle:           structure.subtitle || preParsed.subtitle || project.subtitle,
    positioning:        structure.positioning || '',
    writingPersonality: structure.writingPersonality || input.writingPersonality || profile?.voice,
    proofreaderNotes,
    sections:           normalizeManuscriptSections(refinedSections),
    citations:          input.sourceManuscript?.citations || [],
    source:             'import-refinement',
  };

  const assetBase = input.assetBaseUrl || process.env.PATHGURU_PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`;
  manuscript = await applyImprintToManuscript(manuscript, project, { assetBaseUrl: assetBase });

  return manuscript;
}
