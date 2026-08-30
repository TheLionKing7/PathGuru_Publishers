/* ══════════════════════════════════════════════════════════════════════════
   CURATED KNOWLEDGE — ingest, and keep it honest
   ══════════════════════════════════════════════════════════════════════════

   The Synthesizer ingests PDFs in bulk. This is the other path: a source read
   and judged worth keeping, written up deliberately as knowledge units, and
   put in the same table so every agent reaches it through the same query.

   ── IDEMPOTENT BY SOURCE KEY ───────────────────────────────────────────────

   Ingest deletes every row carrying the source key, then inserts the current
   set. Re-running after an edit therefore replaces rather than duplicates, and
   the repo file is the only authority — the same rule the prompt registry
   follows. A knowledge base that accumulates three drifting copies of the same
   claim is worse than one with none, because an agent will find one of them
   and have no way to know it is stale.

   ── MECHANISMS AND PRIORS ARE NOT THE SAME THING ───────────────────────────

   Every unit carries a status. A `mechanism` is a way of working that can be
   applied and recommended. A `prior` is a figure from somebody else's clients:
   quotable with its source and its n, never presentable as our result. The
   status is written both into metadata and into the tags, so an agent can
   exclude priors with a tag filter rather than by parsing jsonb.

   That distinction is the whole point of curating rather than extracting. An
   LLM pass over an article produces fluent paraphrase in which a mechanism and
   a number look identical.
   ══════════════════════════════════════════════════════════════════════════ */

import { getSupabase } from '../supabaseClient.js';
import { SOURCE_KEY, SOURCE_NAME, DOMAIN, UNITS, knowledgeRows } from '../knowledge/implementation-method.js';

/** Every curated source in the repo. One entry today; the shape is the point. */
export const CURATED_SOURCES = [
  { key: SOURCE_KEY, name: SOURCE_NAME, domain: DOMAIN, rows: knowledgeRows, units: () => UNITS },
];

const db = (given) => {
  const c = given || getSupabase();
  if (!c) throw new Error('Supabase not configured');
  return c;
};

/**
 * Replace one curated source's rows with the current contents of the repo.
 * Pass no key to ingest every curated source.
 */
export async function ingestCurated({ key = null, db: given } = {}) {
  const c = db(given);
  const sources = key ? CURATED_SOURCES.filter((s) => s.key === key) : CURATED_SOURCES;
  if (!sources.length) throw new Error(`No curated source with key ${key}`);

  const results = [];
  for (const src of sources) {
    /* Delete first, always. An upsert would need a unique constraint the table
       does not have, and an insert-if-missing leaves removed units behind
       forever — the failure mode where the knowledge base still answers with a
       claim that was deleted from the repo three months ago. */
    const del = await c.from('knowledge_base').delete().eq('source_key', src.key);
    if (del.error) throw new Error(`Could not clear ${src.key}: ${del.error.message}`);

    const rows = src.rows();
    const ins = await c.from('knowledge_base').insert(rows);
    if (ins.error) throw new Error(`Could not insert ${src.key}: ${ins.error.message}`);

    const byStatus = {};
    for (const r of rows) {
      const s = r.metadata?.status || 'unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
    }
    results.push({ key: src.key, name: src.name, domain: src.domain, units: rows.length, byStatus });
  }
  return { sources: results, total: results.reduce((a, r) => a + r.units, 0) };
}

/** What is currently in the table for the curated sources, read back rather
 *  than assumed — the point of a summary is to catch a half-applied ingest. */
export async function curatedStatus({ db: given } = {}) {
  const c = db(given);
  const out = [];
  for (const src of CURATED_SOURCES) {
    const { data, error } = await c.from('knowledge_base')
      .select('id, title, tags, relevance_score, metadata')
      .eq('source_key', src.key);
    if (error) { out.push({ key: src.key, error: error.message }); continue; }
    const rows = data || [];
    const byStatus = {};
    for (const r of rows) {
      const s = r.metadata?.status || 'unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
    }
    out.push({
      key: src.key, name: src.name, domain: src.domain,
      inTable: rows.length, inRepo: src.rows().length, byStatus,
      /* Named plainly rather than as a boolean: "stale" is what an operator
         needs to see, and the two numbers say why. */
      stale: rows.length !== src.rows().length,
      titles: rows.map((r) => r.title).sort(),
    });
  }
  return { sources: out };
}

/** The units as data, for a console that wants to show them without a round
 *  trip to Supabase — the repo is the authority either way. */
export function curatedUnits() {
  return CURATED_SOURCES.map((s) => ({
    key: s.key, name: s.name, domain: s.domain,
    units: s.units().map((u) => ({
      title: u.title, status: u.status, relevance_score: u.relevance_score ?? 3,
      concepts: u.concepts || [], frameworks: u.frameworks || [],
      statistics: u.statistics || [],
    })),
  }));
}
