/**
 * KDP page budget — maps brief length + publishing intent to chapter/word targets.
 */

const LENGTH_PRESETS = {
  concise: {
    label:           'Concise (20–30 pages)',
    targetPagesMin:  20,
    targetPagesMax:  30,
    chapterCountMin: 4,
    chapterCountMax: 5,
    wordsPerChapter: 1400,
    wordsPerChapterMax: 1800,
  },
  standard: {
    label:           'Standard (40–60 pages)',
    targetPagesMin:  40,
    targetPagesMax:  60,
    chapterCountMin: 7,
    chapterCountMax: 9,
    wordsPerChapter: 1800,
    wordsPerChapterMax: 2200,
  },
  deep: {
    label:           'Deep guide (80–120 pages)',
    targetPagesMin:  80,
    targetPagesMax:  120,
    chapterCountMin: 10,
    chapterCountMax: 14,
    wordsPerChapter: 2000,
    wordsPerChapterMax: 2500,
  },
};

const INTENT_ADJUSTMENTS = {
  playbook:   { lengthBoost: 'standard', extraChapters: 1 },
  research:   { lengthBoost: 'standard', extraChapters: 1 },
  'case-study': { lengthBoost: 'concise', extraChapters: 0 },
  ebook:      { lengthBoost: null, extraChapters: 0 },
};

/** ~280 words per 6×9 page (interior prose). */
const WORDS_PER_PAGE = 280;

export function resolvePageBudget(input = {}, project = {}) {
  let lengthKey = String(input.length || project.length || 'standard').toLowerCase();
  const intent = String(input.publishingIntent || project.publishingIntent || 'ebook').toLowerCase();

  const intentAdj = INTENT_ADJUSTMENTS[intent];
  if (intentAdj?.lengthBoost && lengthKey === 'concise') {
    lengthKey = intentAdj.lengthBoost;
  }

  const base = LENGTH_PRESETS[lengthKey] || LENGTH_PRESETS.standard;
  const extra = intentAdj?.extraChapters || 0;

  const chapterCountMin = base.chapterCountMin + extra;
  const chapterCountMax = base.chapterCountMax + extra;
  const targetWordsMin = chapterCountMin * base.wordsPerChapter;
  const targetWordsMax = chapterCountMax * base.wordsPerChapterMax;

  return {
    lengthKey,
    publishingIntent: intent,
    ...base,
    chapterCountMin,
    chapterCountMax,
    targetChapterCount: Math.round((chapterCountMin + chapterCountMax) / 2),
    targetWordsMin,
    targetWordsMax,
    targetPagesMin: base.targetPagesMin,
    targetPagesMax: base.targetPagesMax,
    wordsPerChapter: base.wordsPerChapter,
    wordsPerChapterMax: base.wordsPerChapterMax,
    minWordsPerChapter: Math.max(1200, base.wordsPerChapter - 200),
  };
}

export function estimatePagesFromManuscript(manuscript) {
  const sections = manuscript?.sections || [];
  const imprintTypes = new Set([
    'imprint-sigil', 'publisher-intro', 'title-page', 'copyright-page',
    'frontmatter', 'copyright', 'toc',
  ]);
  let words = 0;
  for (const s of sections) {
    const type = (s.type || '').toLowerCase();
    if (imprintTypes.has(type)) continue;
    words += (s.body || '').split(/\s+/).filter(Boolean).length;
  }
  const contentPages = Math.max(1, Math.ceil(words / WORDS_PER_PAGE));
  const frontPages = sections.filter(s => imprintTypes.has((s.type || '').toLowerCase())).length + 2;
  return {
    wordCount: words,
    estimatedPages: contentPages + frontPages,
    contentPages,
    frontPages,
  };
}

export function budgetSummaryLine(budget) {
  return `Target: ${budget.targetPagesMin}–${budget.targetPagesMax} pages · ${budget.chapterCountMin}–${budget.chapterCountMax} chapters · ${budget.wordsPerChapter}–${budget.wordsPerChapterMax} words/chapter`;
}
