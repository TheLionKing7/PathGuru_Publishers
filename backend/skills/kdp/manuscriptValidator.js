/**
 * Manuscript structure validation + paragraph normalization.
 */

import { estimatePagesFromManuscript } from './pageBudget.js';

const CHAPTER_TYPES = new Set(['chapter', 'section', 'introduction', 'intro', 'conclusion', 'module']);

const MAX_PARAGRAPH_WORDS = 95;

/** Split wall-of-text blocks at sentence boundaries for readable print layout. */
export function splitLongParagraphs(text = '', maxWords = MAX_PARAGRAPH_WORDS) {
  if (!text?.trim()) return '';
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const out = [];

  for (let block of blocks) {
    block = block.replace(/\n+/g, ' ').trim();
    if (!block) continue;

    const words = block.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      out.push(block);
      continue;
    }

    const sentences = block.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [block];
    let chunk = '';
    let wc = 0;

    for (const sent of sentences) {
      const s = sent.trim();
      if (!s) continue;
      const sw = s.split(/\s+/).filter(Boolean).length;
      if (wc > 0 && wc + sw > maxWords) {
        out.push(chunk.trim());
        chunk = s;
        wc = sw;
      } else {
        chunk = chunk ? `${chunk} ${s}` : s;
        wc += sw;
      }
    }
    if (chunk.trim()) out.push(chunk.trim());
  }

  return out.join('\n\n');
}

export function normalizeParagraphs(body = '') {
  if (!body || typeof body !== 'string') return '';
  let text = body.replace(/\r\n/g, '\n').trim();

  if (!text.includes('\n\n') && text.length > 400) {
    text = text
      .replace(/([.!?])\s+(?=[A-Z"'])/g, '$1\n\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return splitLongParagraphs(text);
}

export function normalizeManuscriptSections(sections = []) {
  return sections.map(s => {
    const type = (s.type || '').toLowerCase();
    if (['imprint-sigil', 'publisher-intro', 'title-page', 'copyright-page', 'toc'].includes(type)) {
      return s;
    }
    return {
      ...s,
      body: normalizeParagraphs(s.body || ''),
    };
  });
}

function countSubheadings(body = '') {
  const lines = body.split('\n');
  return lines.filter(l => /^[A-Z][A-Z\s\d:,'\-–]{4,}$/.test(l.trim()) && l.trim().length < 80).length;
}

function wordCount(body = '') {
  return (body || '').split(/\s+/).filter(Boolean).length;
}

export function validateManuscript(manuscript, budget) {
  const issues = [];
  const sectionIssues = [];
  const sections = manuscript?.sections || [];

  const chapters = sections.filter(s => {
    const t = (s.type || s.designIntent?.layout || 'chapter').toLowerCase();
    return CHAPTER_TYPES.has(t);
  });

  if (chapters.length < budget.chapterCountMin) {
    issues.push(`Only ${chapters.length} chapters — need at least ${budget.chapterCountMin}`);
  }

  for (const ch of chapters) {
    const wc = wordCount(ch.body);
    const chIssues = [];
    if (wc < budget.minWordsPerChapter) {
      chIssues.push(`body too short (${wc} words, need ${budget.minWordsPerChapter}+)`);
    }
    if (countSubheadings(ch.body) < 2) {
      chIssues.push('missing ALL CAPS subheadings (need at least 2)');
    }
    if (!ch.body?.includes('>>') && !ch.designIntent?.pullQuote) {
      chIssues.push('no pull quote — add >> sentence');
    }
    const paras = (ch.body || '').split(/\n{2,}/).filter(p => p.trim().length > 40);
    if (paras.length < 3) {
      chIssues.push('too few paragraphs — need at least 3');
    }
    if (chIssues.length) {
      sectionIssues.push({ title: ch.title, type: ch.type, issues: chIssues, wordCount: wc });
    }
  }

  const est = estimatePagesFromManuscript(manuscript);
  if (est.estimatedPages < budget.targetPagesMin * 0.85) {
    issues.push(`Estimated ${est.estimatedPages} pages — target minimum ${budget.targetPagesMin}`);
  }

  return {
    passed:       issues.length === 0 && sectionIssues.length === 0,
    issues,
    sectionIssues,
    chapterCount:   chapters.length,
    estimatedPages: est.estimatedPages,
    wordCount:      est.wordCount,
  };
}

export function validationToRenderReport(validation) {
  return {
    sections: (validation.sectionIssues || []).map(s => ({
      title:     s.title,
      type:      'chapter',
      issues:    s.issues,
      wordCount: s.wordCount,
    })),
    warnings: validation.issues,
  };
}
