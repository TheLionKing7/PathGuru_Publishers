/**
 * Run:  node backend/skills/whatsappStatus.test.mjs
 *
 * Verifies the Twilio status-callback handler:
 *   • 63016 is explained in plain words (out-of-window / sandbox expired)
 *   • undelivered/failed updates notification_attempt (delivery_status + error_code)
 *   • undelivered/failed raises a Slack fallback notice and records that attempt
 *   • delivered/read do NOT raise a fallback
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import { describeTwilioError, handleWhatsAppStatusCallback } from './whatsappStatus.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

console.log('— describeTwilioError —');
t('63016 explained as out-of-window', /outside the allowed freeform window/.test(describeTwilioError('63016')));
t('63016 names the sandbox expiry', /sandbox session has expired/.test(describeTwilioError('63016')));
t('unknown code → "Twilio error <code>"', describeTwilioError('99999') === 'Twilio error 99999');
t('empty code → no error code', describeTwilioError('') === 'no error code provided');

function makeDb() {
  const rows = { updated: [], inserted: [] };
  return {
    rows,
    from(table) {
      return {
        update(patch) {
          return {
            eq(key, value) {
              return {
                eq(key2, value2) {
                  return {
                    async select() {
                      rows.updated.push({ ...patch, [key]: value, [key2]: value2 });
                      return { data: [{ id: 'a1', target: 'whatsapp:+1234567890', ok: true }], error: null };
                    },
                  };
                },
              };
            },
          };
        },
        async insert(row) {
          if (table === 'notification_attempt') rows.inserted.push(row);
          return { error: null };
        },
      };
    },
  };
}

const origFetch = globalThis.fetch;
const savedEnv = { ...process.env };
let slackPosted = false;

process.env.SLACK_OPS_CHANNEL = 'C-OPS';
process.env.SLACK_BOT_TOKEN = 'xoxb-test';
globalThis.fetch = async (url) => {
  if (String(url).includes('slack.com/api/chat.postMessage')) {
    slackPosted = true;
    return { ok: true, status: 200, json: async () => ({ ok: true, ts: 'TS1' }) };
  }
  return { ok: false, status: 500, json: async () => ({}) };
};

try {
  console.log('— undelivered → failure + Slack fallback —');
  {
    const db = makeDb();
    const res = await handleWhatsAppStatusCallback(
      { MessageSid: 'SM63016', MessageStatus: 'undelivered', ErrorCode: '63016', To: 'whatsapp:+1234567890' },
      db,
    );
    t('reports failed', res.failed === true && res.matched === 1);
    t('attempt updated delivery_status=undelivered', db.rows.updated[0]?.delivery_status === 'undelivered');
    t('attempt updated error_code=63016', db.rows.updated[0]?.error_code === '63016');
    t('slack fallback posted', slackPosted === true);
    t('slack fallback attempt recorded ok=true', db.rows.inserted.some((r) => r.channel === 'slack' && r.ok === true));
  }

  console.log('— delivered → recorded, no fallback —');
  slackPosted = false;
  {
    const db = makeDb();
    const res = await handleWhatsAppStatusCallback(
      { MessageSid: 'SMdel', MessageStatus: 'delivered', To: 'whatsapp:+1234567890' },
      db,
    );
    t('delivered is not a failure', res.failed === false);
    t('no slack fallback on delivered', slackPosted === false);
    t('delivered records delivery_status', db.rows.updated[0]?.delivery_status === 'delivered');
  }
} finally {
  globalThis.fetch = origFetch;
  process.env = savedEnv;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
