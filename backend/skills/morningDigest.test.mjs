/**
 * Run:  node backend/skills/morningDigest.test.mjs
 *
 * Verifies the digest collapses to a single "all quiet" line when nothing
 * happened, and surfaces emails / paused state when present.
 * No framework, no dependency, exits non-zero on failure.
 */
import { buildMorningDigest } from './morningDigest.js';
import { _invalidateCache } from './systemFlags.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

function makeDb(rowsByTable = {}) {
  const q = (table) => ({
    eq() { return q(table); },
    neq() { return q(table); },
    in() { return q(table); },
    gte() { return q(table); },
    order() { return q(table); },
    limit() { return q(table); },
    then(resolve) { resolve({ data: rowsByTable[table] || [] }); },
    maybeSingle() { return Promise.resolve({ data: (rowsByTable[table] || [])[0] || null }); },
  });
  return { from(table) { return { select() { return q(table); } }; } };
}

console.log('— quiet —');
{
  _invalidateCache();
  const res = await buildMorningDigest({ db: makeDb({}) });
  t('quiet when nothing happened', res.quiet === true && /All quiet/.test(res.text));
  t('single line when quiet', res.text.trim().split('\n').length === 2);
}

console.log('— emails surfaced —');
{
  _invalidateCache();
  const db = makeDb({
    outbound_send_log: [{ to_addr: 'a@b.com', sent_at: new Date().toISOString() }],
  });
  const res = await buildMorningDigest({ db });
  t('emails section present', res.quiet === false && /Emails sent/.test(res.text) && /a@b\.com/.test(res.text));
}

console.log('— paused reported —');
{
  _invalidateCache();
  const db = makeDb({ system_flag: [{ key: 'agents_paused', value: true }] });
  const res = await buildMorningDigest({ db });
  t('paused reported', res.paused === true && /PAUSED/.test(res.text));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
