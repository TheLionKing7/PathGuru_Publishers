/**
 * DigiFusion Intelligence Network — Invariant alerts
 * ===================================================
 * These are invariants, not metrics: each one means something is broken right
 * now. They alert to SLACK_OPS_CHANNEL at most once per hour per condition —
 * except `queue_failed`, which re-alerts only when the *set* of failed row ids
 * changes (so the same rows don't nag every hour).
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
 * notice. Cooldown and the last-reported `queue_failed` row-id set both live in
 * public.invariant_state so they survive the free-tier sleep.
 */

import { getSupabase } from '../supabaseClient.js';
import { isPaused } from './systemFlags.js';
import { postSlackMessage, recordNotificationAttempt, slackChannelFor } from './slackNotify.js';

const COOLDOWN_MS        = 60 * 60 * 1000;   // 1 hour
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
  const res = await postSlackMessage({ channel, text: `System paused — ${count} rows held in queue` });
  await recordNotificationAttempt({ db: getSupabase(), channel: 'slack', target: channel, ok: res.ok, providerId: res.providerId, error: res.error });
  if (!res.ok) console.warn('[Invariant] paused notice post failed:', res.error);
}

/** Record the drain heartbeat — called by the authorised /api/queue/drain route. */
export async function recordDrainAuthorised(db = getSupabase()) {
  if (!db) return;
  await setState(db, 'last_drain_authorised_at', new Date().toISOString());
}

/** Check every invariant; alert any that are broken and off-cooldown. */
export async function sweepInvariants({ db = getSupabase(), now = new Date() } = {}) {
  if (!db) return { alerted: [], error: 'no_db' };
  const nowMs = now.getTime();

  // Pause is a normal operating state, not a fault. When paused the queue keeps
  // accepting rows but the drain stops dispatching, so pending rows accumulate by
  // design. Suppress the pending invariant and instead surface the backlog once
  // per 6 hours — visible without crying wolf.
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
      suppressWhenPaused: true,
      async check() {
        const { data } = await db.from('webhook_queue')
          .select('id').eq('status', 'pending')
          .lt('created_at', new Date(nowMs - PENDING_STUCK_MS).toISOString())
          .limit(1);
        return { triggered: (data || []).length > 0, detail: `${(data || []).length}+ row(s) pending >10m` };
      },
    },
    {
      key: 'queue_failed',
      title: 'webhook rows in failed',
      setBased: true,
      async check() {
        const { data } = await db.from('webhook_queue')
          .select('id, kind, last_error')
          .eq('status', 'failed')
          .order('created_at', { ascending: true });
        const rows = data || [];
        if (!rows.length) return { triggered: false, ids: [], detail: '' };

        const ids = rows.map((r) => r.id).sort();
        const lastIds = await getStateJson(db, 'alert:queue_failed:rows');
        if (sameSet(ids, lastIds)) return { triggered: false, ids, detail: '' };

        const shown = rows.slice(0, 3);
        const lines = shown.map((r) => {
          const err = String(r.last_error || '').replace(/\s+/g, ' ').trim().slice(0, 120);
          return `• \`${r.kind}\` \`${r.id}\`${err ? ` — ${err}` : ''}`;
        });
        const more = rows.length > 3 ? `\n+${rows.length - 3} more` : '';
        return { triggered: true, ids, detail: `${rows.length} failed row(s):\n${lines.join('\n')}${more}` };
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
        return { triggered: stale, detail };
      },
    },
    {
      key: 'approval_stale',
      title: 'approval pending >24h',
      async check() {
        const { data } = await db.from('tasks')
          .select('id').eq('type', 'pending_approval').eq('status', 'pending')
          .lt('created_at', new Date(nowMs - APPROVAL_STALE_MS).toISOString())
          .limit(1);
        return { triggered: (data || []).length > 0, detail: `${(data || []).length}+ approval(s) pending >24h` };
      },
    },
    {
      key: 'rate_cap',
      title: 'send refused by rate cap',
      async check() {
        const { data } = await db.from('inbound_message').select('id').eq('status', 'send_blocked').limit(1);
        return { triggered: (data || []).length > 0, detail: `${(data || []).length}+ send(s) refused` };
      },
    },
    {
      key: 'publish_failed',
      title: 'publish failed',
      async check() {
        const { data } = await db.from('tasks')
          .select('id').eq('type', 'pending_approval')
          .eq('output->publishState', 'publish_failed')
          .limit(1);
        return { triggered: (data || []).length > 0, detail: `${(data || []).length}+ publish failure(s)` };
      },
    },
  ];

  const alerted = [];
  for (const cond of conditions) {
    if (paused && cond.suppressWhenPaused) continue;
    if (!cond.setBased) {
      const last = await getState(db, `alert:${cond.key}`);
      if (last && (nowMs - new Date(last).getTime()) < COOLDOWN_MS) continue;
    }

    const result = await cond.check();
    if (!result.triggered) continue;

    if (cond.setBased) {
      await setState(db, `alert:${cond.key}:rows`, JSON.stringify(result.ids || []));
    } else {
      await setState(db, `alert:${cond.key}`, now.toISOString());
    }

    await postAlert(`${cond.title}: ${result.detail}`);
    alerted.push(cond.key);
  }

  return { alerted };
}
