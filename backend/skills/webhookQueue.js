/**
 * DigiFusion Intelligence Network — Webhook Queue
 * ================================================
 * Durable outbox for inbound webhooks. Inbound handlers enqueue the raw body;
 * POST /api/queue/drain claims pending rows and dispatches them by kind so slow
 * work (LLM classification, Slack interaction) never runs inside the provider's
 * response window.
 */

import { getSupabase } from '../supabaseClient.js';
import { isPaused } from './systemFlags.js';
import { normaliseAddress } from './inboundEmail.js';
import { recordSend } from './outboundRate.js';

const MAX_PER_DRAIN = 25;
const MAX_ATTEMPTS = 5;

/**
 * Reset rows stuck in `claimed` (a drain crashed mid-processing) back to
 * `pending` so a later drain can retry them — but only up to MAX_ATTEMPTS. A
 * payload that crashes the process (rather than throwing) never hits the throw
 * path, so the reaper must enforce the same cap: rows already at the cap are
 * parked as `failed` instead of being requeued forever.
 *
 * @returns {{ requeued: number, failed: number }}
 */
export async function reapStaleWebhooks({ olderThanMinutes = 5, db = getSupabase() } = {}) {
  if (!db) return { requeued: 0, failed: 0 };

  const cutoff = new Date(Date.now() - olderThanMinutes * 60000).toISOString();
  const { data: rows } = await db.from('webhook_queue')
    .select('id, attempts')
    .eq('status', 'claimed')
    .lt('claimed_at', cutoff)
    .limit(200);

  if (!rows?.length) return { requeued: 0, failed: 0 };

  const toFail = rows.filter((r) => (r.attempts || 0) >= MAX_ATTEMPTS);
  const toRequeue = rows.filter((r) => (r.attempts || 0) < MAX_ATTEMPTS);

  const now = new Date().toISOString();
  if (toFail.length) {
    await db.from('webhook_queue')
      .update({ status: 'failed', last_error: 'abandoned while claimed', claimed_at: null, updated_at: now })
      .in('id', toFail.map((r) => r.id));
  }
  if (toRequeue.length) {
    await db.from('webhook_queue')
      .update({ status: 'pending', claimed_at: null, updated_at: now })
      .in('id', toRequeue.map((r) => r.id));
  }

  return { requeued: toRequeue.length, failed: toFail.length };
}

/**
 * Atomically claim a row: only succeeds if its status is still `pending`, so two
 * concurrent drains cannot both process the same row. Returns the claimed row,
 * or null when the conditional update affected zero rows.
 */
export async function claimRow(db, row, now) {
  const { data } = await db.from('webhook_queue')
    .update({
      status:     'claimed',
      claimed_at: now,
      attempts:   (row.attempts || 0) + 1,
      updated_at: now,
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select();

  return data && data.length > 0 ? data[0] : null;
}

async function dispatchWebhook(row) {
  const rawBody = row.raw_body || '';
  const contentType = row.content_type || '';

  if (row.kind === 'slack') {
    const { handleSlackWebhook } = await import('./slackApprovals.js');
    await handleSlackWebhook({ rawBody, contentType });
    return 'done';
  }

  if (row.kind === 'whatsapp') {
    const form = Object.fromEntries(new URLSearchParams(rawBody));
    const { handleWhatsAppMessage } = await import('./whatsappInbound.js');
    await handleWhatsAppMessage({
      from:        (form.From || '').replace('whatsapp:', '').trim(),
      body:        (form.Body || '').trim(),
      profileName: form.ProfileName || '',
      waId:        form.WaId || '',
      messageSid:  form.MessageSid || '',
    });
    return 'done';
  }

  if (row.kind === 'inbound_email') {
    let payload;
    try { payload = JSON.parse(rawBody || '{}'); } catch { throw new Error('inbound_email payload could not be parsed'); }
    const { nexus } = await import('../agents/nexus.js');
    await nexus.processInboundEmail(payload);
    return 'done';
  }

  if (row.kind === 'outbound_sent') {
    let payload;
    try { payload = JSON.parse(rawBody || '{}'); } catch { throw new Error('outbound_sent payload could not be parsed'); }
    return await handleOutboundSent(row, payload);
  }

  if (row.kind === 'whatsapp_status') {
    const form = Object.fromEntries(new URLSearchParams(rawBody));
    const { handleWhatsAppStatusCallback } = await import('./whatsappStatus.js');
    await handleWhatsAppStatusCallback(form);
    return 'done';
  }

  throw new Error(`Unknown webhook kind: ${row.kind}`);
}

/**
 * outbound_sent — Make's "email actually sent" confirmation. Marks the matching
 * inbound_message row sent. An orphaned confirmation (no matching row) fails the
 * queue row permanently with an explanatory error instead of retrying forever.
 * Returns 'done' or 'failed' (already handled); throws only on a real DB error.
 */
async function handleOutboundSent(row, payload) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const id = payload.id;
  if (!id) {
    await db.from('webhook_queue')
      .update({ status: 'failed', last_error: 'outbound_sent payload missing id', claimed_at: null, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return 'failed';
  }

  const { data, error } = await db.from('inbound_message')
    .update({
      sent_at:             new Date().toISOString(),
      status:              'sent',
      provider_message_id: payload.providerMessageId || null,
      send_claimed_at:     null,
    })
    .eq('id', id)
    .select('id, from_addr');

  if (error) throw error;

  if (!data || data.length === 0) {
    await db.from('webhook_queue')
      .update({ status: 'failed', last_error: `inbound_message ${id} not found`, claimed_at: null, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return 'failed';
  }

  // Record the confirmed send so the rate cap sees it on the next hand-out.
  const toAddr = (normaliseAddress(data[0].from_addr) || '').toLowerCase() || null;
  if (toAddr) {
    await recordSend(db, { toAddr, inboundMessageId: id }).catch((e) => {
      console.warn('[Outbound] failed to record send:', e.message);
    });
  }

  return 'done';
}

/**
 * Drain the queue: reap stale claims, claim up to 25 pending rows, dispatch each
 * by kind, and record done/failed. Returns a per-kind count summary.
 */
export async function drainWebhookQueue({ db = getSupabase() } = {}) {
  /* THE PAUSE IS NOT APPLIED HERE, AND THAT IS DELIBERATE.
   *
   * This function used to return early when the estate was paused. The comment
   * said "nothing is lost", and strictly that was true — rows stayed pending.
   * What was lost was the KNOWING. A live prospect replied while the estate was
   * paused, his mail sat in this queue as an untouched row, and because
   * invariantAlerts suppresses queue_pending while paused, nothing said so. The
   * estate looked calm because it had stopped listening.
   *
   * 0032_system_flags.sql states the intent plainly: paused means the system
   * "still generates, drafts and queues, but never sends, posts or publishes."
   * That is an OUTBOUND gate. This is the INBOUND path, and every kind it
   * dispatches is capture or bookkeeping — not one of them reaches a prospect:
   *
   *   inbound_email    nexus.processInboundEmail — "the draft is written onto
   *                    the inbound_message row; Nexus never sends it"
   *   outbound_sent    Make's send confirmation. This one is worse than
   *                    useless to block: it stamps sent_at, which is the
   *                    at-most-once guarantee. Hold it and a send made just
   *                    before the pause stays eligible for resending — the
   *                    exact shape of the five duplicate emails.
   *   whatsapp         persists an inbound message; the TwiML reply happens at
   *                    the webhook layer, never in this replay
   *   whatsapp_status  delivery receipts, pure bookkeeping
   *   slack            the operator's own workspace — answering the person who
   *                    paused it is not "acting on the world"
   *
   * The pause still holds where it belongs and is unchanged: listApprovedDrafts()
   * hands out nothing, and the publish path refuses. If a future kind DOES reach
   * the outside world, gate that kind's send function — not this loop. Gating
   * the drain gates the eyes, not the hands.
   */
  if (!db) throw new Error('Supabase not configured');

  const paused = await isPaused({ db });
  if (paused) {
    console.log('[Paused] outbound sends remain suppressed; inbound capture continues');
  }

  const reaped = await reapStaleWebhooks({ db });

  const { data: pending } = await db.from('webhook_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_PER_DRAIN);

  const rows = pending || [];
  const summary = {
    // Reported, not acted on — callers and the health endpoint still want to
    // know the estate is paused, they just no longer infer "nothing happened".
    paused,
    reaped:       reaped.requeued,   // stale claimed rows returned to pending
    reapedFailed: reaped.failed,     // stale claimed rows parked as failed (attempts >= MAX_ATTEMPTS)
    drained: 0,
    succeeded: 0,
    failed: 0,
    byKind: { slack: 0, whatsapp: 0, whatsapp_status: 0, inbound_email: 0, outbound_sent: 0 },
  };

  for (const row of rows) {
    const claimed = await claimRow(db, row, new Date().toISOString());
    if (!claimed) continue; // another drain claimed it — skip

    summary.drained++;

    try {
      const outcome = await dispatchWebhook(claimed);
      if (outcome === 'failed') {
        // The handler already marked this row failed with an explanatory error.
        summary.failed++;
      } else {
        const now = new Date().toISOString();
        await db.from('webhook_queue')
          .update({ status: 'done', processed_at: now, updated_at: now })
          .eq('id', claimed.id);
        summary.succeeded++;
        summary.byKind[claimed.kind] = (summary.byKind[claimed.kind] || 0) + 1;
      }
    } catch (e) {
      summary.failed++;
      const attempts = claimed.attempts || 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await db.from('webhook_queue')
        .update({
          status:     failed ? 'failed' : 'pending',
          last_error: String(e.message || e).slice(0, 500),
          claimed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', claimed.id);
      console.warn(`[WebhookQueue] ${claimed.kind} dispatch failed (attempt ${attempts}):`, e.message);
    }
  }

  return summary;
}
