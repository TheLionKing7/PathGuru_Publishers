/**
 * DigiFusion Intelligence Network — Inbound Email
 * ===============================================
 * Persistence + HMAC auth for the inbound-email webhook and the outbound
 * ("approved drafts to send") Make routes.
 *
 * Nexus classifies and drafts, but NEVER sends: a draft is written onto the
 * inbound_message row and an [APPROVAL] task references it. Only after a human
 * approves does the row move to `approved` and appear here for the sender.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSupabase } from '../supabaseClient.js';

function env(name) {
  return (process.env[name] || '').trim();
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function hmacHex(message) {
  const secret = env('INBOUND_WEBHOOK_SECRET');
  if (!secret) return null;
  return createHmac('sha256', secret).update(message).digest('hex');
}

function freshEnough(timestamp) {
  const ts = Number(timestamp);
  return Number.isFinite(ts) && Math.abs(Date.now() / 1000 - ts) <= 300;
}

/**
 * Inbound-email webhook auth: HMAC-SHA256 over the raw body, plus a timestamp
 * header for freshness. Headers: x-signature (hex), x-timestamp (unix seconds).
 */
export function verifyInboundEmailSignature({ rawBody, timestamp, signature }) {
  if (!env('INBOUND_WEBHOOK_SECRET')) return false;
  if (!timestamp || !signature) return false;
  if (!freshEnough(timestamp)) return false;
  const expected = hmacHex(String(rawBody || ''));
  return expected ? safeEqual(expected, String(signature)) : false;
}

/**
 * Outbound Make-route HMAC: same INBOUND_WEBHOOK_SECRET, but the signature binds
 * the request line ("<timestamp>.<method>.<path>") because GET carries no body.
 */
export function verifyOutboundSignature({ timestamp, signature, method, path }) {
  if (!env('INBOUND_WEBHOOK_SECRET')) return false;
  if (!timestamp || !signature) return false;
  if (!freshEnough(timestamp)) return false;
  const expected = hmacHex(`${timestamp}.${method}.${path}`);
  return expected ? safeEqual(expected, String(signature)) : false;
}

/** Extract the token from an `Authorization: Bearer <token>` header, or null. */
function bearerTokenFrom(authorization) {
  const m = String(authorization || '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Timing-safe bearer-token check against MAKE_OUTBOUND_TOKEN (fails closed when unset). */
function verifyBearerToken(authorization) {
  const expected = env('MAKE_OUTBOUND_TOKEN');
  if (!expected) return false;
  const provided = bearerTokenFrom(authorization);
  if (!provided) return false;
  return safeEqual(provided, expected);
}

/**
 * Outbound route auth: accept EITHER the HMAC signature (INBOUND_WEBHOOK_SECRET)
 * OR an Authorization bearer token (MAKE_OUTBOUND_TOKEN). Neither replaces the
 * other; when MAKE_OUTBOUND_TOKEN is unset only the HMAC path works.
 */
export function verifyOutboundAuth({ timestamp, signature, method, path, authorization }) {
  if (verifyOutboundSignature({ timestamp, signature, method, path })) return true;
  return verifyBearerToken(authorization);
}

// ── Persistence ─────────────────────────────────────────────────────────────

export async function persistInboundMessage(payload) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const messageId = payload.messageId || null;

  // Upsert on the unique (message_id where not null) key: return the existing row
  // when the message id is already present, so a redelivered webhook does not
  // create a duplicate draft or a second approval task.
  if (messageId) {
    const { data: existing } = await db.from('inbound_message')
      .select('*')
      .eq('message_id', messageId)
      .maybeSingle();
    if (existing) return existing;
  }

  const row = {
    message_id:  messageId,
    thread_id:   payload.threadId  || null,
    from_addr:   payload.from || null,
    to_addr:     payload.to   || null,
    subject:     payload.subject || null,
    body:        payload.body    || null,
    received_at: payload.receivedAt || new Date().toISOString(),
    status:      'received',
  };

  const { data, error } = await db.from('inbound_message').insert(row).select().single();
  if (error) {
    // A concurrent retry may have inserted first — the unique index rejects this
    // insert, so re-select and return the existing row rather than failing.
    if (messageId) {
      const { data: raced } = await db.from('inbound_message')
        .select('*')
        .eq('message_id', messageId)
        .maybeSingle();
      if (raced) return raced;
    }
    throw new Error(error.message);
  }
  return data;
}

/** Approved drafts not yet sent — the outbound queue Make polls. */
export async function listApprovedDrafts() {
  const db = getSupabase();
  if (!db) return { drafts: [] };

  const { data, error } = await db.from('inbound_message')
    .select('id, message_id, thread_id, from_addr, to_addr, subject, draft_subject, draft_body, status, approved_at, created_at')
    .eq('status', 'approved')
    .is('sent_at', null)
    .order('approved_at', { ascending: true });

  if (error) return { drafts: [], error: error.message };
  return { drafts: data || [] };
}

/** Mark an approved draft as sent, recording the provider's message id. */
export async function markInboundSent(id, providerMessageId) {
  const db = getSupabase();
  if (!db) return { error: 'Supabase not configured' };

  const { data, error } = await db.from('inbound_message')
    .update({
      status:              'sent',
      sent_at:             new Date().toISOString(),
      provider_message_id: providerMessageId || null,
    })
    .eq('id', id)
    .eq('status', 'approved')
    .select()
    .single();

  if (error) return { error: error.message };
  return { ok: true, message: data };
}
