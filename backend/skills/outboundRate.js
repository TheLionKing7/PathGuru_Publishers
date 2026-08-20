/**
 * DigiFusion Intelligence Network — Outbound Rate Cap
 * ====================================================
 * Defence in depth on top of the 0031 atomic claim. No matter how many approved
 * drafts exist for a prospect, a given normalised recipient may receive at most
 * one email per 24 hours.
 *
 * The cap is a constant, not an env var — deliberately. Raising it should
 * require a code change and a moment's thought, not a flip of a dashboard knob.
 *
 * `toAddr` is always the canonical recipient: already extracted from any
 * "Name <addr>" wrapper and lowercased by the caller.
 */

import { postSlackMessage, recordNotificationAttempt, slackChannelFor } from './slackNotify.js';

export const MAX_SENDS_PER_RECIPIENT_PER_DAY = 1;

const WINDOW_MS = 24 * 60 * 60 * 1000;

function windowStart(now = Date.now()) {
  return new Date(now - WINDOW_MS).toISOString();
}

/**
 * How many emails the recipient has already been sent in the last 24 hours.
 * @param {object} db     — Supabase client
 * @param {string} toAddr — canonical (normalised + lowercased) recipient
 */
export async function countRecipientSends(db, toAddr, now = Date.now()) {
  const { data, error } = await db
    .from('outbound_send_log')
    .select('id')
    .eq('to_addr', toAddr)
    .gte('sent_at', windowStart(now));
  if (error) throw new Error(error.message);
  return (data || []).length;
}

/**
 * Record a confirmed send so the next 24h hand-out to the same recipient is
 * refused. Called from both confirmation paths (Make's /outbound/:id/sent and
 * the webhook-queue outbound_sent handler).
 */
export async function recordSend(db, { toAddr, inboundMessageId }) {
  const { error } = await db.from('outbound_send_log').insert({
    to_addr:            toAddr,
    inbound_message_id: inboundMessageId || null,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

/**
 * Mark a claimed draft send_blocked, log the refusal, and raise a Slack notice.
 * A blocked send must never fail silently — the notice is always attempted and
 * any failure (or a missing webhook) is logged loudly.
 */
export async function blockOutboundDraft(db, draft, { toAddr = null, reason = 'rate cap' } = {}) {
  const { error } = await db.from('inbound_message')
    .update({ status: 'send_blocked', send_claimed_at: null, updated_at: new Date().toISOString() })
    .eq('id', draft.id);
  if (error) {
    console.warn(`[Outbound] failed to mark ${draft.id} send_blocked:`, error.message);
  }

  if (reason === 'rate cap') {
    console.log(`[Outbound] rate cap: ${toAddr} already received mail in the last 24h`);
  } else {
    console.log(`[Outbound] send_blocked: ${draft.id} (${reason})`);
  }

  await raiseBlockedSendNotice({ db, toAddr, inboundMessageId: draft.id, reason });
}

async function raiseBlockedSendNotice({ db, toAddr, inboundMessageId, reason }) {
  const text = reason === 'rate cap'
    ? `:no_entry: *Outbound blocked* — ${toAddr} already received mail in the last 24h (inbound_message ${String(inboundMessageId).slice(0, 8)}).`
    : `:warning: *Outbound blocked* — inbound_message ${String(inboundMessageId).slice(0, 8)} (${reason}).`;

  const channel = slackChannelFor('ops');
  if (!channel) {
    await recordNotificationAttempt({ db, channel: 'slack', target: '', ok: false, error: 'SLACK_OPS_CHANNEL unset' });
    console.warn('[Outbound] blocked-send Slack notice skipped — SLACK_OPS_CHANNEL unset');
    return;
  }

  const res = await postSlackMessage({ channel, text });
  await recordNotificationAttempt({ db, channel: 'slack', target: channel, ok: res.ok, providerId: res.providerId, error: res.error });
  if (!res.ok) console.warn('[Outbound] blocked-send Slack notice failed:', res.error);
}
