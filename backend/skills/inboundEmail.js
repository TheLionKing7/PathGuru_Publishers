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
import { isPaused } from './systemFlags.js';
import {
  MAX_SENDS_PER_RECIPIENT_PER_DAY,
  countRecipientSends,
  recordSend,
  blockOutboundDraft,
} from './outboundRate.js';

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

// ── Address normalisation ───────────────────────────────────────────────────

const ADDRESS_ENTITY_RE = /&lt;|&gt;|&amp;|&quot;|&#39;/g;
const ADDRESS_ENTITY_MAP = {
  '&lt;':   '<',
  '&gt;':   '>',
  '&amp;':  '&',
  '&quot;': '"',
  '&#39;':  "'",
};

// Basic shape only — no whitespace, no angle brackets, an @ and a dotted domain.
const ADDRESS_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

/**
 * Normalise an inbound address for outbound use. Decodes the HTML entities we
 * see in the table (&lt; &gt; &amp; &quot; &#39;), extracts the address from
 * inside angle brackets when present, trims, and returns null when the result
 * is not a plausible address. Read-only: never mutates the stored row.
 */
export function normaliseAddress(raw) {
  if (raw == null) return null;
  const decoded = String(raw).replace(ADDRESS_ENTITY_RE, (m) => ADDRESS_ENTITY_MAP[m]);
  const inside = decoded.match(/<([^<>]*)>/);
  const candidate = (inside ? inside[1] : decoded).trim();
  return ADDRESS_RE.test(candidate) ? candidate : null;
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

/** Approved drafts not yet sent — the outbound queue Make polls. Claims atomically. */
export async function listApprovedDrafts(db = getSupabase()) {
  if (!db) return { drafts: [] };

  // Global pause — the approved-draft hand-off to Make IS the outbound email
  // send. When paused, hand out nothing so no email can leave the estate.
  if (await isPaused({ db })) {
    console.log('[Paused] outbound email send suppressed');
    return { drafts: [], paused: true };
  }

  // Park rows that exhausted their send attempts without a confirmation. Three
  // unconfirmed sends is a broken pipeline, not something to keep retrying at a
  // stranger's inbox.
  const cutoff = new Date(Date.now() - 10 * 60000).toISOString();
  const parked = await db.from('inbound_message')
    .update({ status: 'send_failed' })
    .eq('status', 'approved')
    .is('sent_at', null)
    .gte('send_attempts', 3)
    .lt('send_claimed_at', cutoff)
    .select('id');
  if (parked.error) return { drafts: [], error: parked.error.message };
  for (const row of (parked.data || [])) {
    console.log(`[Outbound] send_failed: inbound_message ${row.id} (3 unconfirmed sends)`);
  }

  // Atomic claim — one UPDATE ... RETURNING. A second caller arriving before the
  // confirmation (or before the 10-minute claim window lapses) gets nothing.
  const { data, error } = await db.rpc('claim_outbound_drafts');
  if (error) return { drafts: [], error: error.message };

  // Hard rate cap: at most one email per recipient per 24h. Refuse (and mark
  // send_blocked) any claimed draft whose recipient already has a recent send,
  // or was already handed out earlier in this same run.
  const claimed  = data || [];
  const drafts   = [];
  const handedOut = new Set();
  let blocked    = 0;

  for (const d of claimed) {
    const toAddr = (normaliseAddress(d.from_addr) || '').toLowerCase() || null;

    if (!toAddr) {
      await blockOutboundDraft(db, d, { reason: 'no parseable recipient' });
      blocked++;
      continue;
    }

    let recent;
    try {
      recent = await countRecipientSends(db, toAddr);
    } catch (e) {
      // Fail closed — a hard cap you cannot verify must refuse the send.
      console.warn('[Outbound] rate-cap check failed, refusing send:', e.message);
      await blockOutboundDraft(db, d, { toAddr, reason: 'rate check failed' });
      blocked++;
      continue;
    }

    if (recent >= MAX_SENDS_PER_RECIPIENT_PER_DAY || handedOut.has(toAddr)) {
      await blockOutboundDraft(db, d, { toAddr, reason: 'rate cap' });
      blocked++;
      continue;
    }

    handedOut.add(toAddr);
    drafts.push(d);
  }

  return { drafts, blocked };
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
      send_claimed_at:     null,
    })
    .eq('id', id)
    .eq('status', 'approved')
    .select()
    .single();

  if (error) return { error: error.message };

  // Record the confirmed send so the rate cap sees it on the next hand-out.
  const toAddr = (normaliseAddress(data?.from_addr) || '').toLowerCase() || null;
  if (toAddr) {
    await recordSend(db, { toAddr, inboundMessageId: id }).catch((e) => {
      console.warn('[Outbound] failed to record send:', e.message);
    });
  }

  return { ok: true, message: data };
}
