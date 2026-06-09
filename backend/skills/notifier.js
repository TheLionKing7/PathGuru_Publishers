/**
 * DigiFusion Intelligence Network — Notifier
 * ===========================================
 * Dispatches pending notifications from the Supabase notifications table
 * to real delivery channels: push (OneSignal) and WhatsApp (Twilio or Meta).
 *
 * Called by:
 *   • Pulse.sweep()  — scans for pending alerts and dispatches them
 *   • POST /api/agents/pulse/dispatch  — manual trigger via API
 *
 * Channel logic:
 *   channel = 'dashboard'  → mark sent, no external call (frontend polls table)
 *   channel = 'push'       → OneSignal
 *   channel = 'whatsapp'   → Twilio WhatsApp OR Meta Cloud API
 *   channel = 'all'        → both push + WhatsApp
 *
 * Required env vars (add to Render):
 *   ONESIGNAL_APP_ID         — OneSignal application ID
 *   ONESIGNAL_API_KEY        — OneSignal REST API key
 *   WHATSAPP_TO              — recipient number with country code, e.g. +447700900123
 *                              (comma-separated for multiple recipients)
 *
 *   One of:
 *   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM
 *     e.g. TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
 *   OR
 *   META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID
 *     (Meta Cloud API)
 *
 * Graceful degradation: if credentials are absent the channel is skipped
 * and the notification is marked as 'skipped' rather than failing.
 */

import { getSupabase } from '../supabaseClient.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

// ── OneSignal push — DISABLED ─────────────────────────────────────────────────
// Chrome/browser push notifications are permanently disabled.
// All owner alerts are delivered exclusively via WhatsApp (Nexus → Twilio).
// To re-enable, restore the OneSignal fetch call below.

async function sendPush(_title, _body) {
  console.log('[Notifier] Push suppressed — Chrome notifications disabled; using WhatsApp only.');
  return { skipped: true, reason: 'push_disabled' };
}

// ── WhatsApp via Twilio ───────────────────────────────────────────────────────

async function sendWhatsAppTwilio(title, body, recipients) {
  const sid   = env('TWILIO_ACCOUNT_SID');
  const token = env('TWILIO_AUTH_TOKEN');
  const raw   = env('TWILIO_WHATSAPP_FROM'); // e.g. +14155238886 or whatsapp:+14155238886
  if (!sid || !token || !raw) return null;   // caller tries Meta next

  // Always ensure both From and To carry the whatsapp: channel prefix (error 21910 fix)
  const from = raw.startsWith('whatsapp:') ? raw : `whatsapp:${raw}`;

  const message = `*${title}*\n${body}`;
  const results = [];

  for (const to of recipients) {
    const toWA = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    try {
      const params = new URLSearchParams({ From: from, To: toWA, Body: message });
      const res    = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        },
        body:   params.toString(),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error(`[Notifier] Twilio WhatsApp error ${res.status}: ${t.slice(0, 200)}`);
        if (t.includes('63007')) {
          console.error('[Notifier] Error 63007: TWILIO_WHATSAPP_FROM is not a WhatsApp-enabled sender. In Twilio Console → Messaging → WhatsApp senders, copy the exact sandbox or Business number (e.g. whatsapp:+14155238886 for sandbox).');
        }
        // 429 = daily limit hit — mark as rate_limited so it is never retried
        const code = res.status === 429 ? 'rate_limited' : `Twilio ${res.status}`;
        results.push({ to, error: code, rateLimited: res.status === 429 });
      } else {
        const d = await res.json();
        console.log(`[Notifier] WhatsApp (Twilio) → ${to}: ${d.sid}`);
        results.push({ to, sent: true, sid: d.sid });
      }
    } catch (e) {
      console.error(`[Notifier] Twilio WhatsApp error for ${to}:`, e.message);
      results.push({ to, error: e.message });
    }
  }

  return results;
}

// ── WhatsApp via Meta Cloud API ───────────────────────────────────────────────

async function sendWhatsAppMeta(title, body, recipients) {
  const token   = env('META_WHATSAPP_TOKEN');
  const phoneId = env('META_PHONE_NUMBER_ID');
  if (!token || !phoneId) return null;   // neither provider configured

  const results = [];

  for (const to of recipients) {
    // Strip 'whatsapp:' prefix and '+' for Meta
    const toNum = to.replace(/^whatsapp:/, '').replace(/^\+/, '');
    const payload = {
      messaging_product: 'whatsapp',
      to:                toNum,
      type:              'text',
      text:              { body: `*${title}*\n${body}` },
    };

    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body:   JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error(`[Notifier] Meta WhatsApp error ${res.status}: ${t.slice(0, 200)}`);
        results.push({ to, error: `Meta ${res.status}` });
      } else {
        const d = await res.json();
        console.log(`[Notifier] WhatsApp (Meta) → ${to}: ${d.messages?.[0]?.id}`);
        results.push({ to, sent: true, id: d.messages?.[0]?.id });
      }
    } catch (e) {
      console.error(`[Notifier] Meta WhatsApp error for ${to}:`, e.message);
      results.push({ to, error: e.message });
    }
  }

  return results;
}

// ── WhatsApp dispatcher (tries Twilio first, then Meta) ───────────────────────

async function sendWhatsApp(title, body) {
  // Accept WHATSAPP_TO or OWNER_PHONE — whichever is set (WHATSAPP_TO takes priority)
  const toRaw = env('WHATSAPP_TO') || env('OWNER_PHONE');
  if (!toRaw) {
    console.warn('[Notifier] WhatsApp skipped — neither WHATSAPP_TO nor OWNER_PHONE is set.');
    return { skipped: true, reason: 'no_recipients' };
  }

  const recipients = toRaw.split(',').map(s => s.trim()).filter(Boolean);

  let result = await sendWhatsAppTwilio(title, body, recipients);
  if (!result) {
    result = await sendWhatsAppMeta(title, body, recipients);
  }
  if (!result) {
    console.warn('[Notifier] WhatsApp skipped — no provider credentials (TWILIO_* or META_WHATSAPP_*).');
    return { skipped: true, reason: 'no_credentials' };
  }

  return { results: result };
}

// ── Main dispatch loop ────────────────────────────────────────────────────────

/**
 * Fetch pending notifications from Supabase and dispatch them.
 * Called by Pulse.sweep() and the manual trigger route.
 * @param {number} [limit=50] — max notifications to process per call
 * @returns {{ dispatched: number, errors: number }}
 */
export async function dispatchPendingNotifications(limit = 50) {
  const db = getSupabase();
  if (!db) return { dispatched: 0, errors: 0 };

  const { data: pending, error } = await db
    .from('notifications')
    .select('*')
    .eq('status', 'pending')           // only undelivered
    .neq('status', 'rate_limited')     // never retry rate-limited messages
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[Notifier] Failed to fetch pending notifications:', error.message);
    return { dispatched: 0, errors: 1 };
  }

  if (!pending?.length) return { dispatched: 0, errors: 0 };

  console.log(`[Notifier] Processing ${pending.length} pending notification(s)...`);

  let dispatched = 0;
  let errors     = 0;

  for (const note of pending) {
    const { id, title, body, channel, severity } = note;
    let finalStatus = 'sent';
    let dispatch    = {};

    try {
      const needsPush = channel === 'push'      || channel === 'all';
      const needsWA   = channel === 'whatsapp'  || channel === 'all';

      if (needsPush) {
        dispatch.push = await sendPush(title, body);
        if (dispatch.push?.error) finalStatus = 'partial';
      }

      if (needsWA) {
        dispatch.whatsapp = await sendWhatsApp(title, body);
        // 429 rate-limited — mark permanently so it is never retried
        if (dispatch.whatsapp?.results?.some(r => r.rateLimited)) {
          finalStatus = 'rate_limited';
        } else if (dispatch.whatsapp?.error) {
          finalStatus = 'partial';
        }
      }

      // dashboard channel — just mark sent (frontend polls the table)
      if (channel === 'dashboard') finalStatus = 'sent';

      if (dispatch.push?.skipped && dispatch.whatsapp?.skipped) finalStatus = 'skipped';

      dispatched++;
    } catch (e) {
      console.error(`[Notifier] Error dispatching notification ${id}:`, e.message);
      finalStatus = 'error';
      errors++;
    }

    // Update status in Supabase
    await db.from('notifications').update({
      status:      finalStatus,
      dispatched_at: new Date().toISOString(),
      dispatch_log:  dispatch,
    }).eq('id', id);
  }

  console.log(`[Notifier] Done — ${dispatched} dispatched, ${errors} errors.`);
  return { dispatched, errors };
}

/**
 * Send a one-off notification immediately without going through the table.
 * Useful for urgent alerts that can't wait for the next sweep.
 */
export async function sendImmediate(title, body, channel = 'push') {
  const needsPush = channel === 'push'     || channel === 'all';
  const needsWA   = channel === 'whatsapp' || channel === 'all';

  const result = {};
  if (needsPush) result.push      = await sendPush(title, body);
  if (needsWA)   result.whatsapp  = await sendWhatsApp(title, body);
  return result;
}
