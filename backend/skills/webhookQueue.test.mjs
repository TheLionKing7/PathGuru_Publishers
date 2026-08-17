/**
 * Run:  node backend/skills/webhookQueue.test.mjs
 *
 * Verifies the drain-route HMAC (same scheme as the outbound routes) and that the
 * atomic conditional claim prevents two concurrent drains from double-processing
 * the same row.
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import { createHmac } from 'node:crypto';
import { verifyOutboundSignature } from './inboundEmail.js';
import { claimRow, reapStaleWebhooks } from './webhookQueue.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

console.log('— drain HMAC (<timestamp>.POST./api/queue/drain) —');
process.env.INBOUND_WEBHOOK_SECRET = 'drain-secret';
const ts = Math.floor(Date.now() / 1000);
const sig = createHmac('sha256', 'drain-secret').update(`${ts}.POST./api/queue/drain`).digest('hex');

t('valid signature accepted', verifyOutboundSignature({ timestamp: String(ts), signature: sig, method: 'POST', path: '/api/queue/drain' }));
t('wrong signature rejected', !verifyOutboundSignature({ timestamp: String(ts), signature: 'deadbeef', method: 'POST', path: '/api/queue/drain' }));
t('stale timestamp rejected', !verifyOutboundSignature({ timestamp: String(ts - 600), signature: sig, method: 'POST', path: '/api/queue/drain' }));
t('wrong method rejected', !verifyOutboundSignature({ timestamp: String(ts), signature: sig, method: 'GET', path: '/api/queue/drain' }));

const savedSecret = process.env.INBOUND_WEBHOOK_SECRET;
delete process.env.INBOUND_WEBHOOK_SECRET;
t('no secret → rejected (fails closed)', !verifyOutboundSignature({ timestamp: String(ts), signature: sig, method: 'POST', path: '/api/queue/drain' }));
process.env.INBOUND_WEBHOOK_SECRET = savedSecret;

console.log('— conditional claim (no double-processing) —');
// Minimal Supabase-like fluent mock: update(...).eq('id',v).eq('status',v2).select()
// only matches (and mutates) a row when its status still equals the condition.
function makeClaimDb(store) {
  return {
    from() {
      return {
        update(patch) {
          return {
            eq(key, value) {
              return {
                eq(key2, value2) {
                  return {
                    async select() {
                      const row = store.get(value);
                      if (!row || row[key2] !== value2) return { data: [] };
                      Object.assign(row, patch);
                      return { data: [row] };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

const store = new Map([['r1', { id: 'r1', status: 'pending', attempts: 0 }]]);
const db = makeClaimDb(store);
const now = new Date().toISOString();

const first = await claimRow(db, { id: 'r1', status: 'pending', attempts: 0 }, now);
t('first claim wins (status → claimed)', first && first.status === 'claimed' && first.claimed_at === now && first.attempts === 1);

const second = await claimRow(db, { id: 'r1', status: 'claimed', attempts: 0 }, now);
t('second claim loses (0 rows → null)', second === null);

t('attempts not double-incremented', store.get('r1').attempts === 1);

console.log('— reaper (stale claimed → failed at attempts cap) —');
function makeReapDb(store) {
  return {
    from() {
      return {
        select() {
          return {
            eq(key, value) {
              return {
                lt(key2, value2) {
                  return {
                    async limit(n) {
                      const rows = [...store.values()]
                        .filter((r) => r[key] === value && new Date(r[key2]) < new Date(value2))
                        .slice(0, n);
                      return { data: rows };
                    },
                  };
                },
              };
            },
          };
        },
        update(patch) {
          return {
            async in(key, ids) {
              for (const id of ids) {
                const r = store.get(id);
                if (r) Object.assign(r, patch);
              }
              return { data: null, error: null };
            },
          };
        },
      };
    },
  };
}

const reapStore = new Map([
  ['a', { id: 'a', attempts: 5, status: 'claimed', claimed_at: '2020-01-01T00:00:00Z' }],
  ['b', { id: 'b', attempts: 2, status: 'claimed', claimed_at: '2020-01-01T00:00:00Z' }],
]);
const reapDb = makeReapDb(reapStore);
const reap = await reapStaleWebhooks({ db: reapDb, olderThanMinutes: 5 });
t('attempts-5 row failed, attempts-2 row requeued', reap.failed === 1 && reap.requeued === 1);
t('failed row parked with last_error', reapStore.get('a').status === 'failed' && reapStore.get('a').last_error === 'abandoned while claimed');
t('requeued row back to pending, claim cleared', reapStore.get('b').status === 'pending' && reapStore.get('b').claimed_at === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
