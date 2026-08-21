/**
 * Run:  node backend/skills/blogOriginationGate.test.mjs
 *
 * Verifies the single blog-origination chokepoint guard that `Nexus.orchestrate()`
 * calls when `nextStep === 'blog'` (see `assertBlogCommissionApproved`).
 *
 *   • refuses (throws) when commissionId is missing, unknown, pre-researching,
 *     or researching without an approved angle — and posts the refusal to
 *     SLACK_OPS_CHANNEL
 *   • allows (resolves) when the commission is at/past `researching` with
 *     `angle_approved_at` set
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import { assertBlogCommissionApproved, BLOG_ORIGINATION_REFUSED } from './blogOriginationGate.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

function makeDb(commissionRow) {
  return {
    from(table) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: table === 'content_commission' ? commissionRow : null, error: null }),
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      };
      return q;
    },
  };
}

const origFetch = globalThis.fetch;
const savedEnv = { ...process.env };
let slackPayload = null;

process.env.SLACK_OPS_CHANNEL = 'C-OPS';
process.env.SLACK_BOT_TOKEN = 'xoxb-test';
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('slack.com/api/chat.postMessage')) {
    slackPayload = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, ts: 'ts.x' }) };
  }
  return { ok: false, status: 500, json: async () => ({}) };
};

async function expectRefused(name, fn) {
  try {
    await fn();
    t(name, false); // did not throw
  } catch (e) {
    t(name, String(e?.message || e).includes(BLOG_ORIGINATION_REFUSED));
  }
}

try {
  console.log('— orchestrate(nextStep: blog) refuses without an approved commission —');
  await expectRefused('missing commissionId throws', () => assertBlogCommissionApproved(null, makeDb(null)));
  t('refusal posted to ops channel', slackPayload?.channel === 'C-OPS' && /Blog origination refused/.test(slackPayload?.text || ''));

  slackPayload = null;
  await expectRefused('unknown commission throws', () => assertBlogCommissionApproved('missing', makeDb(null)));

  await expectRefused('pre-researching status throws', () =>
    assertBlogCommissionApproved('c1', makeDb({ id: 'c1', status: 'angle_review', angle_approved_at: '2026-01-01T00:00:00Z' })));

  await expectRefused('researching without approved angle throws', () =>
    assertBlogCommissionApproved('c1', makeDb({ id: 'c1', status: 'researching', angle_approved_at: null })));

  console.log('— orchestrate(nextStep: blog) allows an approved commission —');
  {
    const res = await assertBlogCommissionApproved('c1', makeDb({ id: 'c1', status: 'researching', angle_approved_at: '2026-01-01T00:00:00Z' }));
    t('researching + angle approved allowed', res.ok === true && res.commission?.id === 'c1');
  }
  {
    const res = await assertBlogCommissionApproved('c1', makeDb({ id: 'c1', status: 'synthesising', angle_approved_at: '2026-01-01T00:00:00Z' }));
    t('past researching allowed', res.ok === true);
  }
} finally {
  globalThis.fetch = origFetch;
  process.env = savedEnv;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
