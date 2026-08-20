/**
 * DigiFusion Intelligence Network — Webhook Queue
 * ================================================
 * Durable outbox for inbound webhooks. Inbound handlers enqueue the raw body;
 * POST /api/queue/drain claims pending rows and dispatches them by kind so slow
 * work (LLM classification, Slack interaction) never runs inside the provider's
 * response window.
 */

import { getSupabase } from '../supabaseClient.js';

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
    const { parseSlackPayload, handleSlackBlockAction } = await import('./slackApprovals.js');
    const payload = parseSlackPayload(rawBody, contentType);
    if (!payload || typeof payload !== 'object') throw new Error('slack payload could not be parsed');
    await handleSlackBlockAction(payload);
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
    })
    .eq('id', id)
    .select('id');

  if (error) throw error;

  if (!data || data.length === 0) {
    await db.from('webhook_queue')
      .update({ status: 'failed', last_error: `inbound_message ${id} not found`, claimed_at: null, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return 'failed';
  }

  return 'done';
}

/**
 * Drain the queue: reap stale claims, claim up to 25 pending rows, dispatch each
 * by kind, and record done/failed. Returns a per-kind count summary.
 */
export async function drainWebhookQueue() {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const reaped = await reapStaleWebhooks();

  const { data: pending } = await db.from('webhook_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_PER_DRAIN);

  const rows = pending || [];
  const summary = {
    reaped:       reaped.requeued,   // stale claimed rows returned to pending
    reapedFailed: reaped.failed,     // stale claimed rows parked as failed (attempts >= MAX_ATTEMPTS)
    drained: 0,
    succeeded: 0,
    failed: 0,
    byKind: { slack: 0, whatsapp: 0, inbound_email: 0, outbound_sent: 0 },
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
