/**
 * DigiFusion Intelligence Network — Content Commission (Slack entry points)
 * =========================================================================
 * Slash command `/commission <url> <note>` and app-mention-with-a-link both
 * open a content_commission at intake, reply in the thread/channel confirming
 * what was received, then kick off Nexus's assessment in the background.
 * A later human reply in that same thread is Gate 1 (choose/refine/abandon).
 */

import { getSupabase } from '../supabaseClient.js';
import { postSlackMessage } from './slackNotify.js';
import {
  createContentCommission,
  updateContentCommission,
  assessContentCommission,
  resolveAngleReply,
  parseCommissionText,
  assertCommissionCapacity,
} from './contentCommission.js';

function triggerAssessment(id) {
  assessContentCommission({ id }).catch((e) => {
    console.error('[ContentCommission] assessment failed:', e.message);
  });
}

/**
 * `/commission <url> <optional note>` slash command. Posts the confirmation to
 * the channel, uses that message as the thread root, and starts assessment.
 */
export async function handleCommissionSlashCommand(form) {
  const db = getSupabase();
  const channel = String(form.channel_id || '').trim();
  const { url, note } = parseCommissionText(form.text || '');

  if (!db) return { ok: false, error: 'Supabase not configured' };
  if (!channel) return { ok: false, error: 'missing channel_id' };

  if (!url) {
    await postSlackMessage({ channel, text: ':warning: I need a URL to read. Try: `/commission <url> <note>`.' });
    return { ok: false, error: 'no url in command' };
  }

  const capacity = await assertCommissionCapacity({ db });
  if (!capacity.ok) {
    const names = capacity.inFlight.map((c) => `• ${c.label} (${c.status})`).join('\n');
    await postSlackMessage({ channel, text: `:no_entry: *Commission refused* — ${capacity.count} already in flight:\n${names}` });
    return { ok: false, atCapacity: true, inFlight: capacity.inFlight };
  }

  const created = await createContentCommission({
    sourceUrl: url,
    sourceNote: note,
    commissionedBy: String(form.user_id || '').trim() || null,
    slackChannel: channel,
    slackThreadTs: null,
    mirror: false,
    db,
  });
  if (!created.ok) return created;

  const confirm = await postSlackMessage({
    channel,
    text: `:memo: *Commission received*\n*Source:* ${url}${note ? `\n*Note:* ${note}` : ''}\nAssessing…`,
  });

  if (confirm.providerId) {
    await updateContentCommission({ id: created.commission.id, fields: { slack_thread_ts: confirm.providerId }, db });
  }

  triggerAssessment(created.commission.id);
  return { ok: true, commission: created.commission };
}

/** App mention in a thread with a link → intake + reply in-thread. */
export async function handleCommissionAppMention(event) {
  const db = getSupabase();
  const channel = String(event.channel || '').trim();
  const threadTs = String(event.thread_ts || event.ts || '').trim();
  const { url, note } = parseCommissionText(event.text || '');

  if (!db) return { ok: false, error: 'Supabase not configured' };
  if (!channel || !threadTs) return { ok: false, error: 'missing channel/thread' };

  if (!url) {
    await postSlackMessage({ channel, threadTs, text: ':warning: I need a link to read — mention me in a thread with a URL and I\'ll assess it.' });
    return { ok: false, error: 'no url in mention' };
  }

  const capacity = await assertCommissionCapacity({ db });
  if (!capacity.ok) {
    const names = capacity.inFlight.map((c) => `• ${c.label} (${c.status})`).join('\n');
    await postSlackMessage({ channel, threadTs, text: `:no_entry: *Commission refused* — ${capacity.count} already in flight:\n${names}` });
    return { ok: false, atCapacity: true, inFlight: capacity.inFlight };
  }

  const created = await createContentCommission({
    sourceUrl: url,
    sourceNote: note,
    commissionedBy: String(event.user || '').trim() || null,
    slackChannel: channel,
    slackThreadTs: threadTs,
    mirror: false,
    db,
  });
  if (!created.ok) return created;

  await postSlackMessage({
    channel, threadTs,
    text: `:memo: *Commission received*\n*Source:* ${url}${note ? `\n*Note:* ${note}` : ''}\nAssessing…`,
  });

  triggerAssessment(created.commission.id);
  return { ok: true, commission: created.commission };
}

/**
 * A human reply in a commission thread is Gate 1 (choose/refine/abandon the
 * angle). Returns true when the reply resolved a commission.
 */
export async function handleCommissionThreadReply(event) {
  const db = getSupabase();
  if (!db) return false;

  if (event.bot_id || event.subtype) return false;
  const channel = String(event.channel || '').trim();
  const threadTs = String(event.thread_ts || '').trim();
  if (!channel || !threadTs) return false;

  const { data: commission } = await db.from('content_commission')
    .select('*')
    .eq('slack_channel', channel)
    .eq('slack_thread_ts', threadTs)
    .eq('status', 'angle_review')
    .maybeSingle();

  if (!commission) return false;

  await resolveAngleReply({ id: commission.id, text: event.text || '', db });
  return true;
}
