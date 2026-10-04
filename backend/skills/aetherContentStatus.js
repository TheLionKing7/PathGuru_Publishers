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
  'aether', 'commission', 'content', 'agent', 'nexus', 'writing', 'write', 'finished', 'complete', 'completed',
  'about', 'ask', 'asked', 'any', 'article', 'drafting', 'get', 'give', 'have', 'into', 'it',
  'make', 'me', 'need', 'of', 'please', 'prepare', 'requested', 'share', 'to', 'want', 'with', 'brief',
]);

const FOLLOW_UP_QUERY = /^(?:(?:hey|hi)\s+)?(?:any\s+)?(?:update|updates|progress|news|movement|word|status|eta|more)(?:\s+(?:on it|on this|there|yet|please))?[?.!\s]*$/i;
const CONTENT_REFERENCE = /\b(?:aether|blog|post|article|draft|commission)\b/i;

function extractCommissionTopic(message) {
  const words = String(message || '').match(/[\p{L}\p{N}]+/gu) || [];
  const topicWords = words.filter((word) => !TOPIC_STOP_WORDS.has(word.toLowerCase()));
  return topicWords.length ? topicWords.join(' ') : null;
}

function isDirectAetherContentStatusQuery(message) {
  const text = String(message || '').toLowerCase();
  const namesContent = /\b(?:aether|blog|post|article|draft|commission)\b/.test(text);
  const asksProgress = /\b(?:status|finish(?:ed)?|done|complete(?:d)?|ready|writing|written|draft(?:ed|ing)?|current|work|working|progress|visibility|update|latest|stuck|underway)\b/.test(text);
  return namesContent && asksProgress;
}

/** Resolve an elliptical follow-up only from the immediately active user topic. */
export function resolveAetherContentStatusRequest(message, history = []) {
  const text = String(message || '').trim();
  if (isDirectAetherContentStatusQuery(text)) return text;
  if (!FOLLOW_UP_QUERY.test(text)) return null;

  for (const turn of [...history].slice(-10).reverse()) {
    if (turn?.role !== 'user') continue;
    const priorText = String(turn.content || turn.text || '').trim();
    if (!priorText) continue;
    if (isDirectAetherContentStatusQuery(priorText) || CONTENT_REFERENCE.test(priorText)) {
      return priorText;
    }
    // A chain of short follow-ups may refer to the same subject. An unrelated
    // intervening user message ends that context rather than reviving a stale one.
    if (FOLLOW_UP_QUERY.test(priorText)) continue;
    return null;
  }
  return null;
}

/** Match explicit status questions and short follow-ups with relevant thread context. */
export function isAetherContentStatusQuery(message, history = []) {
  return resolveAetherContentStatusRequest(message, history) !== null;
}

function findMatchingCommissions(commissions, topic) {
  const topicWords = (topic.match(/[\p{L}\p{N}]+/gu) || [])
    .map((word) => word.toLowerCase())
    .filter((word) => !TOPIC_STOP_WORDS.has(word));
  if (!topicWords.length) return commissions;

  const matches = commissions.map((commission) => {
    const subject = [commission.angle, commission.source_note, commission.source_url]
      .filter(Boolean)
      .join(' ');
    const subjectWords = new Set((subject.match(/[\p{L}\p{N}]+/gu) || []).map((word) => word.toLowerCase()));
    const overlap = topicWords.filter((word) => subjectWords.has(word)).length;
    return { commission, overlap, ratio: overlap / topicWords.length };
  }).filter(({ overlap, ratio }) => overlap > 0 && (topicWords.length === 1 || ratio >= 0.6));

  if (!matches.length) return [];
  const bestOverlap = Math.max(...matches.map(({ overlap }) => overlap));
  const bestRatio = Math.max(...matches.filter(({ overlap }) => overlap === bestOverlap).map(({ ratio }) => ratio));
  return matches
    .filter(({ overlap, ratio }) => overlap === bestOverlap && ratio === bestRatio)
    .map(({ commission }) => commission);
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
  const commissions = topic ? findMatchingCommissions(trackedCommissions, topic) : trackedCommissions;
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