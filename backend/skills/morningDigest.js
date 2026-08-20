/**
 * DigiFusion Intelligence Network — Morning ops digest
 * ======================================================
 * One message to SLACK_OPS_CHANNEL every morning at 07:00 WAT:
 *   emails sent in the last 24h (recipients), pending approvals + wait time,
 *   commissions in flight + stage, webhook_queue counts by kind/status, anything
 *   in failed / send_failed / publish_failed, and whether the estate is paused.
 *
 * Kept to one message; when nothing happened it is a single "all quiet" line —
 * a digest that is long when nothing happened stops being read, and then it
 * protects nothing.
 */

import { getSupabase } from '../supabaseClient.js';
import { postSlackMessage, recordNotificationAttempt, slackChannelFor } from './slackNotify.js';
import { isPaused } from './systemFlags.js';
import { ACTIVE_STATUSES } from './contentCommission.js';

const WAT = 'Africa/Lagos';

function waitLabel(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}d${h % 24}h`;
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, Math.floor(ms / 60000))}m`;
}

function approvalSubject(a) {
  const input = typeof a.input === 'string' ? JSON.parse(a.input || '{}') : (a.input || {});
  return input.subject || a.title || '—';
}

function clock(iso) {
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: WAT }); }
  catch { return ''; }
}

export async function buildMorningDigest({ db = getSupabase(), now = new Date() } = {}) {
  const since = new Date(now.getTime() - 24 * 3600000).toISOString();
  const header = `:newspaper: *Morning digest — ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: WAT })}*`;
  const lines = [];
  let quiet = true;

  // ── Emails sent in the last 24h (with recipients) ──
  let emails = [];
  if (db) {
    const { data } = await db.from('outbound_send_log')
      .select('to_addr, sent_at')
      .gte('sent_at', since)
      .order('sent_at', { ascending: true })
      .limit(50);
    emails = data || [];
  }
  if (emails.length) {
    quiet = false;
    lines.push('*Emails sent (24h)*', ...emails.map((e) => `• ${e.to_addr}${e.sent_at ? ` (${clock(e.sent_at)})` : ''}`));
  }

  // ── Pending approvals + how long each has waited ──
  let approvals = [];
  if (db) {
    const { data } = await db.from('tasks')
      .select('title, input, created_at')
      .eq('type', 'pending_approval')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(20);
    approvals = data || [];
  }
  if (approvals.length) {
    quiet = false;
    lines.push(`*Approvals pending (${approvals.length})*`, ...approvals.map((a) => `• ${approvalSubject(a)} — ${waitLabel(a.created_at)}`));
  }

  // ── Commissions in flight + stage ──
  let commissions = [];
  if (db) {
    const { data } = await db.from('content_commission')
      .select('angle, source_note, source_url, status, research_grade')
      .in('status', ACTIVE_STATUSES)
      .order('commissioned_at', { ascending: true });
    commissions = data || [];
  }
  if (commissions.length) {
    quiet = false;
    lines.push(
      `*Commissions in flight (${commissions.length})*`,
      ...commissions.map((c) => `• ${c.angle || c.source_note || c.source_url || '—'} — ${c.status}${c.research_grade != null ? ` (grade ${c.research_grade})` : ''}`),
    );
  }

  // ── webhook_queue counts by kind + status (non-done rows) ──
  let queue = [];
  if (db) {
    const { data } = await db.from('webhook_queue').select('kind, status').neq('status', 'done').limit(1000);
    const byKind = {};
    for (const r of (data || [])) {
      byKind[r.kind] = byKind[r.kind] || {};
      byKind[r.kind][r.status] = (byKind[r.kind][r.status] || 0) + 1;
    }
    queue = Object.entries(byKind);
  }
  if (queue.length) {
    quiet = false;
    lines.push('*Queue*', ...queue.map(([kind, statuses]) => `• ${kind}: ${Object.entries(statuses).map(([s, n]) => `${n} ${s}`).join(', ')}`));
  }

  // ── failed / send_failed / publish_failed ──
  const failures = [];
  if (db) {
    const { data: failedTasks } = await db.from('tasks').select('title').eq('status', 'failed').limit(10);
    if (failedTasks?.length) failures.push(`failed: ${failedTasks.map((t) => String(t.title).slice(0, 40)).join(', ')}`);

    const { data: sendFailed } = await db.from('inbound_message').select('to_addr').eq('status', 'send_failed').limit(10);
    if (sendFailed?.length) failures.push(`send_failed: ${sendFailed.map((r) => r.to_addr).join(', ')}`);

    const { data: publishFailed } = await db.from('tasks')
      .select('title')
      .eq('type', 'pending_approval')
      .eq('output->publishState', 'publish_failed')
      .limit(10);
    if (publishFailed?.length) failures.push(`publish_failed: ${publishFailed.map((t) => String(t.title).slice(0, 40)).join(', ')}`);
  }
  if (failures.length) {
    quiet = false;
    lines.push('*Failures*', ...failures.map((f) => `• ${f}`));
  }

  // ── Paused ──
  const paused = await isPaused({ db });
  if (paused) {
    quiet = false;
    lines.push(':red_circle: *PAUSED*');
  }

  const text = quiet ? `${header}\nAll quiet.` : [header, ...lines].join('\n');
  return { text, quiet, paused };
}

/** Build + post the digest to SLACK_OPS_CHANNEL. */
export async function postMorningDigest() {
  const channel = slackChannelFor('ops');
  if (!channel) {
    console.warn('[MorningDigest] SLACK_OPS_CHANNEL unset — digest skipped');
    return { ok: false, error: 'SLACK_OPS_CHANNEL unset' };
  }
  const { text, quiet } = await buildMorningDigest();
  const res = await postSlackMessage({ channel, text });
  await recordNotificationAttempt({ db: getSupabase(), channel: 'slack', target: channel, ok: res.ok, providerId: res.providerId, error: res.error });
  if (!res.ok) console.warn('[MorningDigest] Slack post failed:', res.error);
  return { ok: res.ok, quiet, error: res.error };
}

