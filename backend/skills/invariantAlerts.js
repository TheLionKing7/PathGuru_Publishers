/**
 * DigiFusion Intelligence Network — Invariant alerts
 * ===================================================
 * These are invariants, not metrics: each one means something is broken right
 * now. They re-alert only when the set of affected identifiers changes, so the
 * same condition does not nag every hour.
 *
 *   1. a webhook_queue row pending >10 minutes
 *   2. any webhook_queue row in failed
 *   3. the drain has not been authorised in 15 minutes
 *   4. an approval pending >24 hours
 *   5. a send refused by the rate cap
 *   6. a publish failed
 *
 * When the estate is paused, `queue_pending` is a *normal* consequence (the
 * queue keeps accepting but the drain stops dispatching), so it is suppressed
 * and replaced by a single 6-hourly "System paused — N rows held in queue"
 * notice. The last-alerted identifier set for each invariant lives in
 * public.invariant_state so it survives the free-tier sleep.
 */

import { getSupabase } from '../supabaseClient.js';
import { isPaused } from './systemFlags.js';
import { postSlackMessage, recordNotificationAttempt, slackChannelFor } from './slackNotify.js';

const PENDING_STUCK_MS   = 10 * 60 * 1000;   // 10 minutes
const DRAIN_STALE_MS     = 15 * 60 * 1000;   // 15 minutes
const APPROVAL_STALE_MS  = 24 * 3600 * 1000; // 24 hours
const PAUSED_NOTICE_MS   = 6 * 3600 * 1000;  // 6 hours

async function getState(db, key) {
  const { data } = await db.from('invariant_state').select('value').eq('key', key).maybeSingle();
  return data?.value || null;
}

async function setState(db, key, value) {
  await db.from('invariant_state').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

async function getStateJson(db, key) {
  const raw = await getState(db, key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function postAlert(text) {
  const channel = slackChannelFor('ops');
  if (!channel) {
    console.warn('[Invariant] SLACK_OPS_CHANNEL unset — alert skipped');
    return;
  }
  const res = await postSlackMessage({ channel, text: `:rotating_light: *Invariant broken* — ${text}` });
  await recordNotificationAttempt({ db: getSupabase(), channel: 'slack', target: channel, ok: res.ok, providerId: res.providerId, error: res.error });
  if (!res.ok) console.warn('[Invariant] alert post failed:', res.error);
}

/** Post the paused-backlog notice — informational, never an "invariant broken". */
async function postPausedNotice(count) {
  const channel = slackChannelFor('ops');
  if (!channel) {
    console.warn('[Invariant] SLACK_OPS_CHANNEL unset — paused notice skipped');
    return;
  }
  /* "held in queue" was the old wording and it was read, reasonably, as "the
     estate is safely holding things for you." It was not — inbound was not
     being looked at either. The wording now says which half is stopped. */
  const res = await postSlackMessage({
    channel,
    text: `System paused — outbound sends are held. Inbound is still being captured; ${count} row(s) pending.`,
  });
  await recordNotificationAttempt({ db: getSupabase(), channel: 'slack', target: channel, ok: res.ok, providerId: res.providerId, error: res.error });
  if (!res.ok) console.warn('[Invariant] paused notice post failed:', res.error);
}

/** Record the drain heartbeat — called by the authorised /api/queue/drain route. */
export async function recordDrainAuthorised(db = getSupabase()) {
  if (!db) return;
  await setState(db, 'last_drain_authorised_at', new Date().toISOString());
}

function safeJson(value) {
  if (value == null) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

function waitLabel(createdAt, nowMs) {
  const minutes = Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return days ? `${days}d ${hours}h` : `${hours}h ${mins}m`;
}

/** Check every invariant; alert any that are broken and off-cooldown. */
export async function sweepInvariants({ db = getSupabase(), now = new Date() } = {}) {
  if (!db) return { alerted: [], error: 'no_db' };
  const nowMs = now.getTime();

  /* Pause is a normal operating state, not a fault — but it no longer explains
     a backlog. The drain now dispatches while paused (see webhookQueue.js: the
     pause is an outbound gate, and every kind the drain handles is capture or
     bookkeeping), so pending rows piling up means something is genuinely stuck,
     paused or not.
     
     This block used to suppress queue_pending on the reasoning that a backlog
     was expected while paused. That reasoning is what let a live prospect's
     reply sit unseen: the row was pending, the alert was suppressed, and the
     six-hourly notice reported a number nobody reads as an emergency. The
     periodic notice stays — knowing the estate is paused is worth a line — but
     it no longer buys silence for the invariant. */
  const paused = await isPaused({ db });
  if (paused) {
    const { data } = await db.from('webhook_queue').select('id').eq('status', 'pending');
    const held = (data || []).length;
    const lastNotice = await getState(db, 'alert:paused_backlog');
    if (!lastNotice || (nowMs - new Date(lastNotice).getTime()) >= PAUSED_NOTICE_MS) {
      await setState(db, 'alert:paused_backlog', now.toISOString());
      await postPausedNotice(held);
    }
  }

  const conditions = [
    {
      key: 'queue_pending',
      title: 'webhook rows stuck pending >10m',
      // Was suppressWhenPaused: true. A pending row is now abnormal in either
      // state, and this is the alert that should have named Noah's reply.
      suppressWhenPaused: false,
      async check() {
        const { data } = await db.from('webhook_queue')
          .select('id').eq('status', 'pending')
          .lt('created_at', new Date(nowMs - PENDING_STUCK_MS).toISOString())
          .limit(100);
        const rows = data || [];
        return { triggered: rows.length > 0, identifiers: rows.map((r) => r.id), detail: `${rows.length}+ row(s) pending >10m` };
      },
    },
    {
      key: 'queue_failed',
      title: 'webhook rows in failed',
      async check() {
        const { data } = await db.from('webhook_queue')
          .select('id, kind, last_error')
          .eq('status', 'failed')
          .order('created_at', { ascending: true });
        const rows = data || [];
        if (!rows.length) return { triggered: false, identifiers: [], detail: '' };

        const ids = rows.map((r) => r.id).sort();

        const shown = rows.slice(0, 3);
        const lines = shown.map((r) => {
          const err = String(r.last_error || '').replace(/\s+/g, ' ').trim().slice(0, 120);
          return `• \`${r.kind}\` \`${r.id}\`${err ? ` — ${err}` : ''}`;
        });
        const more = rows.length > 3 ? `\n+${rows.length - 3} more` : '';
        return { triggered: true, identifiers: ids, detail: `${rows.length} failed row(s):\n${lines.join('\n')}${more}` };
      },
    },
    {
      key: 'drain_stale',
      title: 'drain not authorised in 15m',
      suppressWhenPaused: true,
      async check() {
        const last = await getState(db, 'last_drain_authorised_at');
        const stale = !last || (nowMs - new Date(last).getTime()) > DRAIN_STALE_MS;
        const detail = last
          ? `last drain ${Math.round((nowMs - new Date(last).getTime()) / 60000)}m ago`
          : 'drain never recorded';
        return { triggered: stale, identifiers: stale ? ['stale'] : [], detail };
      },
    },
    {
      key: 'approval_stale',
      title: 'approval pending >24h',
      async check() {
        const { data } = await db.from('tasks')
          .select('id, input, title, created_at').eq('type', 'pending_approval').eq('status', 'pending')
          .lt('created_at', new Date(nowMs - APPROVAL_STALE_MS).toISOString())
          .limit(100);
        const rows = data || [];
        const lines = rows.map((row) => {
          const input = safeJson(row.input);
          const subject = String(input.subject || row.title || row.id).replace(/\s+/g, ' ').trim();
          return `• ${subject} — waiting ${waitLabel(row.created_at, nowMs)}`;
        });
        return {
          triggered: rows.length > 0,
          identifiers: rows.map((row) => row.id),
          detail: `${rows.length} approval(s) pending >24h${lines.length ? `:\n${lines.join('\n')}` : ''}`,
        };
      },
    },
    {
      key: 'rate_cap',
      title: 'send refused by rate cap',
      async check() {
        const { data } = await db.from('inbound_message').select('id').eq('status', 'send_blocked').limit(100);
        const rows = data || [];
        return { triggered: rows.length > 0, identifiers: rows.map((row) => row.id), detail: `${rows.length}+ send(s) refused` };
      },
    },
    {
      key: 'publish_failed',
      title: 'publish failed',
      async check() {
        const { data } = await db.from('tasks')
          .select('id').eq('type', 'pending_approval')
          .eq('output->publishState', 'publish_failed')
          .limit(100);
        const rows = data || [];
        return { triggered: rows.length > 0, identifiers: rows.map((row) => row.id), detail: `${rows.length}+ publish failure(s)` };
      },
    },
  ];

  const alerted = [];
  for (const cond of conditions) {
    if (paused && cond.suppressWhenPaused) continue;

    const result = await cond.check();
    const stateKey = `alert:${cond.key}:identifiers`;
    const identifiers = (result.identifiers || []).map(String).sort();
    const lastIdentifiers = await getStateJson(db, stateKey);

    if (!result.triggered) {
      if (lastIdentifiers.length) await setState(db, stateKey, JSON.stringify([]));
      continue;
    }

    if (sameSet(identifiers, lastIdentifiers)) continue;

    await setState(db, stateKey, JSON.stringify(identifiers));

    await postAlert(`${cond.title}: ${result.detail}`);
    alerted.push(cond.key);
  }

  return { alerted };
}
