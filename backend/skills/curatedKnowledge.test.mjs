/* Checks on the curated knowledge path.
 *
 * Two things are being protected here. The mechanical one: ingest must replace
 * rather than accumulate, because a knowledge base holding three drifting
 * copies of one claim is worse than one holding none. The editorial one: a
 * figure from somebody else's clients must stay labelled as a figure from
 * somebody else's clients, all the way into the row an agent will read.
 *
 * Run: node backend/skills/curatedKnowledge.test.mjs
 */

import { ingestCurated, curatedStatus, curatedUnits, CURATED_SOURCES } from './curatedKnowledge.js';
import { knowledgeRows, UNITS } from '../knowledge/implementation-method.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

/* ── A Supabase-shaped double ─────────────────────────────────────────────
   Records the call order, because "delete before insert" is the property that
   makes ingest idempotent and it is invisible in the returned value. */
function fakeDb(seed = []) {
  const table = [...seed];
  const calls = [];
  return {
    table, calls,
    from() {
      return {
        delete() {
          return {
            eq(_col, val) {
              calls.push('delete');
              for (let i = table.length - 1; i >= 0; i--) if (table[i].source_key === val) table.splice(i, 1);
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(rows) {
          calls.push('insert');
          table.push(...rows);
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(_col, val) {
              calls.push('select');
              return Promise.resolve({ data: table.filter((r) => r.source_key === val), error: null });
            },
          };
        },
      };
    },
  };
}

console.log('\ncuratedKnowledge\n');

/* ── The rows themselves ──────────────────────────────────────────────── */
const rows = knowledgeRows();

ok('every row carries a title, content, domain and source key',
  rows.every((r) => r.title && r.content && r.domain && r.source_key && r.source_name));

ok('no unit is a stub',
  rows.every((r) => r.content.length > 400),
  `shortest is ${Math.min(...rows.map((r) => r.content.length))} chars`);

ok('every row is tagged with its own status',
  rows.every((r) => r.tags.includes(r.metadata.status)));

ok('provenance travels on every row',
  rows.every((r) => r.metadata.author && r.metadata.basis && r.metadata.audited === false));

/* ── Mechanisms and priors are kept apart ─────────────────────────────── */
const priors = rows.filter((r) => r.metadata.status === 'prior');
const mechanisms = rows.filter((r) => r.metadata.status === 'mechanism');

ok('there is at least one prior and it is tagged as one', priors.length >= 1);
ok('mechanisms outnumber priors', mechanisms.length > priors.length,
  `${mechanisms.length} mechanisms, ${priors.length} priors`);

ok('no prior outranks a mechanism on relevance',
  priors.every((p) => p.relevance_score < 5),
  'a borrowed figure must not be the first thing an agent finds');

ok('every statistic names its source',
  rows.flatMap((r) => r.statistics || []).every((s) => s.stat && s.source));

ok('statistics only appear on priors',
  rows.every((r) => !(r.statistics || []).length || r.metadata.status === 'prior'));

/* ── Ingest replaces, never accumulates ───────────────────────────────── */
const db = fakeDb();
const first = await ingestCurated({ db });
ok('ingest reports what it wrote', first.total === rows.length, `${first.total} vs ${rows.length}`);
ok('rows land in the table', db.table.length === rows.length);
ok('delete runs before insert', db.calls[0] === 'delete' && db.calls[1] === 'insert', db.calls.join(','));

await ingestCurated({ db });
ok('re-running does not duplicate', db.table.length === rows.length, `${db.table.length} rows after two runs`);

/* Rows from another source must survive an ingest of this one. */
const mixed = fakeDb([{ source_key: 'other/source', title: 'untouched', content: 'x' }]);
await ingestCurated({ db: mixed });
ok('another source is left alone',
  mixed.table.some((r) => r.source_key === 'other/source'));

/* ── Status reads the table rather than assuming it ───────────────────── */
const st = await curatedStatus({ db });
ok('status reports in-table and in-repo counts',
  st.sources[0].inTable === rows.length && st.sources[0].inRepo === rows.length);
ok('status is not stale after a clean ingest', st.sources[0].stale === false);

db.table.pop();
const st2 = await curatedStatus({ db });
ok('status notices a half-applied ingest', st2.sources[0].stale === true,
  `${st2.sources[0].inTable} in table, ${st2.sources[0].inRepo} in repo`);

/* ── The console view ─────────────────────────────────────────────────── */
const view = curatedUnits();
ok('the console view lists every unit',
  view[0].units.length === UNITS.length);
ok('the console view carries status per unit',
  view[0].units.every((u) => u.status === 'mechanism' || u.status === 'prior'));

ok('exactly one curated source is registered', CURATED_SOURCES.length === 1);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
