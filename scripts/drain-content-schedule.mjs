/**
 * One-time drain of the retired content schedule queue.
 *
 *   node scripts/drain-content-schedule.mjs
 *
 * The scheduled-content pipeline (processDueScheduledContent / content_calendar)
 * is removed. This empties `cache/content-schedule.json` so no queued items
 * linger for a reader that no longer exists.
 */
import { putJsonCache } from '../backend/cloudflareR2.js';

try {
  await putJsonCache('cache/content-schedule.json', []);
  console.log('content-schedule.json drained to []');
} catch (e) {
  console.error('drain failed:', e.message);
  process.exit(1);
}
