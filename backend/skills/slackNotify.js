/**
 * DigiFusion Intelligence Network — Slack Notify
 * ==============================================
 * Slack is the primary approval and conversation surface. This module owns the
 * bot-token posting path (`chat.postMessage`) and the configuration gate that
 * decides whether Slack is available at all.
 *
 * The old `SLACK_WEBHOOK_URL` incoming-webhook path is retired in favour of the
 * bot token + explicit channels:
 *   SLACK_BOT_TOKEN        — xoxb-… bot token
 *   SLACK_SIGNING_SECRET   — verifies inbound events/interactivity
 *   SLACK_APPROVAL_CHANNEL — where approval requests land
 *   SLACK_OPS_CHANNEL      — where ops alerts / briefings / escalations land
 *
 * A notification attempt is recorded for every delivery so that "sent" is
 * provable and "skipped into the void" cannot happen silently.
 */

import { getSupabase } from '../supabaseClient.js';

export const SLACK_REQUIRED_VARS = [
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'SLACK_APPROVAL_CHANNEL',
  'SLACK_OPS_CHANNEL',
];

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

export function getMissingSlackVars() {
  return SLACK_REQUIRED_VARS.filter((v) => !env(v));
}

export function isSlackConfigured() {
  return getMissingSlackVars().length === 0;
}

export function slackChannelFor(kind) {
  return kind === 'approval' ? env('SLACK_APPROVAL_CHANNEL') : env('SLACK_OPS_CHANNEL');
}

/**
 * Boot-time check. Logs an ERROR for every missing variable (so a misconfigured
 * deploy cannot silently swallow approvals) and returns the config status for
 * the health endpoint.
 */
export function logSlackConfigStatus() {
  const missing = getMissingSlackVars();
  if (missing.length) {
    for (const v of missing) {
      console.error(`[Slack] DISABLED — ${v} unset; approvals will not reach a human`);
    }
  } else {
    console.log('[Slack] enabled — approvals and ops notifications will post to Slack');
  }
  return { configured: missing.length === 0, missing };
}

/**
 * Post a message via the Slack bot (chat.postMessage).
 *
 * @param {object} opts
 * @param {string} opts.channel — channel id or name to post to
 * @param {string} [opts.text]
 * @param {object[]} [opts.blocks]
 * @param {string} [opts.threadTs] — thread timestamp to reply into (threaded message)
 * @returns {Promise<{ ok: boolean, providerId: string|null, error: string|null }>}
 *   ok === true means Slack ACCEPTED the message (not that a human read it).
 */
export async function postSlackMessage({ channel, text, blocks, threadTs }) {
  const token = env('SLACK_BOT_TOKEN');
  if (!token) return { ok: false, providerId: null, error: 'SLACK_BOT_TOKEN unset' };
  if (!channel) return { ok: false, providerId: null, error: 'channel unset' };

  const payload = { channel };
  if (text) payload.text = text;
  if (blocks?.length) payload.blocks = blocks;
  if (threadTs) payload.thread_ts = threadTs;

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      // Never log the token; `data.error` is a stable code like "channel_not_found".
      return { ok: false, providerId: null, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true, providerId: data.ts || null };
  } catch (e) {
    return { ok: false, providerId: null, error: e.message };
  }
}

/**
 * Update an existing Slack message in place via chat.update. Unlike response_url
 * (which expires after 30 minutes or five uses), chat.update works against the
 * card's channel+ts forever — an approval must survive a night's sleep.
 */
export async function slackChatUpdate({ channel, ts, text, blocks }) {
  const token = env('SLACK_BOT_TOKEN');
  if (!token) return { ok: false, providerId: null, error: 'SLACK_BOT_TOKEN unset' };
  if (!channel || !ts) return { ok: false, providerId: null, error: 'channel/ts unset' };

  const payload = { channel, ts };
  if (text) payload.text = text;
  if (blocks?.length) payload.blocks = blocks;

  try {
    const res = await fetch('https://slack.com/api/chat.update', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) return { ok: false, providerId: null, error: data.error || `HTTP ${res.status}` };
    return { ok: true, providerId: data.ts || ts };
  } catch (e) {
    return { ok: false, providerId: null, error: e.message };
  }
}

/**
 * Open a Slack modal via views.open, keyed to the interaction's trigger_id.
 */
export async function slackOpenView({ triggerId, view }) {
  const token = env('SLACK_BOT_TOKEN');
  if (!token) return { ok: false, error: 'SLACK_BOT_TOKEN unset' };
  if (!triggerId) return { ok: false, error: 'trigger_id unset' };

  try {
    const res = await fetch('https://slack.com/api/views.open', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ trigger_id: triggerId, view }),
      signal:  AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Append a row to notification_attempt. Never throws — a failed audit write must
 * not take down the notification it is auditing.
 */
export async function recordNotificationAttempt({ db = getSupabase(), channel, target, ok, providerId = null, error = null, deliveryStatus = null, errorCode = null }) {
  if (!db) return;
  try {
    await db.from('notification_attempt').insert({
      channel,
      target,
      ok,
      provider_id: providerId,
      error,
      delivery_status: deliveryStatus,
      error_code: errorCode,
    });
  } catch (e) {
    console.warn('[Slack] failed to record notification attempt:', e.message);
  }
}
