/**
 * Deterministic status lookup for Aether's blog commissions.
 *
 * The content_commission row is the source of truth for the blog pipeline;
 * `draft_review` means the draft is complete and awaiting human review.
 */

import { getSupabase } from '../supabaseClient.js';

const COMMISSION_STATUS = {
  intake: 'commission received',
  assessing: 'source assessment in progress',
  angle_review: 'awaiting approval of the article angle',
  researching: 'research in progress',
  research_review: 'research review',
  synthesising: 'research synthesis in progress',
  drafting: 'Aether is drafting the post',
  draft_review: 'the draft is complete and awaiting review',
  publishing: 'publishing in progress',
  published: 'published',
  abandoned: 'abandoned',
};

/** Match status questions about Aether's blog-writing work, not write requests. */
export function isAetherContentStatusQuery(message) {
  const text = String(message || '').toLowerCase();
  const namesAether = /\b(?:aether|content agent)\b/.test(text);
  const namesContent = /\b(?:blog|post|article|draft)\b/.test(text);
  const asksProgress = /\b(?:status|finish(?:ed)?|done|complete(?:d)?|ready|writing|written|draft(?:ed|ing)?)\b/.test(text);
  return namesAether && namesContent && asksProgress;
}

/** Read and format recent commission stages without an LLM inference step. */
export async function buildAetherContentStatusReply({ db = getSupabase() } = {}) {
  if (!db) return 'Boss, I can’t check Aether’s blog status right now because the database is not configured.';

  const { data, error } = await db.from('content_commission')
    .select('angle, source_note, source_url, status, commissioned_at, published_url, close_reason')
    .order('commissioned_at', { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message || 'commission status lookup failed');

  const commissions = data || [];
  if (!commissions.length) {
    return 'Boss, I couldn’t find a tracked blog commission, so I can’t verify whether Aether has finished that post.';
  }

  const details = commissions.map((commission) => {
    const subject = commission.angle || commission.source_note || commission.source_url || 'Untitled post';
    const stage = COMMISSION_STATUS[commission.status] || `at ${commission.status || 'an unknown stage'}`;
    const outcome = commission.close_reason
      ? ` — issue recorded: ${commission.close_reason}`
      : commission.status === 'published' && commission.published_url
        ? ` — ${commission.published_url}`
        : '';
    return `• “${subject}” — ${stage}${outcome}`;
  });

  const opening = commissions.length === 1
    ? 'Boss, the latest tracked blog commission is:'
    : `Boss, here are the ${commissions.length} latest tracked blog commissions:`;
  return `${opening}\n${details.join('\n')}`;
}