#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   patch_server_outcome.mjs

   Adds outcome capture to the FrictionIQ session routes in backend/server.js.

   WHY THIS EXISTS AT ALL
   ──────────────────────
   The operator console now has an outcome control on every register row —
   "became a paid engagement / did not convert / still open", plus the value.
   That control is the whole reason the console was rebuilt: two numbers in this
   estate are declared priors rather than measurements (the band priors behind
   the Commitment Sizer, and the value-per-completed-assessment behind the
   advertising tranche), and neither can be retired until somebody records,
   against a real row, what it became.

   Without this patch that control posts into a strict allowlist that accepts
   only `stage` and `replied`, so every save returns 400 "nothing to update".
   The button would look like it worked in the console and write nothing. A
   capture surface that silently discards what you type is worse than no capture
   surface, because you stop keeping the record elsewhere.

   THREE EDITS, EACH IDEMPOTENT
   ────────────────────────────
     1. GET  /api/frictioniq/sessions — add the three columns to the select
     2. GET  /api/frictioniq/sessions — carry them through the row mapping
     3. POST /api/frictioniq/session  — allowlist them, with validation

   Run the migration FIRST (0024_frictioniq_outcome.sql). Adding the columns to
   the select before they exist in the table makes PostgREST reject the whole
   query, which takes the register down rather than degrading it — the same
   failure the comment above that select already warns about.

   USAGE
     node patch_server_outcome.mjs --file <path-to-backend/server.js> [--dry]

   The write is atomic (temp file in the same directory, then rename) and a
   timestamped .bak of the original is left beside it.
──────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const fileArg = (() => {
  const i = argv.indexOf('--file');
  return i >= 0 ? argv[i + 1] : null;
})();

const CANDIDATES = [
  fileArg,
  'backend/server.js',
  './server.js',
  '../backend/server.js',
].filter(Boolean);

const target = CANDIDATES.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!target) {
  console.error('Could not find server.js. Pass it explicitly:\n  node patch_server_outcome.mjs --file path/to/backend/server.js');
  process.exit(1);
}

const original = fs.readFileSync(target, 'utf8');
let src = original;
const done = [];
const skipped = [];
const failed = [];

/* ── Edit 1: the select ──────────────────────────────────────────────────── */
{
  const SELECT_OLD = "email,stage,organization,replied_at,lead_score,priority')";
  const SELECT_NEW = "email,stage,organization,replied_at,lead_score,priority,outcome,outcome_value,outcome_at')";
  if (src.includes(SELECT_NEW)) skipped.push('select — already carries the outcome columns');
  else if (src.includes(SELECT_OLD)) { src = src.replace(SELECT_OLD, SELECT_NEW); done.push('select — added outcome, outcome_value, outcome_at'); }
  else failed.push('select — anchor not found (the column list has changed since this patch was written)');
}

/* ── Edit 2: the row mapping ─────────────────────────────────────────────── */
{
  const MAP_OLD = `        organization: r.organization,
        replied: Boolean(r.replied_at),`;
  const MAP_NEW = `        organization: r.organization,
        replied: Boolean(r.replied_at),
        /* The outcome fields travel with the row so the console can show what
           was already recorded rather than presenting an empty control over a
           row that has an answer. null is the honest default: it renders as
           "not yet known", which is different from "did not convert". */
        outcome: r.outcome ?? null,
        outcome_value: r.outcome_value ?? null,
        outcome_at: r.outcome_at ?? null,`;
  if (src.includes('outcome: r.outcome')) skipped.push('mapping — already carries the outcome fields');
  else if (src.includes(MAP_OLD)) { src = src.replace(MAP_OLD, MAP_NEW); done.push('mapping — outcome fields now reach the console'); }
  else failed.push('mapping — anchor not found');
}

/* ── Edit 3: the POST allowlist ──────────────────────────────────────────── */
{
  const POST_OLD = `      if (!Object.keys(patch).length) { err(res, 'nothing to update', 400); return; }`;
  const POST_NEW = `      /* The outcome is the field this console exists to collect. It stays on
         the same allowlist discipline as the rest: a closed vocabulary, a
         number that must actually parse, and an explicit null for "clear it"
         rather than a silent no-op. Recording a wrong outcome is worse than
         recording none, because the priors it feeds are quoted to clients. */
      const OUTCOMES = new Set(['won', 'lost', 'pending']);
      if (body.outcome !== undefined) {
        const o = body.outcome === null || body.outcome === '' ? null : String(body.outcome);
        if (o !== null && !OUTCOMES.has(o)) { err(res, \`unknown outcome: \${body.outcome}\`, 400); return; }
        patch.outcome = o;
        patch.outcome_at = o === null ? null : new Date().toISOString();
      }

      if (body.outcome_value !== undefined) {
        if (body.outcome_value === null || body.outcome_value === '') {
          patch.outcome_value = null;
        } else {
          const v = Number(body.outcome_value);
          // Not Number.isFinite alone: a negative or zero engagement value is a
          // typo, and one typo in a sample of ten moves the mean it feeds.
          if (!Number.isFinite(v) || v <= 0) { err(res, 'outcome_value must be a positive number', 400); return; }
          patch.outcome_value = v;
        }
      }

      if (!Object.keys(patch).length) { err(res, 'nothing to update', 400); return; }`;
  if (src.includes("const OUTCOMES = new Set(")) skipped.push('POST allowlist — outcome already allowlisted');
  else if (src.includes(POST_OLD)) { src = src.replace(POST_OLD, POST_NEW); done.push('POST allowlist — outcome and outcome_value accepted, with validation'); }
  else failed.push('POST allowlist — anchor not found');
}

/* ── Report and write ────────────────────────────────────────────────────── */
console.log(`\ntarget: ${path.resolve(target)}`);
for (const d of done)    console.log(`  applied  ${d}`);
for (const s of skipped) console.log(`  skipped  ${s}`);
for (const f of failed)  console.log(`  FAILED   ${f}`);

if (failed.length) {
  console.error('\nOne or more anchors did not match. Nothing was written — fix the anchor or apply by hand.');
  process.exit(2);
}
if (!done.length) {
  console.log('\nNothing to do. server.js already carries all three edits.');
  process.exit(0);
}
if (DRY) {
  console.log(`\n--dry: no file written. ${done.length} edit(s) would be applied (${original.length} -> ${src.length} bytes).`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const bak = `${target}.${stamp}.bak`;
fs.writeFileSync(bak, original, 'utf8');

// Same-directory temp then rename, so a crash mid-write cannot leave a half file.
const tmp = `${target}.tmp-${process.pid}`;
fs.writeFileSync(tmp, src, 'utf8');
fs.renameSync(tmp, target);

console.log(`\nwritten. backup: ${path.basename(bak)}`);
console.log('Now: node --check backend/server.js  then restart the backend.');
