/**
 * Optional auth for external cron / UptimeRobot CEO triggers.
 * Set CRON_SECRET on Render — pass via header or query on scheduled calls.
 *
 *   Authorization: Bearer <CRON_SECRET>
 *   x-cron-secret: <CRON_SECRET>
 *   ?secret=<CRON_SECRET>   (for simple cron-job.org GET monitors)
 *
 * If CRON_SECRET is unset, routes remain open (local dev / manual POST from console).
 */

function readSecretFromRequest(req, url) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const header = req.headers['x-cron-secret'];
  if (header) return String(header).trim();
  return url.searchParams.get('secret') || '';
}

export function isCronAuthRequired() {
  return Boolean((process.env.CRON_SECRET || '').trim());
}

/** @returns {boolean} true if request may proceed */
export function verifyCronAuth(req, url) {
  const expected = (process.env.CRON_SECRET || '').trim();
  if (!expected) return true;
  return readSecretFromRequest(req, url) === expected;
}

export function cronAuthFail(res, errFn) {
  errFn(res, 'Unauthorized — invalid or missing CRON_SECRET', 401);
}
