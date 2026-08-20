/**
 * DigiFusion Intelligence Network — Research Quality Gate
 * ========================================================
 * Scores Orion's research brief BEFORE it reaches Nexus or Boss.
 *
 * Why this exists:
 *   Orion can return thin or hallucination-prone briefs when:
 *     - Tavily returns no results (quota, bad queries, or API error)
 *     - Firecrawl timeouts → all results are snippet-level
 *     - AI synthesis invents statistics not in raw sources
 *     - Brief is too short to be actionable
 *
 * The gate scores the brief and:
 *   - Grade A (80-100) → passes directly to Boss with score attached
 *   - Grade B (65-79)  → passes with warnings flagged
 *   - Grade C (60-64)  → meets the minimum gate; Boss may recommend a deeper run
 *   - Grade D (< 60)   → FAILS the gate — no writing task, one strict retry, then wait for a human
 *
 * Called by: Nexus after every Orion research call, before presenting to Boss.
 */

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCORER
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabase } from '../supabaseClient.js';
import { postSlackMessage, recordNotificationAttempt, slackChannelFor } from './slackNotify.js';

/**
 * Briefs scoring below this value fail the quality gate and must not advance
 * to a downstream writing task. The threshold is a deliberate product decision,
 * not an env var — raising it should require a code change.
 */
export const QUALITY_GATE_MIN_SCORE = 60;

/**
 * Score a research brief returned by Orion.
 *
 * @param {object} opts
 * @param {string}   opts.brief        — Full text of Orion's brief
 * @param {object[]} opts.sources      — Array of source objects { title, url, scraped? }
 * @param {string[]} opts.gaps         — Knowledge gaps flagged by Orion
 * @param {object[]} opts.coverStats   — Key statistics extracted by Orion
 * @param {boolean}  opts.mergedWithKB — Whether Synthesizer KB was merged
 * @param {string}   opts.depth        — 'quick' | 'standard' | 'deep'
 *
 * @returns {{
 *   score: number,        // 0-100
 *   grade: string,        // 'A' | 'B' | 'C' | 'D'
 *   gradeLabel: string,   // Human-readable
 *   passed: boolean,      // false = below the 60 gate; do not advance to writing
 *   flags: string[],      // All quality signals (positive, warning, failure)
 *   failures: string[],   // Only the failure reasons (negative flags)
 *   wordCount: number,
 *   sourceCount: number,
 *   scrapedCount: number,
 *   dataPointCount: number,
 *   recommendation: string
 * }}
 */
export function scoreResearchBrief({ brief = '', sources = [], gaps = [], coverStats = [], mergedWithKB = false, depth = 'standard' }) {
  const flags  = [];
  let   score  = 100;

  // ── 1. Source count ───────────────────────────────────────────────────────
  const sourceCount = Array.isArray(sources) ? sources.length : 0;

  if (sourceCount === 0) {
    flags.push('❌ No sources cited — brief is entirely AI-generated with no web grounding');
    score -= 35;
  } else if (sourceCount < 3) {
    flags.push(`⚠️ Thin sourcing — only ${sourceCount} source(s) found`);
    score -= 15;
  } else if (sourceCount >= 5) {
    flags.push(`✅ ${sourceCount} sources cited`);
  } else {
    flags.push(`✅ ${sourceCount} sources cited`);
  }

  // ── 2. Deep-scraped vs snippet-only ──────────────────────────────────────
  const scrapedCount = Array.isArray(sources) ? sources.filter(s => s.scraped).length : 0;

  if (sourceCount > 0 && scrapedCount === 0) {
    flags.push('⚠️ All sources are snippet-level — no full-page content was scraped');
    score -= 10;
  } else if (scrapedCount > 0) {
    flags.push(`✅ ${scrapedCount} source(s) deep-scraped (full content)`);
  }

  // ── 3. Brief word count ───────────────────────────────────────────────────
  const wordCount = brief.split(/\s+/).filter(Boolean).length;

  if (wordCount < 150) {
    flags.push(`❌ Brief is critically short (${wordCount} words) — likely incomplete or failed synthesis`);
    score -= 30;
  } else if (wordCount < 350) {
    flags.push(`⚠️ Brief is thin (${wordCount} words) — may lack depth for quality content`);
    score -= 12;
  } else if (wordCount >= 500) {
    flags.push(`✅ Brief depth: ${wordCount} words`);
  } else {
    flags.push(`✅ Brief depth: ${wordCount} words`);
  }

  // ── 4. Specific data points (numbers, percentages, currency amounts) ──────
  const dataPointMatches = brief.match(
    /\b\d[\d,\.]*\s*(%|percent|billion|million|trillion|\$|₦|£|€|bn|mn|k\b|thousand|hundred)/gi
  ) || [];
  const dataPointCount = dataPointMatches.length;

  if (dataPointCount === 0) {
    flags.push('⚠️ No specific statistics or data points detected — brief is qualitative only');
    score -= 12;
  } else if (dataPointCount >= 3) {
    flags.push(`✅ ${dataPointCount} specific data point(s) found`);
  } else {
    flags.push(`✅ ${dataPointCount} data point(s) — could use more`);
  }

  // ── 5. Knowledge gaps ────────────────────────────────────────────────────
  const gapCount = Array.isArray(gaps) ? gaps.length : 0;

  if (gapCount >= 3) {
    flags.push(`⚠️ ${gapCount} knowledge gaps flagged — significant holes in coverage`);
    score -= gapCount * 4;
  } else if (gapCount > 0) {
    flags.push(`⚠️ ${gapCount} knowledge gap(s) noted`);
    score -= gapCount * 2;
  } else {
    flags.push('✅ No knowledge gaps flagged');
  }

  // ── 6. KB enrichment ─────────────────────────────────────────────────────
  if (mergedWithKB) {
    flags.push('✅ Brief enriched with Synthesizer internal knowledge base');
  } else {
    flags.push('⚠️ Internal KB not merged — brief is web-only');
    score -= 5;
  }

  // ── 7. Depth vs expectation ───────────────────────────────────────────────
  if (depth === 'deep' && scrapedCount < 2) {
    flags.push('⚠️ Deep research requested but Firecrawl returned fewer than 2 scraped pages');
    score -= 8;
  }

  // ── 8. Cover stats presence ───────────────────────────────────────────────
  const statCount = Array.isArray(coverStats) ? coverStats.length : 0;
  if (statCount === 0) {
    flags.push('⚠️ No headline stats extracted — may indicate shallow synthesis');
    score -= 5;
  } else {
    flags.push(`✅ ${statCount} headline stat(s) extracted`);
  }

  // ── Finalise ──────────────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade, gradeLabel, passed, recommendation;

  if (score >= 80) {
    grade = 'A'; gradeLabel = 'Strong'; passed = true;
    recommendation = 'Brief is solid. Present to Boss as-is.';
  } else if (score >= 65) {
    grade = 'B'; gradeLabel = 'Acceptable'; passed = true;
    recommendation = 'Brief has minor gaps. Present to Boss with warnings highlighted.';
  } else if (score >= QUALITY_GATE_MIN_SCORE) {
    grade = 'C'; gradeLabel = 'Weak'; passed = true;
    recommendation = 'Brief meets the minimum quality gate. Present to Boss but recommend a deeper follow-up run.';
  } else {
    grade = 'D'; gradeLabel = 'Poor'; passed = false;
    recommendation = `Brief is below the quality gate (${QUALITY_GATE_MIN_SCORE}/100). Do not advance to writing — retry once at deeper depth, then wait for a human.`;
  }

  // Only the negative signals are "failure reasons"; positive/neutral flags stay
  // informational. These are what get surfaced to Slack and persisted for querying.
  const failures = flags.filter(f => f.startsWith('❌') || f.startsWith('⚠️'));

  return {
    score,
    grade,
    gradeLabel,
    passed,
    flags,
    failures,
    wordCount,
    sourceCount,
    scrapedCount,
    dataPointCount,
    recommendation,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT FOR BOSS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format the quality score into a compact string to append to Boss's research report.
 *
 * @param {object} qScore — return value of scoreResearchBrief()
 * @returns {string}
 */
export function formatQualityBadge(qScore) {
  const emoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴' }[qScore.grade] || '⚪';
  return [
    `${emoji} *Research Quality: ${qScore.grade} — ${qScore.gradeLabel}* (${qScore.score}/100)`,
    qScore.flags.join('\n'),
    qScore.grade === 'C' || qScore.grade === 'D'
      ? `\n💡 *Recommendation:* ${qScore.recommendation}`
      : '',
  ].filter(Boolean).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// FAILED-BRIEF SLACK NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Post a failed research brief to SLACK_OPS_CHANNEL with the grade, the
 * specific failure reasons the scorer produced, and the topic. A failed brief
 * must never fail silently — the notice is always attempted and recorded.
 *
 * @param {object} opts
 * @param {string} opts.topic      — research topic / instruction
 * @param {object} opts.qScore     — return value of scoreResearchBrief()
 * @param {string} [opts.extraReason] — additional failure note (e.g. length rule)
 * @returns {Promise<{ ok: boolean, providerId: string|null, error: string|null }>}
 */
export async function notifyFailedResearchBrief({ topic, qScore, extraReason = null }) {
  const reasons = [
    ...(qScore?.failures || []),
    ...(extraReason ? [extraReason] : []),
  ];

  const text = [
    ':x: *Research brief failed the quality gate*',
    `*Grade:* ${qScore?.grade || '?'} (${qScore?.score ?? '?'}/100)`,
    `*Topic:* ${topic}`,
    reasons.length ? `*Reasons:*\n${reasons.map(r => `• ${r}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  const db = getSupabase();
  const channel = slackChannelFor('ops');
  if (!channel) {
    await recordNotificationAttempt({ db, channel: 'slack', target: '', ok: false, error: 'SLACK_OPS_CHANNEL unset' });
    console.warn('[ResearchGate] Failed-brief Slack notice skipped — SLACK_OPS_CHANNEL unset');
    return { ok: false, providerId: null, error: 'SLACK_OPS_CHANNEL unset' };
  }

  const res = await postSlackMessage({ channel, text });
  await recordNotificationAttempt({ db, channel: 'slack', target: channel, ok: res.ok, providerId: res.providerId, error: res.error });
  if (!res.ok) console.warn('[ResearchGate] Failed-brief Slack notice failed:', res.error);
  return res;
}
