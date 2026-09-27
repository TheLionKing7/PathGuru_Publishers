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

const TOPIC_STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'article', 'blog', 'boss', 'can', 'current', 'currently',
  'did', 'do', 'does', 'doing', 'don', 'done', 'draft', 'finished', 'for', 'from', 'has', 'have',
  'hey', 'how', 'i', 'into', 'is', 'latest', 'me', 'my', 'of', 'on', 'or', 'our', 'please',
  'post', 'progress', 'pull', 'reference', 's', 'share', 'so', 'status', 't', 'task', 'the', 'their', 'this', 'update', 'visibility',
  'was', 'what', 'when', 'where', 'who', 'with', 'work', 'working', 'written', 'you', 'brief',
  'aether', 'content', 'agent', 'nexus', 'writing', 'write', 'finished', 'complete', 'completed',
]);

function extractCommissionTopic(message) {
  const words = String(message || '').match(/[\p{L}\p{N}]+/gu) || [];
  const topicWords = words.filter((word) => !TOPIC_STOP_WORDS.has(word.toLowerCase()));
  return topicWords.length ? topicWords.join(' ') : null;
}

/** Match status questions about Aether's blog-writing work, not write requests. */
export function isAetherContentStatusQuery(message) {
  const text = String(message || '').toLowerCase();
  const namesAether = /\b(?:aether|content agent)\b/.test(text);
  const namesContent = /\b(?:blog|post|article|draft)\b/.test(text);
  const asksProgress = /\b(?:status|finish(?:ed)?|done|complete(?:d)?|ready|writing|written|draft(?:ed|ing)?|current|work|working|progress|visibility|update|latest|stuck|underway)\b/.test(text);
  return namesAether && namesContent && asksProgress;
}

/** Read and format a matching commission, or recent commissions, without an LLM. */
export async function buildAetherContentStatusReply({ db = getSupabase(), message = '' } = {}) {
  if (!db) return 'Boss, I can’t check Aether’s blog status right now because the database is not configured.';

  const topic = extractCommissionTopic(message);
  const { data, error } = await db.from('content_commission')
    .select('angle, source_note, source_url, status, commissioned_at, published_url, close_reason')
    .order('commissioned_at', { ascending: false })
    .limit(topic ? 50 : 5);

  if (error) throw new Error(error.message || 'commission status lookup failed');

  const trackedCommissions = data || [];
  const commissions = topic
    ? trackedCommissions.filter((commission) => {
        const subject = [commission.angle, commission.source_note, commission.source_url]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return subject.includes(topic.toLowerCase());
      })
    : trackedCommissions;
  if (!commissions.length) {
    if (topic) {
      return `Boss, I couldn’t find a tracked blog commission matching “${topic}”, so I can’t verify its progress. I checked the latest commission records; I won’t substitute an unrelated post.`;
    }
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