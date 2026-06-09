/**
 * KDP back cover — AI copy generation + HTML layout.
 * Uses reference-library/ebook/back-cover PDFs as style guides.
 */

import { getBackCoverLibraryContext } from '../../referenceLibrary.js';
import { callAiProvider, resolveEditorialProvider } from '../../aiPipeline.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseJson(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : raw;
  return JSON.parse(body);
}

function hasUserBackCoverCopy(project, options = {}) {
  return Boolean(
    options.blurb || project.backCoverBlurb
    || (options.bullets || project.backCoverBullets || []).length
    || options.authorBio || project.backCoverAuthorBio,
  );
}

function buildBackCoverPrompt(project, manuscript, libraryContext, userHints = {}) {
  const summary = (manuscript?.positioning || project.subtitle || '').slice(0, 600);
  const chapterTitles = (manuscript?.sections || [])
    .filter(s => !['imprint-sigil', 'publisher-intro', 'title-page', 'copyright-page', 'toc'].includes((s.type || '').toLowerCase()))
    .slice(0, 12)
    .map(s => s.title)
    .join(' · ');

  return `You are PathGuru Publishers — KDP back-cover copywriter.

Write professional BACK COVER COPY for a print-ready book.

${libraryContext ? libraryContext + '\n\n' : ''}
BOOK: ${project.title}
SUBTITLE: ${project.subtitle || ''}
AUTHOR: ${project.author || ''}
PUBLISHER: ${project.publisher || ''}
AUDIENCE: ${project.audience || ''}
TONE: ${project.tone || 'expert, persuasive'}

POSITIONING:
${summary || 'Derive from chapter list below.'}

CHAPTERS: ${chapterTitles || 'n/a'}

${userHints.blurb ? `USER BLURB DRAFT (polish, do not discard intent): ${userHints.blurb}` : ''}
${userHints.bullets?.length ? `USER BULLETS (refine): ${userHints.bullets.join(' | ')}` : ''}
${userHints.authorBio ? `USER BIO (refine): ${userHints.authorBio}` : ''}

Return STRICT JSON ONLY:
{
  "blurb": "2-4 sentence hook — emotional + practical promise",
  "bullets": ["benefit 1", "benefit 2", "benefit 3", "benefit 4"],
  "authorBio": "1-2 sentence author credential line"
}

Rules:
- Match reference library patterns for length and rhythm when provided.
- No HTML. No markdown. Plain text only.
- Bullets: 3–5 items, parallel grammar, reader outcomes not features.
- Blurb must stand alone on a KDP back cover.`;
}

async function generateBackCoverCopy(project, manuscript, options = {}) {
  const provider = resolveEditorialProvider();
  if (!provider) {
    return {
      blurb:     options.blurb || project.backCoverBlurb || manuscript?.positioning || project.subtitle || '',
      bullets:   options.bullets || project.backCoverBullets || [],
      authorBio: options.authorBio || project.backCoverAuthorBio || '',
    };
  }

  const libraryContext = await getBackCoverLibraryContext().catch(() => '');
  const prompt = buildBackCoverPrompt(project, manuscript, libraryContext, {
    blurb:     options.blurb || project.backCoverBlurb,
    bullets:   options.bullets || project.backCoverBullets,
    authorBio: options.authorBio || project.backCoverAuthorBio,
  });

  try {
    const raw = await callAiProvider(provider, prompt);
    const parsed = parseJson(raw);
    return {
      blurb:     parsed.blurb || options.blurb || manuscript?.positioning || project.subtitle || '',
      bullets:   Array.isArray(parsed.bullets) ? parsed.bullets : (options.bullets || []),
      authorBio: parsed.authorBio || options.authorBio || '',
    };
  } catch (e) {
    console.warn('[BackCover] AI copy failed:', e.message);
    return {
      blurb:     options.blurb || project.backCoverBlurb || manuscript?.positioning || project.subtitle || '',
      bullets:   options.bullets || project.backCoverBullets || [],
      authorBio: options.authorBio || project.backCoverAuthorBio || '',
    };
  }
}

export function buildBackCoverHtml(project, options = {}) {
  const blurb    = options.blurb || project.backCoverBlurb || project.positioning || project.subtitle || '';
  const bullets  = options.bullets || project.backCoverBullets || [];
  const authorBio = options.authorBio || project.backCoverAuthorBio || '';
  const barcode  = options.showBarcode !== false;

  const bulletHtml = (Array.isArray(bullets) ? bullets : String(bullets).split('\n'))
    .map(b => b.trim())
    .filter(Boolean)
    .map(b => `<li>${esc(b.replace(/^[-•]\s*/, ''))}</li>`)
    .join('');

  return `
<div class="back-cover-page">
  <div class="back-cover-inner">
    <p class="back-cover-blurb">${esc(blurb)}</p>
    ${bulletHtml ? `<ul class="back-cover-bullets">${bulletHtml}</ul>` : ''}
    ${authorBio ? `<p class="back-cover-author">${esc(authorBio)}</p>` : ''}
    <p class="back-cover-publisher">${esc(project.publisher || '')}</p>
    ${barcode ? '<div class="back-cover-barcode" aria-hidden="true"><span>ISBN BARCODE PLACEHOLDER</span></div>' : ''}
  </div>
</div>`;
}

/**
 * Build back cover HTML — AI-generates copy when fields are empty;
 * always consults ebook/back-cover reference library when present.
 */
export async function buildBackCoverPackage(project, manuscript, options = {}) {
  const userCopy = hasUserBackCoverCopy(project, options);
  const needsAi = options.forceAi
    || !userCopy
    || !((options.blurb || project.backCoverBlurb) && (options.bullets || project.backCoverBullets || []).length);

  let copy = {
    blurb:     options.blurb || project.backCoverBlurb || '',
    bullets:   options.bullets || project.backCoverBullets || [],
    authorBio: options.authorBio || project.backCoverAuthorBio || '',
  };

  if (needsAi) {
    console.log('[PathGuru] Generating back cover copy (reference library + AI)...');
    copy = await generateBackCoverCopy(project, manuscript, copy);
  } else if (!options.blurb && !project.backCoverBlurb) {
    // User provided bullets/bio only — still polish blurb via AI
    copy = await generateBackCoverCopy(project, manuscript, copy);
  }

  project.backCoverBlurb     = copy.blurb;
  project.backCoverBullets   = copy.bullets;
  project.backCoverAuthorBio = copy.authorBio;

  return buildBackCoverHtml(project, copy);
}
