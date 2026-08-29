/**
 * The operator prompt library — public surface.
 *
 * Everything the console, the API and (later) the Slack command need, and
 * nothing an agent needs. The separation is deliberate: see library.js.
 */

import { PROMPTS, CATEGORIES, PROMPT_BY_ID, CATEGORY_BY_ID } from './library.js';
import { INDUSTRIES, INDUSTRY_BY_ID } from './industries.js';
import { CLAUSES, CLAUSE_BY_ID, CLAUSE_PRESETS } from './clauses.js';
import { compose, variablesIn, resolveClauses } from './compose.js';

export {
  PROMPTS, CATEGORIES, PROMPT_BY_ID, CATEGORY_BY_ID,
  INDUSTRIES, INDUSTRY_BY_ID,
  CLAUSES, CLAUSE_BY_ID, CLAUSE_PRESETS,
  compose, variablesIn, resolveClauses,
};

/** Free-text search across title, purpose, body and category name. */
export function searchPrompts(query = '', category = null) {
  const q = String(query).trim().toLowerCase();
  return PROMPTS.filter((p) => {
    if (category && p.category !== category) return false;
    if (!q) return true;
    const catName = CATEGORY_BY_ID[p.category]?.name || '';
    return `${p.title} ${p.when} ${p.body} ${catName}`.toLowerCase().includes(q);
  });
}

/** A prompt with its variables already extracted — what the console renders. */
export function describePrompt(id) {
  const p = PROMPT_BY_ID[id];
  if (!p) return null;
  return { ...p, variables: variablesIn(p.body), category_name: CATEGORY_BY_ID[p.category]?.name || p.category };
}

/** Counts per category, for the filter chips. */
export function categoryCounts() {
  return CATEGORIES.map((c) => ({
    ...c,
    count: PROMPTS.filter((p) => p.category === c.id).length,
  }));
}

/**
 * Integrity check, run at boot.
 *
 * Duplicate ids and unknown categories are the two faults that break this
 * library silently — a duplicate id means one prompt shadows another and
 * nobody notices which. Cheap to check, expensive to discover later.
 */
export function checkLibrary() {
  const problems = [];
  const ids = new Set();
  for (const p of PROMPTS) {
    if (ids.has(p.id)) problems.push(`duplicate prompt id: ${p.id}`);
    ids.add(p.id);
    if (!CATEGORY_BY_ID[p.category]) problems.push(`${p.id}: unknown category "${p.category}"`);
    if (!p.body || !p.title || !p.when) problems.push(`${p.id}: missing title, purpose or body`);
  }
  const iids = new Set();
  for (const i of INDUSTRIES) {
    if (iids.has(i.id)) problems.push(`duplicate industry id: ${i.id}`);
    iids.add(i.id);
  }
  const cids = new Set();
  for (const c of CLAUSES) {
    if (cids.has(c.id)) problems.push(`duplicate clause id: ${c.id}`);
    cids.add(c.id);
  }
  for (const [name, list] of Object.entries(CLAUSE_PRESETS)) {
    for (const id of list) {
      if (!CLAUSE_BY_ID[id]) problems.push(`preset "${name}" references unknown clause "${id}"`);
    }
  }
  return {
    ok: problems.length === 0,
    problems,
    counts: { prompts: PROMPTS.length, industries: INDUSTRIES.length, clauses: CLAUSES.length },
  };
}

export function logLibraryHealth() {
  const r = checkLibrary();
  if (r.ok) {
    console.log(`[Prompts] library ok — ${r.counts.prompts} prompts, ${r.counts.industries} industries, ${r.counts.clauses} clauses`);
  } else {
    console.error(`[Prompts] library has ${r.problems.length} problem(s):`);
    r.problems.forEach((p) => console.error(`  - ${p}`));
  }
  return r;
}
