/**
 * Blog approval execution — Nexus → Orion → Boss YES → Aether → live publish
 */

import { aether } from '../agents/aether.js';
import { generateAndPublishBlogPost, DEFAULT_BLOG_AUTHOR } from '../blogPublisher.js';
import { resolveContentAuthor } from './contentAuthorRegistry.js';
import { loadContentAuthorSettings } from './contentAuthorSettings.js';
import { getSupabase } from '../supabaseClient.js';
import { postSlackMessage, recordNotificationAttempt, slackChannelFor } from './slackNotify.js';

const APPROVAL_TASK_TYPE = 'pending_approval';

function safeJson(value) {
  if (value == null) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

/**
 * Persist a publish transition onto the approval task so the journal always
 * shows publishing → published | publish_failed. Never leaves "approved and
 * nothing happened".
 */
async function updateApprovalPublishState(approvalId, patch) {
  const db = getSupabase();
  if (!db || !approvalId) return null;

  try {
    const { data } = await db
      .from('tasks')
      .select('output')
      .eq('id', approvalId)
      .eq('type', APPROVAL_TASK_TYPE)
      .maybeSingle();

    const prev = safeJson(data?.output);
    const output = { ...prev, ...patch, publishUpdatedAt: new Date().toISOString() };

    await db.from('tasks')
      .update({ output, updated_at: new Date().toISOString() })
      .eq('id', approvalId);

    return output;
  } catch (e) {
    console.warn('[BlogApprovalFlow] failed to record publish state:', e.message);
    return null;
  }
}

/** Post the publish outcome to SLACK_OPS_CHANNEL — never silent either way. */
async function notifyPublishOutcome({ subject, ok, url, error }) {
  const channel = slackChannelFor('ops');
  const text = ok
    ? `:white_check_mark: *Blog published after approval*\n*Post:* ${subject}\n*URL:* ${url || '(no url returned)'}`
    : `:x: *Blog publish failed after approval*\n*Post:* ${subject}\n*Error:* ${error || 'unknown error'}`;

  const db = getSupabase();
  if (!channel) {
    await recordNotificationAttempt({ db, channel: 'slack', target: '', ok: false, error: 'SLACK_OPS_CHANNEL unset' });
    console.warn('[BlogApprovalFlow] Slack ops notice skipped — SLACK_OPS_CHANNEL unset');
    return { ok: false, providerId: null, error: 'SLACK_OPS_CHANNEL unset' };
  }

  const res = await postSlackMessage({ channel, text });
  await recordNotificationAttempt({ db, channel: 'slack', target: channel, ok: res.ok, providerId: res.providerId, error: res.error });
  if (!res.ok) console.warn('[BlogApprovalFlow] Slack ops notice failed:', res.error);
  return res;
}

/**
 * After Boss approves via WhatsApp, write and publish the blog to DigiFusion CMS.
 *
 * @param {object} payload — stored on approval task (from Nexus orchestrate blog step)
 */
export async function executeApprovedBlogPublish(payload = {}) {
  const topic = (payload.proposedTitle || payload.topic || '').trim();
  if (!topic) throw new Error('Approved blog payload missing topic / proposedTitle');

  const researchBrief = payload.researchBrief || '';
  const caveats = Array.isArray(payload.bossCaveats) ? payload.bossCaveats : [];
  const caveatBlock = caveats.length
    ? `BOSS APPROVAL CAVEATS (mandatory — apply exactly):\n${caveats.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    : '';

  const rawContent = await aether.produceContent('blog post', topic, {
    audience:       payload.audience || 'business professionals',
    voiceNotes:     [payload.recommendedTone || payload.tone || '', caveatBlock].filter(Boolean).join('\n'),
    callToAction:     payload.ctaGoal || 'Book a free strategy session at digitafusion.com/agency/booking',
    wordCount:        payload.estimatedWordCount || payload.wordCount || 1400,
    stdcStage:        'THINK — consideration and authority-building',
    researchBrief,
    frameworkId:    payload.frameworkId || 'c2c',
    bossCaveats:    caveats,
    outline:        payload.outline || [],
    proposedTitle:  payload.proposedTitle || topic,
  });

  const siteUrl = (process.env.DIGIFUSION_API_URL || 'https://www.digitafusion.com').replace(/\/$/, '');

  const authorSettings = await loadContentAuthorSettings().catch(() => ({}));
  const resolvedAuthor = resolveContentAuthor({
    topic,
    niche:         payload.niche || payload.sector,
    domain:        payload.contentDomain || payload.domain,
    category:      payload.category,
    authorId:      payload.authorId,
    domainAuthors: authorSettings.domainAuthors,
  });

  const result = await generateAndPublishBlogPost({
    topic,
    slug:           payload.slug,
    audience:       payload.audience,
    tone:           payload.recommendedTone || payload.tone || 'authoritative yet accessible',
    seoKeyword:     payload.seoKeyword || topic,
    niche:          payload.niche || payload.sector || resolvedAuthor.contentDomain,
    ctaGoal:        payload.ctaGoal,
    aetherContent:  rawContent,
    researchBrief,
    postType:       payload.postType || 'article',
    author:         payload.author || payload.recommendedAuthor || resolvedAuthor.byline || DEFAULT_BLOG_AUTHOR,
    platforms: [{
      type:    'digifusion',
      status:  'published',
      siteUrl,
    }],
  });

  const slug = result?.publishResults?.[0]?.slug
    || result?.post?.slug
    || result?.dbResult?.slug
    || '';
  const url  = result?.publishResults?.[0]?.url
    || (slug ? `${siteUrl}/blog/${slug}` : null);

  return { ...result, slug, url, topic };
}

/**
 * The observable approval → publish transition. Marks the approval `publishing`,
 * attempts the publish, then records `published` (with URL) or `publish_failed`
 * (with error) on the approval task and posts the outcome to SLACK_OPS_CHANNEL.
 *
 * @param {object} approval — { approvalId, decision, approvalType, payload, subject, feedback, caveats }
 * @returns {Promise<{ state: 'published'|'publish_failed', url?: string, slug?: string, topic?: string, error?: string }>}
 */
export async function runApprovedBlogPublish(approval) {
  const approvalId = approval?.approvalId;
  const payload    = approval?.payload || {};
  const subject    = approval?.subject || payload?.proposedTitle || payload?.topic || 'Blog post';

  await updateApprovalPublishState(approvalId, {
    publishState:      'publishing',
    publishAttemptedAt: new Date().toISOString(),
  });

  try {
    const result = await executeApprovedBlogPublish(payload);
    const url  = result?.url || '';
    const slug = result?.slug || '';

    await updateApprovalPublishState(approvalId, {
      publishState: 'published',
      publishedUrl: url,
      slug,
      publishedAt: new Date().toISOString(),
    });
    await notifyPublishOutcome({ subject, ok: true, url });

    return { state: 'published', url, slug, topic: result?.topic || subject };
  } catch (e) {
    const error = e?.message || String(e);

    await updateApprovalPublishState(approvalId, {
      publishState:   'publish_failed',
      publishError:   error,
      publishFailedAt: new Date().toISOString(),
    });
    await notifyPublishOutcome({ subject, ok: false, error });

    return { state: 'publish_failed', error, topic: subject };
  }
}
