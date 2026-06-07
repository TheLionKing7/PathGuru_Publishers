/**
 * DigiFusion Intelligence Network — Research Quality Gate
 * ========================================================
 * Scores Orion's research brief BEFORE it reaches Nexus or Boss.
 *
 * Why this exists:
 *   Orion can return thin or hallucination-prone briefs when:
 *     - API keys are missing (Perplexity disabled → Tavily only)
 *     - Firecrawl timeouts → all results are snippet-level
 *     - AI synthesis invents statistics not in raw sources
 *     - Brief is too short to be actionable
 *
 * The gate scores the brief and:
 *   - Grade A (80-100) → passes directly to Boss with score attached
 *   - Grade B (65-79)  → passes with warnings flagged
 *   - Grade C (50-64)  → passes but Nexus recommends a re-run
 *   - Grade D (< 50)   → Nexus intercepts, re-runs Orion deeper, does NOT show Boss
 *
 * Called by: Nexus after every Orion research call, before presenting to Boss.
 */

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCORER
// ─────────────────────────────────────────────────────────────────────────────

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
 *   passed: boolean,      // false = Nexus should re-run before showing Boss
 *   flags: string[],      // List of specific quality signals
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
  } else if (score >= 50) {
    grade = 'C'; gradeLabel = 'Weak'; passed = true;
    recommendation = 'Brief is thin. Present to Boss but recommend a deeper follow-up run.';
  } else {
    grade = 'D'; gradeLabel = 'Poor'; passed = false;
    recommendation = 'Brief quality is too low to show Boss. Nexus should re-run Orion at "deep" depth before escalating.';
  }

  return {
    score,
    grade,
    gradeLabel,
    passed,
    flags,
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
