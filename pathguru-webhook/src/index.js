/* ═══════════════════════════════════════════════════════════════════════════
   PathGuru webhook edge — Cloudflare Worker

   ── WHY THIS EXISTS ────────────────────────────────────────────────────────

   The PathGuru backend runs on Render's free tier, which spins down after
   ~15 minutes idle and takes roughly 50 seconds to wake. Every channel Nexus
   depends on is idle by nature — an approval queue waits for mail to arrive —
   so the backend is asleep exactly when a webhook lands. Slack allows 3
   seconds. Twilio times out and retries. Make logs an error. The whole design
   fails on the one thing it must do reliably.

   This Worker is always warm. It does the smallest possible amount of work:

     1. VERIFY the sender cryptographically. Slack's v0 scheme, Twilio's
        HMAC-SHA1 over URL + sorted params, and our own HMAC-SHA256 for Make.
     2. WRITE the raw payload to a queue table in Supabase.
     3. RETURN 200 immediately, plus an honest interim message for Slack so a
        button press visibly does something.
     4. AFTER responding, wake the Render backend so it drains the queue.

   ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────

   No business logic. It does not decide approvals, classify email, call an LLM,
   or write to `tasks` or `inbound_message`. That was tempting — the Worker
   could flip an approval in two REST calls and answer definitively in under a
   second — and it is exactly the mistake we refused to make with Make.com.
   Approval logic lives in one place, in the backend, where it is versioned and
   tested. The Worker is a signed, durable letterbox.

   The cost of that discipline is honest: after tapping Approve you see
   "received, processing" instantly and the final state up to ~50 seconds later
   on a cold backend. That is the price of the free tier, and it is visible
   rather than hidden.

   ── SECURITY NOTES ─────────────────────────────────────────────────────────

   Uses the Supabase ANON key, not the service-role key. A service-role key in
   an edge function bypasses RLS across the entire database; if the Worker were
   ever compromised the whole estate goes with it. Migration 0028 gives anon
   INSERT-only rights on `webhook_queue` and nothing else — the worst a leaked
   key can do is write junk into one table.

   Every comparison of a signature is constant-time. Unsigned or stale requests
   are rejected before anything is written, so an unauthenticated caller cannot
   even fill the queue.
   ═══════════════════════════════════════════════════════════════════════════ */

const MAX_SKEW_SECONDS = 300;          // 5 minutes, matching the backend
const MAX_BODY_BYTES  = 512 * 1024;    // a webhook this big is not a webhook

/* ── Crypto helpers ─────────────────────────────────────────────────────── */

const enc = new TextEncoder();

async function hmac(algorithm, secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

const toHex = (bytes) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));

/* Constant-time string comparison. `===` on a signature leaks its prefix
   through timing; the length check leaks only the length, which is public. */
function safeEqual(a, b) {
  const x = enc.encode(String(a ?? ''));
  const y = enc.encode(String(b ?? ''));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const fresh = (timestamp) => {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(Math.floor(Date.now() / 1000) - ts) <= MAX_SKEW_SECONDS;
};

/* ── Slack: v0 scheme over `v0:<timestamp>:<raw body>` ──────────────────── */
async function verifySlack(rawBody, headers, secret) {
  if (!secret) return { ok: false, why: 'SLACK_SIGNING_SECRET not set' };
  const ts  = headers.get('x-slack-request-timestamp');
  const sig = headers.get('x-slack-signature');
  if (!ts || !sig) return { ok: false, why: 'missing Slack signature headers' };
  if (!fresh(ts))  return { ok: false, why: 'Slack timestamp outside 5-minute window' };
  const expected = `v0=${toHex(await hmac('SHA-256', secret, `v0:${ts}:${rawBody}`))}`;
  return safeEqual(expected, sig) ? { ok: true } : { ok: false, why: 'Slack signature mismatch' };
}

/* ── Twilio: HMAC-SHA1 over the full URL + params sorted by key ──────────
   Twilio signs the URL it was configured with. Behind Cloudflare, request.url
   is that URL — but if you ever put the Worker behind a redirect or change the
   route, the string Twilio signed and the string we rebuild diverge and every
   message 403s. TWILIO_WEBHOOK_URL overrides it explicitly for that case. */
async function verifyTwilio(rawBody, request, env) {
  const token = env.TWILIO_AUTH_TOKEN;
  if (!token) return { ok: false, why: 'TWILIO_AUTH_TOKEN not set' };
  const sig = request.headers.get('x-twilio-signature');
  if (!sig) return { ok: false, why: 'missing X-Twilio-Signature' };

  const url = env.TWILIO_WEBHOOK_URL || request.url;
  const params = new URLSearchParams(rawBody);
  const keys = [...params.keys()].sort();
  let payload = url;
  for (const k of keys) payload += k + params.get(k);

  const expected = toBase64(await hmac('SHA-1', token, payload));
  return safeEqual(expected, sig) ? { ok: true } : { ok: false, why: 'Twilio signature mismatch' };
}

/* ── Make / inbound email: our own HMAC-SHA256 over the raw body, OR a bearer
   token (MAKE_INBOUND_TOKEN) in the Authorization header. Either authenticates;
   neither replaces the other. When MAKE_INBOUND_TOKEN is unset, only HMAC works. */
async function verifyInbound(rawBody, headers, hmacSecret, bearerSecret) {
  // Bearer path — constant-time compare, fail closed when the token is unset.
  const auth = headers.get('authorization');
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m?.[1] && bearerSecret && safeEqual(m[1].trim(), bearerSecret)) return { ok: true };
    // Wrong/missing token falls through to HMAC — a stray Authorization header
    // must not break a caller that authenticates by signature.
  }

  // HMAC path (unchanged).
  if (!hmacSecret) return { ok: false, why: 'INBOUND_WEBHOOK_SECRET not set' };
  const ts  = headers.get('x-timestamp');
  const sig = headers.get('x-signature');
  if (!ts || !sig) return { ok: false, why: 'missing x-signature / x-timestamp' };
  if (!fresh(ts))  return { ok: false, why: 'timestamp outside 5-minute window' };
  const expected = toHex(await hmac('SHA-256', hmacSecret, rawBody));
  return safeEqual(expected, sig) ? { ok: true } : { ok: false, why: 'signature mismatch' };
}

/* ── Supabase: one INSERT, via the REST API ─────────────────────────────── */
async function enqueue(env, row) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/webhook_queue`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    // 409 means the unique index caught a retry of a delivery we already have.
    // That is success, not failure — the point of the index.
    if (res.status === 409) return { ok: true, duplicate: true };
    return { ok: false, status: res.status, body: (await res.text()).slice(0, 300) };
  }
  return { ok: true };
}

/* Wake the backend. Fire-and-forget inside waitUntil so it never delays the
   response we owe Slack. A cold Render service will not answer this request
   for ~50s; we do not care, because waking it IS the effect. */
function wakeBackend(env, ctx) {
  if (!env.RENDER_ORIGIN) return;
  const url = `${env.RENDER_ORIGIN.replace(/\/$/, '')}/api/queue/drain`;
  ctx.waitUntil(
    (async () => {
      try {
        const ts = Math.floor(Date.now() / 1000);
        const sig = toHex(await hmac('SHA-256', env.INBOUND_WEBHOOK_SECRET, `${ts}.POST./api/queue/drain`));
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'x-timestamp': String(ts), 'x-signature': sig, 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(120_000),
        });
        console.log('wake', r.status, url);
        if (!r.ok) {
          console.log('wake body:', (await r.text()).slice(0, 200));
        }
      } catch (e) {
        // Nothing to do here. The cron trigger below is the safety net, so a
        // failed wake delays the queue rather than losing it.
        console.log('wake failed:', e.name);
      }
    })(),
  );
}

/* ── The four routes ────────────────────────────────────────────────────── */

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (request.method === 'GET' && pathname === '/health') {
      // Names only, never values. A health endpoint that prints secrets is a
      // secret-printing endpoint with a friendly name.
      return json({
        ok: true,
        configured: {
          supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
          slack:    Boolean(env.SLACK_SIGNING_SECRET),
          twilio:   Boolean(env.TWILIO_AUTH_TOKEN),
          inbound:  Boolean(env.INBOUND_WEBHOOK_SECRET),
          makeInbound: Boolean(env.MAKE_INBOUND_TOKEN),
          backend:  Boolean(env.RENDER_ORIGIN),
        },
      });
    }

    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) return json({ error: 'Body too large' }, 413);

    let kind, verdict, dedupeKey = null;

    if (pathname === '/webhooks/slack') {
      kind = 'slack';
      verdict = await verifySlack(rawBody, request.headers, env.SLACK_SIGNING_SECRET);

      /* Slack's URL-verification handshake must be answered inline — it is not
         work to be queued, and Slack refuses to save the URL without it. */
      if (verdict.ok) {
        try {
          const probe = JSON.parse(rawBody);
          if (probe.type === 'url_verification') return json({ challenge: probe.challenge });
        } catch { /* interactivity payloads are urlencoded; fall through */ }
      }
    } else if (pathname === '/webhooks/whatsapp') {
      kind = 'whatsapp';
      verdict = await verifyTwilio(rawBody, request, env);
      dedupeKey = new URLSearchParams(rawBody).get('MessageSid');
    } else if (pathname === '/webhooks/inbound-email') {
      kind = 'inbound_email';
      verdict = await verifyInbound(rawBody, request.headers, env.INBOUND_WEBHOOK_SECRET, env.MAKE_INBOUND_TOKEN);
      try { dedupeKey = JSON.parse(rawBody).messageId || null; } catch { dedupeKey = null; }
    } else {
      return json({ error: 'Not found' }, 404);
    }

    if (!verdict.ok) {
      console.log(`reject ${kind}: ${verdict.why}`);
      return json({ error: 'Unauthorized' }, 401);
    }

    const stored = await enqueue(env, {
      kind,
      dedupe_key: dedupeKey,
      content_type: request.headers.get('content-type') || null,
      raw_body: rawBody,
      // Slack needs response_url to update the card later; it lives in the body,
      // so nothing extra is captured here. Header capture is deliberately
      // omitted — headers carry the signatures, and storing those stores a
      // replayable credential.
    });

    if (!stored.ok) {
      // 500 so Slack/Twilio/Make retry. Swallowing this would lose the message
      // and look like success, which is the failure mode this estate exists to
      // point at in other people's systems.
      console.log(`enqueue failed ${kind}: ${stored.status} ${stored.body}`);
      return json({ error: 'Queue unavailable' }, 500);
    }

    wakeBackend(env, ctx);

    /* Slack gets a visible, honest interim state. `replace_original` swaps the
       card immediately so a tap is never silent; the backend replaces it again
       with the real outcome once it has actually decided. Saying "Approved"
       here would be a lie — nothing has been approved yet. */
    if (kind === 'slack') {
      return json({
        response_type: 'ephemeral',
        replace_original: false,
        text: ':hourglass_flowing_sand: Received — Nexus is applying your decision. The card will update in a moment.',
      });
    }

    // Twilio wants an empty 200 or TwiML; anything else appears as an error.
    if (kind === 'whatsapp') return new Response('', { status: 200 });

    return json({ ok: true, queued: true, duplicate: Boolean(stored.duplicate) });
  },

  /* Safety net. If the wake call failed — Render mid-deploy, network blip — the
     queue would sit until the next webhook. Five minutes is the longest anything
     should wait. Costs nothing on the free plan. */
  async scheduled(event, env, ctx) {
    wakeBackend(env, ctx);
  },
};
