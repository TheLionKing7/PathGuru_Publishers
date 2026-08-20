/**
 * Run:  node backend/skills/outboundRate.test.mjs
 *
 * Verifies the hard outbound rate cap (defence in depth on top of 0031):
 *   • a recipient with a recent send is refused a second hand-out
 *   • two drafts to the same address in one run → the second is send_blocked
 *     and the refusal is logged
 *   • a confirmed send is recorded, and a blocked send raises a Slack notice
 *     (never silently dropped)
 *
 * No framework, no dependency, exits non-zero on failure.
 */

import {
  MAX_SENDS_PER_RECIPIENT_PER_DAY,
  countRecipientSends,
  recordSend,
  blockOutboundDraft,
} from './outboundRate.js';
import { listApprovedDrafts } from './inboundEmail.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

/* Minimal Supabase-like mock for the surfaces the rate cap touches. */
function makeDb({ drafts = [], sendLog = [] } = {}) {
  const state = {
    sendLog: sendLog.map((s, i) => ({
      id:                 s.id || ('log-' + i),
      to_addr:            s.to_addr,
      inbound_message_id: s.inbound_message_id ?? null,
      sent_at:            s.sent_at || new Date().toISOString(),
    })),
    blocked: [],   // draft ids marked send_blocked
  };

  return {
    state,

    from(table) {
      return {
        update(patch) {
          return {
            eq(k, v) {
              if (table === 'inbound_message' && patch.status === 'send_blocked') {
                state.blocked.push({ id: v, patch });
              }
              return {
                is()    { return this; },
                gte()   { return this; },
                lt()    { return this; },
                async select() { return { data: [], error: null }; },
                then(resolve)  { resolve({ data: [], error: null }); },
              };
            },
          };
        },

        select() {
          return {
            eq(k, v) {
              return {
                gte(k2, v2) {
                  return Promise.resolve({
                    data: table === 'outbound_send_log'
                      ? state.sendLog
                          .filter((r) => r[k] === v && r[k2] >= v2)
                          .map((r) => ({ id: r.id }))
                      : [],
                    error: null,
                  });
                },
                maybeSingle() {
                  if (table === 'system_flag') {
                    return Promise.resolve({ data: { key: v, value: false }, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },

        async insert(row) {
          if (table === 'outbound_send_log') {
            state.sendLog.push({
              id:                 'log-' + state.sendLog.length,
              to_addr:            row.to_addr,
              inbound_message_id: row.inbound_message_id ?? null,
              sent_at:            row.sent_at || new Date().toISOString(),
            });
          }
          return { error: null };
        },
      };
    },

    async rpc(fn) {
      if (fn === 'claim_outbound_drafts') return { data: drafts, error: null };
      return { data: [], error: null };
    },
  };
}

async function captureOutput(fn) {
  const out = [];
  const origLog  = console.log;
  const origWarn = console.warn;
  console.log  = (...a) => out.push(['log',  ...a].join(' '));
  console.warn = (...a) => out.push(['warn', ...a].join(' '));
  try { return { result: await fn(), out }; }
  finally { console.log = origLog; console.warn = origWarn; }
}

console.log('— cap constant —');
t('MAX_SENDS_PER_RECIPIENT_PER_DAY is 1 (not config)', MAX_SENDS_PER_RECIPIENT_PER_DAY === 1);

console.log('— send log records + counts —');
{
  const db = makeDb();
  await recordSend(db, { toAddr: 'prospect@example.com', inboundMessageId: 'm1' });
  t('recordSend writes a row', db.state.sendLog.length === 1 && db.state.sendLog[0].to_addr === 'prospect@example.com');
  t('countRecipientSends sees it', (await countRecipientSends(db, 'prospect@example.com')) === 1);
  t('countRecipientSends ignores other addresses', (await countRecipientSends(db, 'other@example.com')) === 0);
}

console.log('— two sends to the same address in one run —');
{
  const drafts = [
    { id: 'd1', from_addr: 'Prospect <prospect@example.com>', to_addr: 'hello@digifusion.com' },
    { id: 'd2', from_addr: 'prospect@example.com',            to_addr: 'hello@digifusion.com' },
  ];
  const db = makeDb({ drafts });
  const { result, out } = await captureOutput(() => listApprovedDrafts(db));

  t('first handed out, second refused', result.drafts.length === 1 && result.drafts[0].id === 'd1' && result.blocked === 1);
  t('second marked send_blocked', db.state.blocked.some((b) => b.id === 'd2' && b.patch.status === 'send_blocked'));
  t('refusal logged', out.some((l) => l.includes('[Outbound] rate cap: prospect@example.com already received mail in the last 24h')));
}

console.log('— cross-run: a recorded send blocks the next hand-out —');
{
  const db = makeDb({
    drafts: [{ id: 'd3', from_addr: 'prospect@example.com' }],
    sendLog: [{ to_addr: 'prospect@example.com' }],
  });
  const { result } = await captureOutput(() => listApprovedDrafts(db));
  t('blocked by prior 24h send', result.drafts.length === 0 && result.blocked === 1);
  t('marked send_blocked', db.state.blocked.some((b) => b.id === 'd3'));
}

console.log('— blocked send raises a Slack notice (never silent) —');
{
  process.env.SLACK_BOT_TOKEN = 'xoxb-test';
  process.env.SLACK_OPS_CHANNEL = 'C01234';
  let captured = null;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true, json: async () => ({ ok: true, ts: 'TS123' }) }; };
  try {
    const db = makeDb();
    await blockOutboundDraft(db, { id: 'dX' }, { toAddr: 'prospect@example.com', reason: 'rate cap' });
  } finally {
    globalThis.fetch = origFetch;
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_OPS_CHANNEL;
  }
  t('Slack bot post called', !!captured && captured.url === 'https://slack.com/api/chat.postMessage');
  t('notice mentions the block', !!captured && JSON.parse(captured.opts.body).text.includes('Outbound blocked'));
}

{
  const db = makeDb();
  const { out } = await captureOutput(() => blockOutboundDraft(db, { id: 'dY' }, { toAddr: 'prospect@example.com', reason: 'rate cap' }));
  t('missing channel logged loudly, never silent', out.some((l) => l.includes('blocked-send Slack notice skipped')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

