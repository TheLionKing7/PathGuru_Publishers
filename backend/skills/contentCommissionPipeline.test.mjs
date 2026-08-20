/**
 * Run:  node backend/skills/contentCommissionPipeline.test.mjs
 *
 * Verifies the concurrency cap and the pipeline dispatcher's stop behavior.
 * No framework, no dependency, exits non-zero on failure.
 */
import { assertCommissionCapacity, ACTIVE_STATUSES, MAX_ACTIVE_COMMISSIONS } from './contentCommission.js';
import { runContentCommission } from './contentCommissionPipeline.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

function capDb(rows) {
  let statusFilter = null;
  const q = {
    in(key, values) { if (key === 'status') statusFilter = values; return q; },
    order() { return q; },
    then(r) {
      const filtered = statusFilter ? rows.filter((row) => statusFilter.includes(row.status)) : rows;
      r({ data: filtered, error: null });
    },
  };
  return { from() { return { select() { return q; } }; } };
}

function single(status) {
  return { from() { return { select() { return { eq() { return { async maybeSingle() { return { data: { id: 'c1', status }, error: null }; } }; } }; } }; } };
}

console.log('— concurrency cap —');
t('max is 3', MAX_ACTIVE_COMMISSIONS === 3);
t('active stops before draft_review', ACTIVE_STATUSES.includes('drafting') && !ACTIVE_STATUSES.includes('draft_review') && !ACTIVE_STATUSES.includes('publishing'));

await (async () => {
  {
    const res = await assertCommissionCapacity({ db: capDb([
      { id: 'a', angle: 'A', status: 'intake' },
      { id: 'b', angle: 'B', status: 'researching' },
      { id: 'c', angle: 'C', status: 'drafting' },
    ]) });
    t('3 active → refused', res.ok === false && res.atCapacity === true && res.count === 3);
    t('inFlight names labels', res.inFlight.length === 3 && res.inFlight[0].label === 'A');
  }
  {
    const res = await assertCommissionCapacity({ db: capDb([{ id: 'a', angle: 'A', status: 'intake' }]) });
    t('1 active → ok', res.ok === true && res.count === 1);
  }
  {
    const res = await assertCommissionCapacity({ db: capDb([
      { id: 'a', status: 'draft_review' },
      { id: 'b', status: 'published' },
      { id: 'c', status: 'abandoned' },
    ]) });
    t('waiting/terminal not counted', res.ok === true && res.count === 0);
  }

  console.log('— dispatcher stops at waiting/terminal states —');
  {
    const res = await runContentCommission({ id: 'c1', db: single('draft_review') });
    t('stops at draft_review', res.ok === true && res.stopped === true && res.status === 'draft_review');
  }
  {
    const res = await runContentCommission({ id: 'c1', db: single('published') });
    t('stops at published', res.ok === true && res.status === 'published');
  }
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
