/**
 * PathGuru → DigiFusion CMS Client
 *
 * Thin fetch wrapper around all /api/cms/* endpoints on DigiFusion.
 * Reads DIGIFUSION_API_URL and DIGIFUSION_CMS_TOKEN from process.env.
 *
 * All methods return the parsed JSON body on success.
 * On failure they throw an Error with a descriptive message.
 *
 * Retries: 5xx responses are retried up to 2 extra times with
 * exponential back-off (500 ms, 1000 ms) before throwing.
 */

const BASE  = (process.env.DIGIFUSION_API_URL  || '').replace(/\/$/, '');
const TOKEN = process.env.DIGIFUSION_CMS_TOKEN || '';

/* ── Core request helper ─────────────────────────────────── */
async function cmsRequest (method, path, body, retries = 2) {
  if (!BASE)  throw new Error('DIGIFUSION_API_URL is not configured in .env');
  if (!TOKEN) throw new Error('DIGIFUSION_CMS_TOKEN is not configured in .env');

  const url  = `${BASE}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res  = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));

      // Retry on 5xx (server-side transient errors)
      if (res.status >= 500 && attempt < retries) {
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }

      if (!res.ok) {
        const msg = data?.error || data?.message || `CMS API returned ${res.status}`;
        const e   = new Error(msg);
        e.status  = res.status;
        e.code    = data?.code;
        throw e;
      }

      return data; // { ok: true, data: ... }
    } catch (e) {
      lastErr = e;
      // Retry on network-level errors only
      if (attempt < retries && !e.status) {
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function sleep (ms) { return new Promise(r => setTimeout(r, ms)); }

/* ══════════════════════════════════════════════════════════
   POSTS  — /api/cms/posts
══════════════════════════════════════════════════════════ */

/**
 * Upsert a blog post by slug (create or update).
 * @param {object} post — must include `slug` and `title`
 */
export async function upsertPost (post) {
  return cmsRequest('POST', '/api/cms/posts', post);
}

/**
 * Get a single post by slug.
 */
export async function getPost (slug) {
  return cmsRequest('GET', `/api/cms/posts/${encodeURIComponent(slug)}`);
}

/**
 * List posts with optional filters.
 * @param {object} params — { status, post_type, page, per_page }
 */
export async function listPosts (params = {}) {
  const qs = new URLSearchParams(params).toString();
  return cmsRequest('GET', `/api/cms/posts${qs ? `?${qs}` : ''}`);
}

/**
 * Soft-delete (archive) a post by slug.
 */
export async function archivePost (slug) {
  return cmsRequest('DELETE', `/api/cms/posts/${encodeURIComponent(slug)}`);
}

/* ══════════════════════════════════════════════════════════
   PRODUCTS  — /api/cms/products
══════════════════════════════════════════════════════════ */

/**
 * List products.
 * @param {object} params — { type, active, page, per_page }
 */
export async function listProducts (params = {}) {
  const qs = new URLSearchParams(params).toString();
  return cmsRequest('GET', `/api/cms/products${qs ? `?${qs}` : ''}`);
}

/**
 * Create a new product.
 */
export async function createProduct (product) {
  return cmsRequest('POST', '/api/cms/products', product);
}

/**
 * Partially update a product (PATCH semantics over PUT).
 * @param {string} id — product UUID
 * @param {object} patch — fields to update
 */
export async function updateProduct (id, patch) {
  return cmsRequest('PUT', `/api/cms/products/${id}`, patch);
}

/* ══════════════════════════════════════════════════════════
   ORDERS  — /api/cms/orders
══════════════════════════════════════════════════════════ */

/**
 * List orders with optional filters.
 * @param {object} params — { status, gateway, from, to, page, per_page }
 */
export async function listOrders (params = {}) {
  const qs = new URLSearchParams(params).toString();
  return cmsRequest('GET', `/api/cms/orders${qs ? `?${qs}` : ''}`);
}

/**
 * Mark an order as paid and trigger fulfillment.
 */
export async function markOrderPaid (id) {
  return cmsRequest('POST', `/api/cms/orders/${id}/mark-paid`);
}

/**
 * Initiate a refund for an order.
 * @param {string} id — order UUID
 * @param {object} body — { reason? }
 */
export async function refundOrder (id, body = {}) {
  return cmsRequest('POST', `/api/cms/orders/${id}/refund`, body);
}

/* ══════════════════════════════════════════════════════════
   SUBSCRIPTIONS  — /api/cms/subscriptions
══════════════════════════════════════════════════════════ */

/**
 * Get active subscriptions with MRR and churn data.
 */
export async function getSubscriptions () {
  return cmsRequest('GET', '/api/cms/subscriptions');
}

/* ══════════════════════════════════════════════════════════
   BOOKINGS  — /api/cms/bookings
══════════════════════════════════════════════════════════ */

/**
 * List service bookings.
 * @param {object} params — { status, page, per_page }
 */
export async function listBookings (params = {}) {
  const qs = new URLSearchParams(params).toString();
  return cmsRequest('GET', `/api/cms/bookings${qs ? `?${qs}` : ''}`);
}

/* ══════════════════════════════════════════════════════════
   ANALYTICS  — /api/cms/analytics
══════════════════════════════════════════════════════════ */

/**
 * Get revenue and order analytics.
 * @param {'7d'|'30d'|'90d'} range
 */
export async function getAnalytics (range = '30d') {
  return cmsRequest('GET', `/api/cms/analytics?range=${range}`);
}

/* ══════════════════════════════════════════════════════════
   SETTINGS  — /api/cms/settings/*
══════════════════════════════════════════════════════════ */

/**
 * Save Terms & Conditions content.
 * @param {string} content — markdown or HTML string
 */
export async function saveTerms (content) {
  return cmsRequest('PUT', '/api/cms/settings/terms', { content });
}

/**
 * Save shipping rules.
 * @param {object} payload — { rules, free_threshold_usd, notes }
 */
export async function saveShipping (payload) {
  return cmsRequest('PUT', '/api/cms/settings/shipping', payload);
}
