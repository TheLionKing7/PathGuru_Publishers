/**
 * Run:  node backend/skills/slackNotify.test.mjs
 *
 * Verifies the new notification order and audit trail:
 *   • Slack first, always
 *   • WhatsApp only as a fallback, only when Slack fails, only for high-priority
 *   • every attempt (including "Slack not configured") is recorded with ok,
 *     provider_id and error — nothing is skipped into the void
 *
 * No framework, no dependency, exits non-zero on failure.
 */

import { deliverOwnerNotification } from './notifier.js';
import { isSlackConfigured, getMissingSlackVars } from './slackNotify.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

const SLACK_VARS = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APPROVAL_CHANNEL', 'SLACK_OPS_CHANNEL'];

function setSlack() {
  for (const v of SLACK_VARS) process.env[v] = v + '_value';
}
function clearSlack() {
  for (const v of SLACK_VARS) delete process.env[v];
}
function setWhatsApp() {
  process.env.WHATSAPP_TO = '+1234567890';
  process.env.TWILIO_ACCOUNT_SID = 'sid';
  process.env.TWILIO_AUTH_TOKEN = 'tok';
  process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886';
}
function clearWhatsApp() {
  for (const v of ['WHATSAPP_TO', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM']) delete process.env[v];
}

/* Minimal Supabase-like mock for notification_attempt inserts. */
function makeDb() {
  const attempts = [];
  return {
    attempts,
    from(table) {
      return {
        async insert(row) {
          if (table === 'notification_attempt') attempts.push(row);
          return { error: null };
        },
      };
    },
  };
}

/* Minimal fetch mock keyed by URL substring. */
function makeFetch(slackRes, twilioRes) {
  const calls = { slack: 0, twilio: 0 };
  const fetch = async (url) => {
    const u = String(url);
    if (u.includes('slack.com/api/chat.postMessage')) {
      calls.slack++;
      return { ok: slackRes.ok, status: slackRes.ok ? 200 : 400, json: async () => slackRes.body };
    }
    if (u.includes('api.twilio.com')) {
      calls.twilio++;
      return { ok: true, status: 200, json: async () => ({ sid: 'SM123' }) };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };
  return { fetch, calls };
}

const origFetch = globalThis.fetch;
const origEnv = { ...process.env };

try {
  console.log('— config gate —');
  clearSlack();
  t('reports missing vars when unset', isSlackConfigured() === false && getMissingSlackVars().length === SLACK_VARS.length);
  setSlack();
  t('configured when all four set', isSlackConfigured() === true);

  console.log('— Slack first, always (Slack ok → no WhatsApp) —');
  setSlack(); setWhatsApp();
  {
    const db = makeDb();
    const { fetch, calls } = makeFetch({ ok: true, body: { ok: true, ts: 'TS123' } }, null);
    globalThis.fetch = fetch;
    const r = await deliverOwnerNotification({ title: 'T', body: 'B', severity: 'critical', db });
    t('delivery ok', r.ok === true);
    t('exactly one slack attempt, no whatsapp', r.attempts.length === 1 && r.attempts[0].channel === 'slack' && r.attempts[0].ok === true);
    t('slack provider_id recorded', r.attempts[0].providerId === 'TS123');
    t('whatsapp never called when slack succeeds', calls.twilio === 0);
    t('attempt row persisted with ok=true', db.attempts.length === 1 && db.attempts[0].ok === true && db.attempts[0].channel === 'slack');
  }

  console.log('— high-priority → WhatsApp fallback when Slack fails —');
  {
    const db = makeDb();
    const { fetch, calls } = makeFetch({ ok: false, body: { ok: false, error: 'channel_not_found' } }, null);
    globalThis.fetch = fetch;
    const r = await deliverOwnerNotification({ title: 'T', body: 'B', severity: 'critical', db });
    t('whatsapp fallback fired', calls.twilio === 1);
    t('two attempts (slack fail + whatsapp ok)', r.attempts.length === 2 && r.attempts.some((a) => a.channel === 'slack' && a.ok === false) && r.attempts.some((a) => a.channel === 'whatsapp' && a.ok === true));
    t('whatsapp provider_id (sid) recorded', r.attempts.find((a) => a.channel === 'whatsapp').providerId === 'SM123');
  }

  console.log('— info priority → NO WhatsApp fallback when Slack fails —');
  {
    const db = makeDb();
    const { fetch, calls } = makeFetch({ ok: false, body: { ok: false, error: 'channel_not_found' } }, null);
    globalThis.fetch = fetch;
    const r = await deliverOwnerNotification({ title: 'T', body: 'B', severity: 'info', db });
    t('no whatsapp for info priority', calls.twilio === 0);
    t('only the failed slack attempt', r.attempts.length === 1 && r.attempts[0].channel === 'slack' && r.attempts[0].ok === false);
  }

  console.log('— Slack unconfigured → recorded, never silent —');
  clearSlack(); setWhatsApp();
  {
    const db = makeDb();
    const { fetch } = makeFetch(null, null);
    globalThis.fetch = fetch;
    const r = await deliverOwnerNotification({ title: 'T', body: 'B', severity: 'critical', db });
    const slackAttempt = r.attempts.find((a) => a.channel === 'slack');
    t('slack attempt recorded with not-configured error', !!slackAttempt && slackAttempt.ok === false && /not configured/.test(slackAttempt.error || ''));
    t('whatsapp fallback still fired (critical)', r.attempts.some((a) => a.channel === 'whatsapp' && a.ok === true));
  }
} finally {
  globalThis.fetch = origFetch;
  process.env = { ...origEnv };
  clearWhatsApp();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
