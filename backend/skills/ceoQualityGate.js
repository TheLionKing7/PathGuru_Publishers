/**
 * CEO Output Quality Gate — enforces expertise_benchmarks via DigiFusion firm IP rules.
 */

const PLATITUDE_PATTERNS = [
  /\boptimize processes\b/i,
  /\bfoster synergy\b/i,
  /\bdigital transformation\b(?!.*engagement model|.*ave|.*deal engine|.*c2c)/i,
  /\bin today'?s fast[- ]paced\b/i,
  /\bleverage best practices\b/i,
  /\bholistic approach\b/i,
  /\bmove the needle\b/i,
  /\blow[- ]hanging fruit\b/i,
];

const GENERIC_AI_OPENERS = [
  /^in today'?s/i,
  /^as businesses increasingly/i,
  /^in an era of/i,
  /^the landscape of/i,
];

/**
 * @param {object} opts
 * @param {string} opts.text
 * @param {'briefing'|'blog_brief'|'workflow'|'client'|'general'} [opts.outputType]
 */
export function scoreCeoOutput({ text = '', outputType = 'general' }) {
  const flags = [];
  let score = 100;
  const trimmed = (text || '').trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const firstSentence = trimmed.split(/[.!?]\s/)[0] || '';

  if (wordCount < 40 && outputType === 'briefing') {
    flags.push('⚠️ Briefing too short for executive use');
    score -= 15;
  }

  if (wordCount > 80 && firstSentence.length > 220) {
    flags.push('⚠️ Recommendation not leading — first sentence too long (Minto Pyramid)');
    score -= 12;
  } else if (firstSentence.length > 0 && firstSentence.length <= 180) {
    flags.push('✅ Conclusion-first structure');
  }

  for (const pat of PLATITUDE_PATTERNS) {
    if (pat.test(trimmed)) {
      flags.push(`⚠️ Platitude detected: ${pat.source.slice(0, 40)}…`);
      score -= 10;
    }
  }

  for (const pat of GENERIC_AI_OPENERS) {
    if (pat.test(trimmed)) {
      flags.push('⚠️ Generic AI opener — rewrite with a specific friction point');
      score -= 15;
      break;
    }
  }

  if (outputType === 'workflow' && !/ave|diagnos|architect|error|source of truth|webhook|n8n/i.test(trimmed)) {
    flags.push('⚠️ Workflow spec missing AVE phase or integration detail');
    score -= 12;
  }

  if (outputType === 'blog_brief' && !/c2c|authority|conversion|funnel|pillar|boss|approval/i.test(trimmed)) {
    flags.push('⚠️ Blog brief should reference C2C stage or approval path');
    score -= 8;
  }

  const hasFirmRef = /engagement model|ave|deal engine|c2c|content-to-capital|automation velocity|orion|atlas|nova|aether/i.test(trimmed);
  if (!hasFirmRef && outputType !== 'general') {
    flags.push('⚠️ No firm IP framework reference');
    score -= 8;
  } else if (hasFirmRef) {
    flags.push('✅ Firm IP referenced');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade, passed, recommendation;
  if (score >= 80) {
    grade = 'A'; passed = true;
    recommendation = 'CEO-grade output. Deliver to Boss.';
  } else if (score >= 65) {
    grade = 'B'; passed = true;
    recommendation = 'Acceptable — minor tightening recommended.';
  } else if (score >= 50) {
    grade = 'C'; passed = true;
    recommendation = 'Weak — rewrite lead sentence and remove platitudes before sending.';
  } else {
    grade = 'D'; passed = false;
    recommendation = 'Reject and rewrite — fails CEO quality standard.';
  }

  return { score, grade, passed, flags, wordCount, recommendation, outputType };
}

export function formatCeoQualityBadge(result) {
  if (!result) return '';
  return `[CEO Quality: ${result.grade} ${result.score}/100] ${result.recommendation}`;
}
