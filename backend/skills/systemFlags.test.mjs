/**
 * Run:  node backend/skills/systemFlags.test.mjs
 *
 * Verifies the global pause switch end to end at the module level:
 *   • isPaused() reads the flag and caches it for 15s
 *   • setPaused() writes the flag and invalidates the cache immediately
 *   • with the flag set, listApprovedDrafts() hands out nothing (approved draft
 *     is not sent) and drainWebhookQueue() dispatches nothing (inbound rows stay
 *     queued) — both log their suppression.
 *
 * No framework, no dependency, exits non-zero on failure.
 */

import { isPaused, setPaused, _invalidateCache } from './systemFlags.js';
import { listApprovedDrafts } from './inboundEmail.js';
import { drainWebhookQueue } from './webhookQueue.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

/* Minimal Supabase-like mock that only implements the system_flag surface the
   pause switch touches. Any other table is recorded in `calls.tables` so tests
   can assert a paused path never reached it. */
function makeFlagDb(initialFlag = false) {
  const state = { flag: initialFlag };
  const calls = { tables: [] };
  return {
    state,
    calls,
    from(table) {
      calls.tables.push(table);
      return {
        select() {
          return {
            eq(k, v) {
              return {
                async maybeSingle() {
                  if (table === 'system_flag' && k === 'key' && v === 'agents_paused') {
                    return { data: { key: v, value: state.flag }, error: null };
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
        async upsert(row, _opts) {
          if (table === 'system_flag') state.flag = !!row.value;
          return { error: null };
        },
      };
    },
    async rpc() {
      calls.tables.push('rpc');
      return { data: [], error: null };
    },
  };
}

async function captureLogs(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try { return { result: await fn(), logs }; }
  finally { console.log = orig; }
}

console.log('— isPaused / setPaused —');

_invalidateCache();
let db = makeFlagDb(false);
t('reads false when flag is false', await isPaused({ db }) === false);

_invalidateCache();
db = makeFlagDb(true);
t('reads true when flag is true', await isPaused({ db }) === true);

_invalidateCache();
db = makeFlagDb(false);
await isPaused({ db });
await isPaused({ db });
const systemFlagReads = db.calls.tables.filter((x) => x === 'system_flag').length;
t('caches for 15s (only one read for two calls)', systemFlagReads === 1);

_invalidateCache();
db = makeFlagDb(false);
const setResult = await setPaused(true, 'test', { db });
t('setPaused(true) reports paused', setResult.paused === true);
t('setPaused writes the flag row', db.state.flag === true);
t('cache invalidated immediately (isPaused true without re-read)', await isPaused({ db }) === true);

await setPaused(false, 'test', { db });
t('setPaused(false) resumes', db.state.flag === false && (await isPaused({ db })) === false);

console.log('— paused: approved draft is not sent —');

_invalidateCache();
db = makeFlagDb(true);
const { result: draftsRes, logs: draftsLogs } = await captureLogs(() => listApprovedDrafts(db));
t('listApprovedDrafts returns empty + paused', draftsRes.paused === true && Array.isArray(draftsRes.drafts) && draftsRes.drafts.length === 0);
t('outbound send suppressed in log', draftsLogs.some((l) => l.includes('[Paused] outbound email send suppressed')));
t('inbound_message never touched while paused', !db.calls.tables.includes('inbound_message'));

console.log('— paused: inbound webhook still queued (drain dispatches nothing) —');

_invalidateCache();
db = makeFlagDb(true);
const { result: drainRes, logs: drainLogs } = await captureLogs(() => drainWebhookQueue({ db }));
t('drain reports paused and drains nothing', drainRes.paused === true && drainRes.drained === 0 && drainRes.succeeded === 0);
t('queue dispatch suppressed in log', drainLogs.some((l) => l.includes('[Paused] webhook queue dispatch suppressed')));
t('webhook_queue never touched while paused', !db.calls.tables.includes('webhook_queue'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
