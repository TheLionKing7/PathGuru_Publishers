/**
 * Shared HTTP helpers for PathGuru route modules.
 */

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function err(res, message, status = 500) {
  console.error('[PathGuru]', message);
  json(res, { error: message }, status);
}

/**
 * Parse a request body string into a plain object, branching on content-type.
 * - application/x-www-form-urlencoded → URLSearchParams (Twilio, forms)
 * - anything else                    → JSON.parse (with {} fallback)
 * The raw body is attached as a non-enumerable `_raw` property so signature
 * validators (Twilio HMAC, webhook HMAC) can read the exact bytes without it
 * leaking into JSON.stringify or iteration.
 */
export function parseBody(raw, contentType = '') {
  const text = typeof raw === 'string' ? raw : Buffer.from(raw || '').toString('utf8');
  const ct = String(contentType || '').toLowerCase();
  let parsed;
  if (ct.includes('application/x-www-form-urlencoded')) {
    parsed = Object.fromEntries(new URLSearchParams(text));
  } else {
    try { parsed = JSON.parse(text || '{}'); } catch { parsed = {}; }
  }
  Object.defineProperty(parsed, '_raw', { value: text, enumerable: false, writable: true, configurable: true });
  return parsed;
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(parseBody(Buffer.concat(chunks).toString('utf8'), req.headers['content-type'])));
    req.on('error', reject);
  });
}

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
