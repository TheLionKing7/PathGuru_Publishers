/**
 * DigiFusion Intelligence Network — WhatsApp status callback
 * ============================================================
 * Twilio posts delivery-status changes (sent → delivered → read, or
 * undelivered/failed) to the StatusCallback URL we registered at send time.
 * The Cloudflare Worker verifies + queues them (kind `whatsapp_status`); the
 * backend drains them and this handler records the outcome on
 * notification_attempt.
 *
 * undelivered/failed are delivery failures: we update the attempt row and fall
 * back to Slack, naming Twilio's error code in plain words.
 */

import { getSupabase } from '../supabaseClient.js';
import { postSlackMessage, recordNotificationAttempt, slackChannelFor } from './slackNotify.js';

const FAILED_STATUSES = new Set(['undelivered', 'failed']);

/** Human explanation for the Twilio error codes that matter to operations. */
export function describeTwilioError(code) {
  const c = String(code || '').trim();
  if (!c) return 'no error code provided';
  const map = {
    '63016': 'outside the allowed freeform window — the sandbox session has expired; the recipient must send a message first to re-open it',
    '63007': 'the From number is not an active WhatsApp sender (check TWILIO_WHATSAPP_FROM)',
    '63003': 'channel unavailable — the WhatsApp channel is not active',
  };
  return map[c] || `Twilio error ${c}`;
}

/**
 * @param {object} form — decoded Twilio status callback params
 * @param {string} [form.MessageSid]  — WhatsApp message id
 * @param {string} [form.SmsSid]      — SMS message id (unused for WhatsApp, kept as fallback)
 * @param {string} [form.MessageStatus] — sent|delivered|read|undelivered|failed
 * @param {string} [form.ErrorCode]
 * @param {string} [form.To]
 */
export async function handleWhatsAppStatusCallback(form, db = getSupabase()) {
  const sid       = String(form.MessageSid || form.SmsSid || '').trim();
  const status    = String(form.MessageStatus || '').trim().toLowerCase();
  const errorCode = String(form.ErrorCode || '').trim();
  const to        = String(form.To || '').replace(/^whatsapp:/, '').trim();

  if (!sid) {
    console.warn('[WhatsAppStatus] callback missing MessageSid — nothing to correlate');
    return { ok: true, matched: 0, failed: false };
  }

  if (!db) {
    console.warn('[WhatsAppStatus] Supabase not configured — cannot record delivery status');
    return { ok: false, matched: 0, failed: false };
  }

  // Record delivered/undelivered/failed + error code on the matching attempt.
  const { data: matched, error } = await db
    .from('notification_attempt')
    .update({
      delivery_status: status || null,
      error_code:      errorCode || null,
    })
    .eq('provider_id', sid)
    .eq('channel', 'whatsapp')
    .select('id, target, ok');

  if (error) {
    console.warn('[WhatsAppStatus] failed to update attempt:', error.message);
  }

  const failed = FAILED_STATUSES.has(status);
  if (!failed) {
    return { ok: true, matched: matched?.length || 0, failed: false };
  }

  // Delivery failed — fall back to Slack and name the error code.
  const channel = slackChannelFor('ops');
  const text = [
    ':warning: *WhatsApp delivery failed*',
    `*Status:* ${status}`,
    `*To:* ${to || matched?.[0]?.target || 'unknown'}`,
    `*Message SID:* ${sid.slice(0, 16)}…`,
    `*Error:* ${errorCode ? `${errorCode} — ${describeTwilioError(errorCode)}` : '(no error code)'}`,
  ].filter(Boolean).join('\n');

  if (channel) {
    const res = await postSlackMessage({ channel, text });
    await recordNotificationAttempt({ db, channel: 'slack', target: channel, ok: res.ok, providerId: res.providerId, error: res.error });
    if (!res.ok) console.warn('[WhatsAppStatus] Slack fallback notice failed:', res.error);
  } else {
    await recordNotificationAttempt({ db, channel: 'slack', target: '', ok: false, error: 'SLACK_OPS_CHANNEL unset' });
    console.warn('[WhatsAppStatus] Slack fallback skipped — SLACK_OPS_CHANNEL unset');
  }

  return { ok: true, matched: matched?.length || 0, failed: true };
}
