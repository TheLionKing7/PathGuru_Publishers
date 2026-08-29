/**
 * Prompt registry — module-level tests.
 *
 * Run:  node backend/skills/promptRegistry.test.mjs
 *
 * The registry decides which text a prompt id produces, so the properties
 * worth pinning down are the ones that keep it from ever producing nothing:
 *
 *   • an empty registry, and a MISSING database, both resolve from the repo
 *   • a draft is saved without going live
 *   • publishing makes a version live; rollback is publishing an older one
 *   • reverting drops the override and KEEPS the history
 *   • a live_version pointing at a row that is gone degrades to the repo
 *     rather than taking the prompt off the air
 *   • a paused estate blocks an AGENT publish and never an operator one
 *
 * No framework, no dependency, exits non-zero on failure.
 */

import * as reg from './promptRegistry.js';
import { _invalidateCache as invalidateFlags } from './systemFlags.js';
import { PROMPT_BY_ID } from '../prompts/index.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };
async function throws(fn, re) {
  try { await fn(); return false; } catch (e) { return re.test(e.message); }
}
function reset() { reg._invalidateCache(); invalidateFlags(); }

const ID = 'assess.three-test-filter';
const SEED = PROMPT_BY_ID[ID].body;

/* ── A Supabase-shaped double, covering only the chains this module uses.
      Anything it does not implement throws, which is the useful property: the
      test fails rather than quietly passing against a stub that agrees with
      everything. ─────────────────────────────────────────────────────────── */
function makeDb(seed = {}) {
  const db = { prompt: [], prompt_version: [], prompt_usage: [], system_flag: [], ...seed };
  let auto = 1;

  function query(table) {
    const q = { _f: [], _order: null, _limit: null, _count: false, _head: false };
    const rows = () => {
      let r = db[table].filter((row) => q._f.every((f) => f(row)));
      if (q._order) {
        const [col, asc] = q._order;
        r = [...r].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
      }
      return q._limit == null ? r : r.slice(0, q._limit);
    };
    Object.assign(q, {
      select(_c, o = {}) { q._count = !!o.count; q._head = !!o.head; return q; },
      eq(c, v) { q._f.push((r) => r[c] === v); return q; },
      gte(c, v) { q._f.push((r) => r[c] >= v); return q; },
      order(c, { ascending = true } = {}) { q._order = [c, ascending]; return q; },
      limit(n) { q._limit = n; return q; },
      maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
      insert(row) {
        const now = new Date().toISOString();
        /* Postgres fills these from column defaults; the double must too, or a
           gte('used_at', …) filters out the row just written. */
        const defaults = { prompt_usage: { used_at: now }, prompt_version: { created_at: now } };
        for (const r of (Array.isArray(row) ? row : [row])) {
          db[table].push({ id: auto++, ...(defaults[table] || {}), ...r });
        }
        return Promise.resolve({ error: null });
      },
      upsert(row, { onConflict = 'id' } = {}) {
        const i = db[table].findIndex((r) => r[onConflict] === row[onConflict]);
        if (i >= 0) db[table][i] = { ...db[table][i], ...row }; else db[table].push({ ...row });
        return Promise.resolve({ error: null });
      },
      update(patch) {
        const u = { _f: [] };
        u.eq = (c, v) => { u._f.push((r) => r[c] === v); return u; };
        u.then = (res) => { for (const r of db[table]) if (u._f.every((f) => f(r))) Object.assign(r, patch); res({ error: null }); };
        return u;
      },
      then(res) { res({ data: q._head ? null : rows(), count: q._count ? rows().length : undefined, error: null }); },
    });
    return q;
  }
  return { from: query, _db: db };
}

const setFlag = (db, paused) => {
  db._db.system_flag = [{ key: 'agents_paused', value: paused }];
  invalidateFlags();
};

/* ── 1. Resolution ──────────────────────────────────────────────────────── */
{
  const db = makeDb(); reset();
  const s = await reg.promptState(ID, { db, force: true });
  t('empty registry resolves from the repo', s.origin === 'seed' && s.version === null && s.body === SEED);
}
{
  reset();
  const s = await reg.promptState(ID, { db: null, force: true });
  t('no database at all still resolves from the repo', s.origin === 'seed');
}
{
  const db = makeDb({ prompt: [{ id: ID, audience: 'operator', live_version: 99 }] }); reset();
  const s = await reg.promptState(ID, { db, force: true });
  t('a dangling live_version degrades to the repo', s.origin === 'seed');
}
{
  const db = makeDb(); reset();
  t('an unknown id is rejected, not invented',
    await throws(() => reg.promptState('nope.not-a-prompt', { db, force: true }), /unknown prompt/));
}

/* ── 2. Drafts and publishing ───────────────────────────────────────────── */
{
  const db = makeDb(); reset();
  const d = await reg.saveDraft(ID, 'DRAFT ONE {{COMPANY}}', { note: 'trying something', db });
  reset();
  const s = await reg.promptState(ID, { db, force: true });
  t('a draft is saved but does not go live',
    d.version === 1 && d.status === 'draft' && d.variables[0] === 'COMPANY' && s.origin === 'seed');
}
{
  const db = makeDb(); reset();
  t('an empty draft is refused', await throws(() => reg.saveDraft(ID, '   ', { db }), /not a draft/));
}
{
  const db = makeDb(); reset();
  await reg.saveDraft(ID, 'DRAFT ONE', { db });
  await reg.publishVersion(ID, 1, { db });
  reset();
  const out = await reg.resolvePrompt(ID, { db, force: true, industry: 'legal-services' });
  t('publishing makes a version live, and compose still layers the context block',
    out.origin === 'registry' && out.version === 1 &&
    out.text.includes('DRAFT ONE') && out.text.includes('legal services'));
}
{
  const db = makeDb(); reset();
  await reg.saveDraft(ID, 'X', { db });
  t('publishing a version that does not exist is refused',
    await throws(() => reg.publishVersion(ID, 7, { db }), /has no version 7/));
}
{
  const db = makeDb(); reset();
  await reg.saveDraft(ID, 'V1', { db });  await reg.publishVersion(ID, 1, { db });
  await reg.saveDraft(ID, 'V2', { db });  await reg.publishVersion(ID, 2, { db });
  reset();
  const live2 = (await reg.promptState(ID, { db, force: true })).body;
  await reg.publishVersion(ID, 1, { db });
  reset();
  const back = (await reg.promptState(ID, { db, force: true })).body;
  t('versions increment, and rollback is publishing an older one', live2 === 'V2' && back === 'V1');
}
{
  const db = makeDb(); reset();
  await reg.saveDraft(ID, 'OVERRIDE', { db });
  await reg.publishVersion(ID, 1, { db });
  await reg.revertToSeed(ID, { db });
  reset();
  const s = await reg.promptState(ID, { db, force: true });
  const h = await reg.versionsOf(ID, { db });
  t('reverting drops the override and keeps the history', s.origin === 'seed' && h.versions.length === 1);
}

/* ── 3. The pause rule ──────────────────────────────────────────────────
   Editing is not acting. A paused estate must still let you draft and read;
   it blocks only the thing that changes live behaviour — publishing a prompt
   an agent resolves. Operator prompts are unaffected, paused or not. */
{
  const db = makeDb(); reset();
  PROMPT_BY_ID['test.agent-lane'] = {
    id: 'test.agent-lane', audience: 'agent', category: 'ops',
    title: 'test', when: 'test', body: 'AGENT BODY',
  };
  await reg.saveDraft('test.agent-lane', 'NEW AGENT BODY', { db });
  await reg.saveDraft(ID, 'NEW OPERATOR BODY', { db });

  setFlag(db, true);
  const blocked = await throws(() => reg.publishVersion('test.agent-lane', 1, { db }), /paused/);
  let operatorOk = true;
  try { await reg.publishVersion(ID, 1, { db }); } catch { operatorOk = false; }

  setFlag(db, false);
  let agentOkAfterResume = true;
  try { await reg.publishVersion('test.agent-lane', 1, { db }); } catch { agentOkAfterResume = false; }

  delete PROMPT_BY_ID['test.agent-lane'];
  t('a paused estate blocks agent publishes only', blocked && operatorOk && agentOkAfterResume);
}

/* ── 4. Usage ───────────────────────────────────────────────────────────── */
{
  const db = makeDb(); reset();
  await reg.recordUsage({ promptId: ID, chars: 100, unfilled: 0, clauses: ['grounding'] }, { db });
  await reg.recordUsage({ promptId: ID, chars: 120, unfilled: 1 }, { db });
  const u = await reg.usageSummary({ days: 30, db });
  t('usage is recorded on copy and summarised',
    u.byPrompt[ID] === 2 && !u.unused.includes(ID) && u.unused.length > 60);
}

/* ── 5. The agent-lane contract ─────────────────────────────────────────── */
{
  const db = makeDb(); reset();
  t('strict resolve throws rather than sending a placeholder',
    await throws(() => reg.resolvePrompt(ID, { db, force: true, strict: true }), /unfilled variables/));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
