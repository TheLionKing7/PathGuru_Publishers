/**
 * Run:  node backend/skills/outboundClaim.test.mjs
 *
 * At-most-once outbound sending: listApprovedDrafts() claims at hand-out, so a
 * second call with no confirmation in between must return zero rows.
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import { listApprovedDrafts } from './inboundEmail.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

// Thenable mock of the Supabase query builder: every method chains and the object
// is awaitable, resolving to `result`. The park step resolves to "nothing parked".
function chainable(result) {
  const thenable = {
    update: () => thenable, select: () => thenable,
    eq: () => thenable, is: () => thenable, gte: () => thenable, lt: () => thenable,
    then: (resolve) => resolve(result),
  };
  return thenable;
}

// rpc('claim_outbound_drafts') hands out the rows once, then returns empty — the
// DB-side guarantee this test is built around.
function fakeDb(claimRows) {
  let calls = 0;
  return {
    from: () => chainable({ data: [], error: null }),
    rpc: async (name) => {
      if (name !== 'claim_outbound_drafts') return { data: [], error: null };
      calls++;
      return calls === 1 ? { data: claimRows, error: null } : { data: [], error: null };
    },
  };
}

const row = {
  id: '11111111-1111-1111-1111-111111111111',
  message_id: '<m1>', thread_id: null, from_addr: 'a@b.com', to_addr: 'c@d.com',
  subject: 'hi', draft_subject: 'Re: hi', draft_body: 'hello',
  status: 'approved', approved_at: new Date().toISOString(), created_at: new Date().toISOString(),
};

console.log('— outbound claim (at-most-once) —');
const db = fakeDb([row]);

const first = await listApprovedDrafts(db);
t('first call returns the claimed draft', first.drafts.length === 1);

const second = await listApprovedDrafts(db);
t('second call returns zero rows', second.drafts.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
