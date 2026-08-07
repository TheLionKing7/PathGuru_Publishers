/**
 * rateLimit — a per-IP token bucket for the endpoints a stranger can reach.
 *
 * WHY THIS EXISTS
 * /api/agents/assistant/chat is public by necessity: a visitor on digitafusion.com
 * has no operator session and never will. It also puts visitor text straight into a
 * model call we pay for. Public plus metered plus unauthenticated is the exact
 * combination that funds someone else's weekend project out of our API budget, and
 * a single script can do it from one laptop.
 *
 * HONEST LIMITS — read before relying on this
 * This is IN-PROCESS. State lives in a Map in one Node process, which means:
 *   · it resets on deploy or restart;
 *   · it does not coordinate across instances — two instances means two buckets and
 *     effectively double the limit;
 *   · it is a cost-control and abuse-slowing measure, NOT a security boundary.
 * That is a deliberate trade. The alternative is a Redis round trip on every public
 * request, and this server has no Redis client. If PathGuru is ever scaled past one
 * instance, move the bucket to Redis and keep this interface — the call sites in
 * server.js should not have to change.
 *
 * IP ATTRIBUTION AND ITS TRUST ASSUMPTION
 * `x-forwarded-for` is client-controlled and trivially spoofed unless a proxy you
 * control rewrites it. Behind Render/Cloudflare the leftmost entry is the real client
 * and the header is sanitised for you. Deployed naked to the internet it is a lie,
 * and this limiter degrades to approximately useless. We take the leftmost and say so
 * rather than pretending otherwise.
 */

/** Buckets, keyed `${bucket}:${ip}`. Value: { tokens, resetAt }. */
const buckets = new Map();

/** Hard cap on distinct keys. A limiter that grows without bound is a memory leak
 *  wearing a security hat, and an attacker rotating source IPs is exactly how you
 *  find that out. At the cap we sweep, and if still full we stop admitting new keys
 *  to the map and fail OPEN for them — see the note in `check`. */
const MAX_KEYS = 20_000;

/** Policies, per bucket. `windowMs` is a fixed window, not a sliding one — simpler,
 *  and the imprecision at the boundary does not matter at these volumes. */
export const POLICIES = {
  // Each chat turn is a model call we pay for. This is the one that matters.
  chat:   { limit: 20, windowMs: 5 * 60_000 },
  // Cheap writes, but they create rows. Looser.
  lead:   { limit: 30, windowMs: 5 * 60_000 },
  intake: { limit: 30, windowMs: 5 * 60_000 },
};

export function clientIp(req) {
  const xff = String(req?.headers?.['x-forwarded-for'] || '');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  return (
    req?.headers?.['x-real-ip'] ||
    req?.socket?.remoteAddress ||
    'unknown'
  );
}

function sweep(now) {
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Consume one token.
 * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number, limit: number }}
 */
export function check(bucketName, ip, now = Date.now()) {
  const policy = POLICIES[bucketName];
  // Unknown bucket: fail open. A typo in a route name must not take the site down.
  if (!policy) return { allowed: true, remaining: Infinity, retryAfterSec: 0, limit: Infinity };

  const key = `${bucketName}:${ip}`;
  let b = buckets.get(key);

  if (!b || b.resetAt <= now) {
    if (!buckets.has(key) && buckets.size >= MAX_KEYS) {
      sweep(now);
      // Still full after a sweep: we are under a rotating-IP flood. Admitting more
      // keys would exhaust memory, which is a worse outcome than letting these
      // requests through — the model-call cost is bounded by the provider's own
      // limits, an OOM is not. Fail open, loudly.
      if (buckets.size >= MAX_KEYS) {
        console.error('[rateLimit] key table full — failing open', { size: buckets.size, bucketName });
        return { allowed: true, remaining: 0, retryAfterSec: 0, limit: policy.limit };
      }
    }
    b = { tokens: policy.limit, resetAt: now + policy.windowMs };
    buckets.set(key, b);
  }

  if (b.tokens <= 0) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      limit: policy.limit,
    };
  }

  b.tokens -= 1;
  return { allowed: true, remaining: b.tokens, retryAfterSec: 0, limit: policy.limit };
}

/**
 * Express-less helper: enforce and, if over, write the 429 and return true.
 * Returns true when the caller should stop handling the request.
 */
export function enforce(bucketName, req, res) {
  const ip = clientIp(req);
  const r = check(bucketName, ip);

  res.setHeader('X-RateLimit-Limit', String(r.limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, r.remaining)));

  if (r.allowed) return false;

  console.warn('[rateLimit] 429', JSON.stringify({ bucket: bucketName, ip, retryAfterSec: r.retryAfterSec }));
  res.setHeader('Retry-After', String(r.retryAfterSec));
  res.writeHead(429, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Too many requests. Please slow down.',
    retryAfterSec: r.retryAfterSec,
  }));
  return true;
}

/** Test seam. */
export function _reset() { buckets.clear(); }
export function _size() { return buckets.size; }
