/**
 * Run:  node backend/skills/invariantAlerts.test.mjs
 *
 * Verifies the drain heartbeat is recorded, that invariant alerts include
 * identifying detail, and that each invariant only re-alerts when its
 * affected-identifier set changes.
 * No framework, no dependency, exits non-zero on failure.
 */
import { sweepInvariants, recordDrainAuthorised } from './invariantAlerts.js';
import { _invalidateCache } from './systemFlags.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

function makeDb(seed = {}) {
  const tables = {
    webhook_queue: [], tasks: [], inbound_message: [], invariant_state: [],
    ...seed,
  };
  function query(table, filters) {
    let rows = tables[table] || [];
    for (const [c, v] of Object.entries(filters.eq || {})) rows = rows.filter((r) => r[c] === v);
    for (const [c, iso] of Object.entries(filters.lt || {})) rows = rows.filter((r) => new Date(r[c]) < new Date(iso));
    return rows;
  }
  const builder = (table, filters) => ({
    eq(c, v) { filters.eq = { ...filters.eq, [c]: v }; return builder(table, filters); },
    lt(c, v) { filters.lt = { ...filters.lt, [c]: v }; return builder(table, filters); },
    order() { return builder(table, filters); },
    limit() { return builder(table, filters); },
    then(resolve) { resolve({ data: query(table, filters) }); },
    maybeSingle() { return Promise.resolve({ data: query(table, filters)[0] || null }); },
  });
  return {
    tables,
    from(table) {
      return {
        select() { return builder(table, {}); },
        async upsert(row) {
          tables[table] = tables[table] || [];
          const i = tables[table].findIndex((r) => r.key === row.key);
          if (i >= 0) tables[table][i] = { ...tables[table][i], ...row }; else tables[table].push(row);
          return { error: null };
        },
      };
    },
  };
}

const origFetch = globalThis.fetch;
const slackPosts = [];
process.env.SLACK_OPS_CHANNEL = 'C-OPS';
process.env.SLACK_BOT_TOKEN = 'xoxb-test';
globalThis.fetch = async (url, init) => {
  if (String(url).includes('slack.com/api/chat.postMessage')) {
    slackPosts.push(JSON.parse(init?.body || '{}').text || '');
    return { ok: true, status: 200, json: async () => ({ ok: true, ts: 'ts' }) };
  }
  return { ok: false, status: 500, json: async () => ({}) };
};

try {
  console.log('— heartbeat —');
  {
    const db = makeDb();
    await recordDrainAuthorised(db);
    t('heartbeat recorded', db.tables.invariant_state.some((r) => r.key === 'last_drain_authorised_at'));
  }

  console.log('— queue_failed reports detail and re-alerts only on set change —');
  {
    slackPosts.length = 0;
    const longErr = 'boom ' + 'x'.repeat(200) + ' tail';
    const db = makeDb({
      webhook_queue: [
        { id: 'w1', kind: 'slack', status: 'failed', last_error: longErr, created_at: '2024-01-01T00:00:00Z' },
        { id: 'w2', kind: 'whatsapp', status: 'failed', last_error: null, created_at: '2024-01-01T00:01:00Z' },
        { id: 'w3', kind: 'inbound_email', status: 'failed', last_error: 'err3', created_at: '2024-01-01T00:02:00Z' },
        { id: 'w4', kind: 'slack', status: 'failed', last_error: 'err4', created_at: '2024-01-01T00:03:00Z' },
      ],
      invariant_state: [{ key: 'last_drain_authorised_at', value: new Date().toISOString() }],
    });

    const r1 = await sweepInvariants({ db });
    t('alerts queue_failed', r1.alerted.includes('queue_failed'));
    t('exactly one alert', slackPosts.length === 1);
    const text1 = slackPosts[0] || '';
    t('includes kinds', ['slack', 'whatsapp', 'inbound_email'].every((k) => text1.includes(k)));
    t('includes row ids', ['w1', 'w2', 'w3'].every((id) => text1.includes(id)));
    t('includes last_error', text1.includes('boom'));
    t('truncates last_error to 120 chars', !text1.includes('tail'));
    t('reports +1 more beyond 3 rows', text1.includes('+1 more'));

    const r2 = await sweepInvariants({ db });
    t('same set suppressed', !r2.alerted.includes('queue_failed'));
    t('still one slack post', slackPosts.length === 1);

    // A new failed row changes the set → re-alert (with the higher count).
    db.tables.webhook_queue.push({ id: 'w5', kind: 'slack', status: 'failed', last_error: 'err5', created_at: '2024-01-01T00:04:00Z' });
    const r3 = await sweepInvariants({ db });
    t('new failed row re-alerts', r3.alerted.includes('queue_failed'));
    t('second slack post', slackPosts.length === 2);
    t('second alert reflects higher count', (slackPosts[1] || '').includes('5 failed row(s)'));
  }

  console.log('— approval_stale reports subject, age, and set changes —');
  {
    slackPosts.length = 0;
    const db = makeDb({
      tasks: [
        { id: 'approval-1', type: 'pending_approval', status: 'pending', input: { subject: 'Approve homepage launch' }, title: '[APPROVAL] fallback', created_at: '2023-12-31T00:00:00Z' },
      ],
      invariant_state: [{ key: 'last_drain_authorised_at', value: '2024-01-03T00:00:00.000Z' }],
    });
    const now = new Date('2024-01-02T12:00:00.000Z');
    const r1 = await sweepInvariants({ db, now });
    t('alerts stale approval', r1.alerted.includes('approval_stale'));
    t('approval alert names subject', (slackPosts[0] || '').includes('Approve homepage launch'));
    t('approval alert names wait', (slackPosts[0] || '').includes('waiting 2d 12h'));

    const r2 = await sweepInvariants({ db, now: new Date(now.getTime() + 60 * 60 * 1000) });
    t('unchanged approval suppressed', !r2.alerted.includes('approval_stale') && slackPosts.length === 1);

    db.tables.tasks.push({ id: 'approval-2', type: 'pending_approval', status: 'pending', input: { subject: 'Approve pricing page' }, title: '[APPROVAL] fallback', created_at: '2023-12-31T00:00:00Z' });
    const r3 = await sweepInvariants({ db, now: new Date(now.getTime() + 2 * 60 * 60 * 1000) });
    t('new approval re-alerts', r3.alerted.includes('approval_stale'));
    t('new approval appears in alert', (slackPosts[1] || '').includes('Approve pricing page'));

    db.tables.tasks = [];
    await sweepInvariants({ db, now: new Date(now.getTime() + 3 * 60 * 60 * 1000) });
    db.tables.tasks.push({ id: 'approval-1', type: 'pending_approval', status: 'pending', input: { subject: 'Approve homepage launch' }, title: '[APPROVAL] fallback', created_at: '2023-12-31T00:00:00Z' });
    const r4 = await sweepInvariants({ db, now: new Date(now.getTime() + 4 * 60 * 60 * 1000) });
    t('resolved approval can alert again', r4.alerted.includes('approval_stale'));
  }

  console.log('— drain_stale alerts when never recorded —');
  {
    slackPosts.length = 0;
    const db = makeDb({});
    const r = await sweepInvariants({ db });
    t('alerts drain_stale', r.alerted.includes('drain_stale'));
    t('slack posted', slackPosts.length === 1);
  }

  console.log('— paused: notice still posts, but a backlog is no longer excused —');
  {
    slackPosts.length = 0;
    const db = makeDb({
      system_flag: [{ key: 'agents_paused', value: true }],
      webhook_queue: [
        { id: 'pending-1', status: 'pending', created_at: '2024-01-01T00:00:00Z' },
        { id: 'pending-2', status: 'pending', created_at: '2024-01-01T00:01:00Z' },
      ],
    });
    _invalidateCache();
    const now = new Date('2024-01-01T01:00:00Z');
    const r1 = await sweepInvariants({ db, now });
    t('paused notice posted, and says which half is stopped',
      slackPosts[0] === 'System paused — outbound sends are held. Inbound is still being captured; 2 row(s) pending.');

    /* These two rows are an hour old and still pending. That used to be
       "expected while paused" and was silenced. It is not expected any more:
       the drain dispatches while paused, so a row sitting for an hour means
       something is stuck, and the alert must fire. This is the assertion that
       would have named the prospect reply nobody saw. */
    t('pending invariant fires even while paused', r1.alerted.includes('queue_pending'));
    t('drain invariant still suppressed while paused', !r1.alerted.includes('drain_stale'));

    await sweepInvariants({ db, now: new Date(now.getTime() + 5 * 60 * 60 * 1000) });
    t('paused notice itself stays on its six-hour cooldown',
      slackPosts.filter((p) => String(p).startsWith('System paused')).length === 1);
  }
} finally {
  globalThis.fetch = origFetch;
  delete process.env.SLACK_OPS_CHANNEL;
  delete process.env.SLACK_BOT_TOKEN;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
