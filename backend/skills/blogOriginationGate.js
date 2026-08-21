/**
 * DigiFusion Intelligence Network — Blog origination gate
 * =======================================================
 * The single guard that decides whether a blog may be originated. `orchestrate()`
 * with `nextStep: 'blog'` must name a `content_commission` that has cleared the
 * angle gate (angle_approved_at set) and is at or past `researching`. Anything
 * else is refused, loudly — logged, thrown, and posted to SLACK_OPS_CHANNEL.
 *
 * One door: this check closes every path to blog origination at once, instead of
 * guarding each surface (the generic agent-run route, orchestrate, etc.).
 */

import { getSupabase } from '../supabaseClient.js';
import { postSlackMessage, slackChannelFor, recordNotificationAttempt } from './slackNotify.js';
import { CONTENT_COMMISSION_STATUSES } from './contentCommission.js';

const RESEARCHING_INDEX = CONTENT_COMMISSION_STATUSES.indexOf('researching');

export const BLOG_ORIGINATION_REFUSED = 'blog origination refused: no approved commission';

/**
 * Assert that `commissionId` names a commission allowed to originate a blog.
 * Resolves to `{ ok: true, commission }` when allowed; throws otherwise.
 *
 * @param {string|null} commissionId
 * @param {object} [db] — supabase client (defaults to getSupabase())
 * @param {string} [topic] — used only in the Slack refusal notice
 */
export async function assertBlogCommissionApproved(commissionId, db = getSupabase(), topic = '') {
  const refuse = async (reason) => {
    console.error(`[Nexus] ${BLOG_ORIGINATION_REFUSED}`, reason);
    const channel = slackChannelFor('ops');
    if (channel) {
      const res = await postSlackMessage({
        channel,
        text: `:no_entry: *Blog origination refused* — no approved commission\n*Reason:* ${reason}${topic ? `\n*Topic:* ${String(topic).slice(0, 120)}` : ''}`,
      });
      await recordNotificationAttempt({ db, channel: 'slack', target: channel, ok: res.ok, providerId: res.providerId, error: res.error });
    }
    throw new Error(`${BLOG_ORIGINATION_REFUSED} (${reason})`);
  };

  if (!commissionId) return refuse('commissionId missing');
  if (!db) return refuse('database unavailable');

  let commission = null;
  try {
    const { data } = await db.from('content_commission').select('status, angle_approved_at').eq('id', commissionId).maybeSingle();
    commission = data || null;
  } catch (e) {
    return refuse(`commission lookup failed: ${e.message}`);
  }

  if (!commission) return refuse(`commission ${commissionId} not found`);

  const statusIndex = CONTENT_COMMISSION_STATUSES.indexOf(commission.status);
  if (statusIndex < RESEARCHING_INDEX) {
    return refuse(`commission ${commissionId} not past researching (status: ${commission.status || 'missing'})`);
  }
  if (!commission.angle_approved_at) {
    return refuse(`commission ${commissionId} has no approved angle`);
  }

  return { ok: true, commission };
}
