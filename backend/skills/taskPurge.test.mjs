/**
 * Run:  node backend/skills/taskPurge.test.mjs
 *
 * Verifies the 30-day / completed+cancelled defaults, the explicit-flag rule
 * for pending, and that count/purge delegate the right filters to Supabase.
 * No framework, no dependency, exits non-zero on failure.
 */
import {
  DEFAULT_PURGE_DAYS, DEFAULT_PURGE_STATUSES,
  resolvePurgeParams, isPurgeAllowed, countTasksToPurge, purgeTasks,
} from './taskPurge.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

/* ── resolvePurgeParams ── */
console.log('— resolvePurgeParams —');
{
  const { statuses, before } = resolvePurgeParams();
  t('default statuses are completed + cancelled', JSON.stringify(statuses) === JSON.stringify(DEFAULT_PURGE_STATUSES));
  const diffDays = (Date.now() - before.getTime()) / 86400000;
  t('default before is ~30 days ago', Math.abs(diffDays - DEFAULT_PURGE_DAYS) < 0.01);
}
{
  const { statuses, before } = resolvePurgeParams({ statuses: ['failed'], before: '2026-01-01' });
  t('explicit statuses honoured', JSON.stringify(statuses) === JSON.stringify(['failed']));
  t('explicit before honoured', before.toISOString().startsWith('2026-01-01'));
}

/* ── isPurgeAllowed ── */
console.log('— isPurgeAllowed —');
t('terminal statuses allowed without flag', isPurgeAllowed(['completed', 'cancelled'], false) === true);
t('pending blocked without flag', isPurgeAllowed(['pending'], false) === false);
t('pending blocked with absent flag', isPurgeAllowed(['pending'], undefined) === false);
t('pending allowed with explicit flag', isPurgeAllowed(['pending'], true) === true);
t('pending+completed allowed with explicit flag', isPurgeAllowed(['pending', 'completed'], true) === true);

/* ── count/purge delegate filters ── */
console.log('— count/purge filters —');
function makeDb(captured) {
  const chain = () => {
    const q = {
      _filters: [],
      select() { return q; },
      in(col, vals) { q._filters.push(['in', col, vals]); return q; },
      lt(col, val) { q._filters.push(['lt', col, val]); return q; },
      delete() { return q; },
      then(resolve) { resolve({ count: captured.count ?? 0, error: null }); },
    };
    return q;
  };
  return {
    from(table) { const q = chain(); captured.table = table; captured.last = q; return q; },
  };
}

{
  const captured = { count: 7 };
  const db = makeDb(captured);
  const n = await countTasksToPurge(db, { before: new Date('2026-01-01'), statuses: ['completed', 'cancelled'] });
  t('count returns db count', n === 7);
  t('count targets tasks table', captured.table === 'tasks');
  t('count filters status in', captured.last._filters.some(([op]) => op === 'in'));
  t('count filters created_at lt', captured.last._filters.some(([op]) => op === 'lt'));
}

{
  const captured = { count: 3 };
  const db = makeDb(captured);
  const n = await purgeTasks(db, { before: new Date('2026-01-01'), statuses: ['failed'] });
  t('purge returns db count', n === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
