/**
 * Five-day assessment — the instrument's rules.
 *
 * Run:  node backend/skills/assessment5d.test.mjs
 *
 * This module is a PORT of digifusion/lib/frictioniq/assessment5d.ts. The risk
 * a port carries is that the two drift and one console starts giving a
 * different answer from the other about the same client, so what is pinned
 * here is the arithmetic and the verdict rule — the two things that would
 * differ silently.
 *
 * No database. These are pure functions and that is the point of them.
 */

import { reckon, verdictFor, annualCost } from './assessment5d.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

const cand = (o = {}) => ({
  name: 'x', frequency_per_week: null, minutes_each: null, loaded_rate: null,
  repeatable: null, legible: null, bounded: null, verdict: 'unknown', ...o,
});

/* ── The verdict rule ───────────────────────────────────────────────────── */
t('all three yes → pass',
  verdictFor({ repeatable: true, legible: true, bounded: true }) === 'pass');
t('a single no decides it, in order',
  verdictFor({ repeatable: false, legible: false, bounded: false }) === 'fails-repeatable' &&
  verdictFor({ repeatable: true, legible: false, bounded: false }) === 'fails-legible' &&
  verdictFor({ repeatable: true, legible: true, bounded: false }) === 'fails-bounded');
t('an unasked test is unknown, not a pass',
  verdictFor({ repeatable: true, legible: true, bounded: null }) === 'unknown');
/* The one that matters most: a NO outranks an UNKNOWN. A candidate with a
   failed test and an unasked one is declined, not deferred. */
t('a failure outranks an unknown',
  verdictFor({ repeatable: null, legible: false, bounded: null }) === 'fails-legible');

/* ── The arithmetic ─────────────────────────────────────────────────────── */
t('annual = frequency × 52 × hours × rate',
  annualCost(cand({ frequency_per_week: 5, minutes_each: 30, loaded_rate: 20 })) === 5 * 52 * 0.5 * 20);
t('a missing term is zero, never guessed',
  annualCost(cand({ frequency_per_week: 5, minutes_each: 30 })) === 0 &&
  annualCost(cand({ frequency_per_week: 0, minutes_each: 30, loaded_rate: 20 })) === 0);

/* ── The reckoning ──────────────────────────────────────────────────────── */
{
  const r = reckon({ band_pct: 30, candidates: [] });
  t('an empty list prices nothing and suggests nothing',
    r.listed === 0 && r.low === 0 && r.high === 0 && r.suggestedCeiling === null && r.priced === false);
}
{
  /* One survivor priced, one killed, one unknown. */
  const r = reckon({
    band_pct: 25,
    candidates: [
      cand({ verdict: 'pass', frequency_per_week: 10, minutes_each: 60, loaded_rate: 30 }),
      cand({ verdict: 'fails-legible' }),
      cand({ verdict: 'unknown' }),
    ],
  });
  const point = 10 * 52 * 1 * 30;  // 15,600
  t('counts split three ways', r.listed === 3 && r.survived === 1 && r.killed === 1 && r.unknown === 1);
  t('the band widens the point estimate both ways',
    r.low === Math.round(point * 0.75) && r.high === Math.round(point * 1.25));
  t('the ceiling is a quarter of the point estimate, not of the range',
    r.suggestedCeiling === Math.round(point * 0.25));
  t('killed candidates are named by the test that killed them',
    r.byTest.length === 1 && r.byTest[0].verdict === 'fails-legible' && r.byTest[0].count === 1);
  t('a killed candidate costs nothing — there is nothing to recover', r.priced === true);
}
{
  /* A survivor with no rate. The figure must NOT be reported: a partial sum
     looks like an estimate and is one short. */
  const r = reckon({
    band_pct: 30,
    candidates: [
      cand({ verdict: 'pass', frequency_per_week: 10, minutes_each: 60, loaded_rate: 30 }),
      cand({ verdict: 'pass' }),
    ],
  });
  t('an unpriced survivor blocks the figure', r.priced === false && r.unpriced === 1);
}
{
  /* Nothing survived. A finding, not an error — and not a zero-pound figure. */
  const r = reckon({ band_pct: 30, candidates: [cand({ verdict: 'fails-repeatable' })] });
  t('nothing surviving is a finding, and suggests no commitment',
    r.survived === 0 && r.suggestedCeiling === null && r.priced === false);
}
{
  const r = reckon({ band_pct: 999, candidates: [cand({ verdict: 'pass', frequency_per_week: 1, minutes_each: 60, loaded_rate: 100 })] });
  t('an absurd band is clamped rather than producing a negative floor', r.low >= 0);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
