/**
 * Operator authentication for the PathGuru API.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Until this was written, every route on this server was open. `GET
 * /api/frictioniq/sessions` returned prospect names, emails, organisations and
 * countries to anyone who asked, and `cors()` sent `Access-Control-Allow-Origin: *`
 * on every response — which meant any website on the internet could read the
 * register out of a visitor's browser. The same was true of /api/clients,
 * /api/invoices, /api/purchases, /api/agents/leads and about a hundred others.
 *
 * The model here is the one already used on digitafusion.com/fiq, deliberately,
 * so there is one mental model across the estate rather than two:
 *
 *   FAIL CLOSED. No password configured means nobody gets in — never that
 *   everybody does. An unconfigured gate that defaults to open is not a gate;
 *   it is a comment.
 *
 *   DENY BY DEFAULT. Everything under /api/ requires an operator session
 *   unless it appears in PUBLIC_PATHS below. A new route added next month is
 *   protected the moment it is written, without anyone remembering to protect
 *   it. The opposite arrangement — gate a list of sensitive routes — fails on
 *   the first route somebody forgets, and that route is always the interesting
 *   one.
 *
 *   THE SIGNING KEY IS DERIVED FROM THE PASSWORD BY DEFAULT. So changing the
 *   password signs every live session out immediately. Set
 *   PATHGURU_OPERATOR_SECRET separately only if you want to rotate one without
 *   the other.
 *
 * ── TWO WAYS IN ───────────────────────────────────────────────────────────
 *
 *   A signed httpOnly cookie, for a human at the console. Set by POST
 *   /api/auth/login and carried automatically thereafter.
 *
 *   A bearer token, for machines — scripts, the storefront's server-side
 *   calls, anything without a cookie jar. PATHGURU_OPERATOR_TOKEN is compared
 *   in constant time.
 *
 * ── WHAT THIS DOES NOT DO ─────────────────────────────────────────────────
 *
 * It does not touch /api/cron/*. Those already have their own gate in
 * cronAuth.js, driven by CRON_SECRET, and layering a second mechanism over
 * them would break every external scheduler the moment this deployed. Cron
 * security is a CRON_SECRET problem and it stays one — but note the warning
 * this module prints at boot when that secret is missing.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const COOKIE = 'pg_operator';

/* ── Configuration ─────────────────────────────────────────────────────── */

function password() {
  return (process.env.PATHGURU_OPERATOR_PASSWORD || '').trim();
}

function bearerToken() {
  return (process.env.PATHGURU_OPERATOR_TOKEN || '').trim();
}

/**
 * The signing key. Derived from the password unless one is set explicitly,
 * so that rotating the password invalidates every outstanding session — which
 * is what an operator changing a password almost always means.
 */
function signingSecret() {
  return (process.env.PATHGURU_OPERATOR_SECRET || '').trim() || password() || null;
}

function sessionHours() {
  const n = Number(process.env.PATHGURU_SESSION_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 12;
}

export function isOperatorAuthConfigured() {
  return Boolean(password() || bearerToken());
}

/* ── Constant-time comparison ──────────────────────────────────────────── */

/**
 * Compare two strings without leaking their length or content through timing.
 *
 * timingSafeEqual throws on length mismatch, which would itself be an oracle,
 * so both sides are hashed under a per-call random salt first. Equal-length
 * digests, no length leak, and the salt means the digests are useless to an
 * attacker who somehow observes them.
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const salt = randomBytes(16);
  const ha = createHmac('sha256', salt).update(a).digest();
  const hb = createHmac('sha256', salt).update(b).digest();
  return timingSafeEqual(ha, hb);
}

/* ── Session tokens ────────────────────────────────────────────────────── */

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** `<expiryMs>.<nonce>.<hmac>` — opaque to the client, verifiable by us. */
export function issueSession() {
  const secret = signingSecret();
  if (!secret) return null;
  const expires = Date.now() + sessionHours() * 3600 * 1000;
  const nonce = b64u(randomBytes(9));
  const body = `${expires}.${nonce}`;
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(token) {
  const secret = signingSecret();
  if (!secret || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [expires, nonce, mac] = parts;
  if (!safeEqual(mac, sign(`${expires}.${nonce}`, secret))) return false;

  // Expiry is checked AFTER the signature, so an unsigned token can never
  // reach this line and tell us anything by how long it took to reject.
  const exp = Number(expires);
  return Number.isFinite(exp) && exp > Date.now();
}

/* ── Reading the request ───────────────────────────────────────────────── */

function cookieValue(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/** @returns {boolean} true if this request carries valid operator credentials */
export function verifyOperator(req) {
  if (!isOperatorAuthConfigured()) return false; // fail closed

  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const tok = bearerToken();
    if (tok && safeEqual(auth.slice(7).trim(), tok)) return true;
  }

  const cookie = cookieValue(req, COOKIE);
  return cookie ? verifySession(cookie) : false;
}

export function checkPassword(candidate) {
  const expected = password();
  return Boolean(expected) && safeEqual(String(candidate ?? ''), expected);
}

/* ── Cookies ───────────────────────────────────────────────────────────── */

/**
 * Secure is set only when the request arrived over TLS. On Render that is
 * signalled by x-forwarded-proto, since the app itself speaks plain HTTP
 * behind the proxy. Setting Secure unconditionally would make the cookie
 * unusable on http://localhost:8787 and lock you out of your own dev console.
 */
function isHttps(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https';
}

export function setSessionCookie(res, req, token) {
  const attrs = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${sessionHours() * 3600}`,
  ];
  if (isHttps(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(res, req) {
  const attrs = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

/* ── The public allowlist ──────────────────────────────────────────────── */

/**
 * Everything not listed here, under /api/, needs an operator.
 *
 * Each entry earns its place; if you add one, write down why beside it. The
 * cost of a wrong entry is a public endpoint nobody remembers making public.
 */
const PUBLIC_EXACT = new Set([
  '/ping',                    // uptime monitors
  '/health',                  // Render dashboard
  '/api/cron/ping',           // uptime monitors
  '/api/platform',            // webapp boot — product config, no PII
  '/api/platform/config',     // ditto
  '/api/auth/login',          // the door itself
  '/api/auth/logout',
  '/api/auth/status',
  // The storefront's agent-status widget calls this from the browser via
  // NEXT_PUBLIC_PATHGURU_API. It returns a roster and health flags, no PII,
  // and digitafusion.com falls back to mock data when it fails — but gating it
  // would silently degrade a live page, so it stays public deliberately.
  '/api/agents/status',
  // ── Aria, the storefront chat ──────────────────────────────────────────
  // These three are called from digitafusion.com by a visitor's browser. The
  // visitor has no operator session and must never be asked for one, so they are
  // public by necessity rather than by preference.
  //
  // They were MISSED when deny-by-default auth landed, which silently 401'd every
  // conversation on the public site. The lesson is worth keeping: adding
  // deny-by-default to a server means enumerating every browser-reached endpoint,
  // and the storefront's endpoints do not live in this repository, so grepping
  // this codebase for callers finds nothing. Check the storefront too.
  //
  // Public does NOT mean unprotected. These carry visitor input into a model, so
  // they need their own rate limit and an output guard — see assistantGuard.js.
  '/api/agents/assistant/chat',
  '/api/agents/assistant/lead',
  '/api/agents/assistant/intake',
  // Public actions reached from links in outbound email. The recipient has no
  // operator session and never will; the token in the payload is the credential.
  '/api/newsletter/subscribe',
  '/api/newsletter/unsubscribe',
  '/api/nps/respond',
  // Third-party callbacks. These carry their own verification and are called
  // by Meta / Calendly / the ERP, none of which can hold a cookie.
  '/api/webhooks/whatsapp',
  '/api/webhooks/whatsapp/',
  '/api/webhooks/erp',
  '/api/webhooks/inbound-email',
  '/api/webhooks/slack',
  '/api/queue/drain',
  // Outbound Make routes self-authenticate (HMAC or bearer) via verifyOutboundAuth.
  '/api/outbound/approved',
  '/api/bookings/calendly-webhook',
]);

const PUBLIC_PREFIXES = [
  '/api/cron/',      // gated separately by cronAuth.js — see the header note
  '/api/outbound/',  // /api/outbound/:id/sent self-authenticates via verifyOutboundAuth
];

export function isPublicPath(path) {
  if (!path.startsWith('/api/')) return true;   // static assets and the webapp shell
  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

export function operatorAuthFail(res, errFn) {
  if (!isOperatorAuthConfigured()) {
    errFn(res, 'Operator auth is not configured. Set PATHGURU_OPERATOR_PASSWORD.', 503);
    return;
  }
  errFn(res, 'Unauthorized — operator session required', 401);
}

/* ── CORS ──────────────────────────────────────────────────────────────── */

/**
 * An origin allowlist, replacing `Access-Control-Allow-Origin: *`.
 *
 * The wildcard and credentialed requests are mutually exclusive by
 * specification, which is the browser telling you something true: an API that
 * carries a session cookie must know exactly who is allowed to call it.
 */
function allowedOrigins() {
  const fromEnv = (process.env.PATHGURU_ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  return [
    'http://localhost:3000',
    'http://localhost:8787',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8787',
    'https://digitafusion.com',
    'https://www.digitafusion.com',
  ];
}

export function applyCors(req, res) {
  const origin = String(req.headers.origin || '').replace(/\/$/, '');

  // Vary regardless of outcome: caches must not serve one origin's response
  // to another.
  res.setHeader('Vary', 'Origin');

  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  // No Origin header at all means a same-origin or non-browser request. Those
  // need no CORS headers, and adding them would only widen the surface.

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-secret');
  res.setHeader('Access-Control-Max-Age', '600');
}

/* ── Boot-time reporting ───────────────────────────────────────────────── */

export function logOperatorAuthStatus() {
  if (password()) {
    console.log('[Auth] PATHGURU_OPERATOR_PASSWORD set — /api/* requires an operator session');
  } else if (bearerToken()) {
    console.log('[Auth] Bearer token only — no console login is possible until PATHGURU_OPERATOR_PASSWORD is set');
  } else {
    console.error(
      '[Auth] NO OPERATOR AUTH CONFIGURED — every protected /api/* route will return 503.\n' +
      '       Set PATHGURU_OPERATOR_PASSWORD (24+ random characters) to open the console.\n' +
      '       This is the correct failure: the register holds prospect names, emails and phone numbers.'
    );
  }
  const origins = (process.env.PATHGURU_ALLOWED_ORIGINS || '').trim();
  console.log(`[Auth] CORS origins: ${origins || 'defaults (localhost + digitafusion.com)'}`);
}
