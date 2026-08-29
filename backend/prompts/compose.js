/**
 * The composer — a prompt, plus a context block, plus the clauses the stakes
 * justify, assembled deterministically.
 *
 * This is the whole idea in one function. A library with one entry per industry
 * per task would be thousands of near-identical prompts nobody can search;
 * these three parts multiply instead of duplicating.
 *
 * TWO PROPERTIES MATTER MORE THAN ANYTHING ELSE HERE.
 *
 * 1. DETERMINISM. The same inputs must produce byte-identical text every time —
 *    fixed section order, fixed clause order, no Object key iteration. If the
 *    assembly wanders, two runs are not comparable, and the whole point of
 *    versioning prompts later is that runs ARE comparable.
 *
 * 2. UNFILLED VARIABLES ARE REPORTED, NEVER PASSED THROUGH. A {{VAR}} that
 *    reaches a model is where inventions come from: it reads as an instruction
 *    to make something up. compose() returns them; callers decide whether that
 *    is a warning (a human is about to edit it) or a hard failure (an agent is
 *    about to send it).
 *
 * Pure. No I/O, no database, no network — so the console, the API and any
 * future agent path all get identical output from identical input.
 */

import { INDUSTRY_BY_ID } from './industries.js';
import { CLAUSE_BY_ID, CLAUSES, CLAUSE_PRESETS } from './clauses.js';

const VAR_RE = /\{\{([^}]+)\}\}/g;

/** Every distinct {{VARIABLE}} in a piece of text, in first-appearance order. */
export function variablesIn(text) {
  const seen = [];
  for (const m of String(text || '').matchAll(VAR_RE)) {
    const name = m[1].trim();
    if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}

/**
 * Substitute {{VARS}}. Matching is case-insensitive and whitespace-tolerant,
 * because the variable in the prompt reads as prose ({{PASTE FULL TRANSCRIPT}})
 * and nobody will retype that exactly.
 */
function fill(text, vars) {
  const lookup = new Map(
    Object.entries(vars || {}).map(([k, v]) => [k.trim().toLowerCase(), v])
  );
  return String(text || '').replace(VAR_RE, (whole, name) => {
    const hit = lookup.get(name.trim().toLowerCase());
    return hit === undefined || hit === null || hit === '' ? whole : String(hit);
  });
}

/** Resolve a clause list: explicit ids, a preset name, or both. */
export function resolveClauses(input) {
  if (!input) return [];
  const raw = typeof input === 'string' ? (CLAUSE_PRESETS[input] || [input]) : input;
  const wanted = new Set(raw.flatMap((x) => CLAUSE_PRESETS[x] || [x]));
  /* Iterate CLAUSES rather than the caller's array so the order is the file's,
     not the caller's. Deterministic assembly, per the note above. */
  return CLAUSES.filter((c) => wanted.has(c.id));
}

/**
 * Assemble the final text.
 *
 * @param {object}  prompt              a library entry ({ id, title, body })
 * @param {object}  [opts.vars]         values for {{VARIABLES}}
 * @param {string}  [opts.industry]     industry block id
 * @param {*}       [opts.clauses]      clause ids, or a preset name
 * @param {boolean} [opts.strict]       throw when variables remain unfilled
 *
 * @returns {{ text, unfilled, used }}
 */
export function compose(prompt, opts = {}) {
  if (!prompt || !prompt.body) throw new Error('compose: prompt has no body');

  const industry = opts.industry ? INDUSTRY_BY_ID[opts.industry] : null;
  if (opts.industry && !industry) {
    throw new Error(`compose: unknown industry "${opts.industry}"`);
  }
  const clauses = resolveClauses(opts.clauses);

  /* Fixed order: context, then task, then clauses. Context first because it
     frames everything after it; clauses last because they are constraints on
     the output and the last thing read carries weight. */
  const sections = [];
  if (industry) sections.push(industry.body);
  sections.push(prompt.body);
  if (clauses.length) {
    sections.push(clauses.map((c) => c.body).join('\n\n'));
  }

  const assembled = sections.join('\n\n---\n\n');
  const text = fill(assembled, opts.vars);
  const unfilled = variablesIn(text);

  if (opts.strict && unfilled.length) {
    throw new Error(`compose: unfilled variables — ${unfilled.join(', ')}`);
  }

  return {
    text,
    unfilled,
    used: {
      promptId: prompt.id || null,
      industry: industry ? industry.id : null,
      clauses: clauses.map((c) => c.id),
    },
  };
}
