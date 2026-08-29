/**
 * DigiFusion Intelligence Network — Prompt Registry
 * =================================================
 *
 * The resolver. Everything that wants a prompt — the console, the API, a Slack
 * command, and one day an agent — goes through `resolvePrompt()` so there is
 * exactly one answer to "what text does this id produce right now".
 *
 * ── THREE RULES, EACH OF WHICH COST SOMETHING TO LEARN ─────────────────────
 *
 * 1. THE REPO IS THE FLOOR. `prompt.live_version` is NULL until someone
 *    publishes an override, and NULL means "use backend/prompts". So an
 *    un-edited prompt tracks the repo forever, an empty database is a working
 *    system, and a wiped table degrades to known-good text rather than to
 *    nothing. See the header of 0041_prompt_registry.sql.
 *
 * 2. AN UNFILLED VARIABLE IS REPORTED, NOT PASSED THROUGH. A `{{VAR}}` that
 *    reaches a model reads as an instruction to invent something. Operators get
 *    it back as a warning they can act on; anything that SENDS should pass
 *    `strict` and get an exception instead.
 *
 * 3. EDITING IS NOT ACTING. A paused estate must still let you draft, preview
 *    and read history — pausing stops the system reaching the outside world, it
 *    does not stop you working. Publishing an AGENT prompt is the one thing
 *    here that changes live behaviour, so that is the one thing the pause
 *    blocks. Operator prompts publish freely, paused or not.
 *
 * Cached for sixty seconds and invalidated on publish, exactly like
 * systemFlags — a resolve on every keystroke must not become a query on every
 * keystroke, but a publish must be visible immediately.
 */

import { getSupabase } from '../supabaseClient.js';
import { PROMPT_BY_ID, PROMPTS, compose, variablesIn } from '../prompts/index.js';
import { isPaused } from './systemFlags.js';

const CACHE_TTL_MS = 60_000;

/** id → { live_version, audience, updated_at, updated_by } for touched prompts. */
let _rows = null;
let _bodies = new Map();   // `${id}@${version}` → body
let _cachedAt = 0;

export function _invalidateCache() {
  _cachedAt = 0;
  _rows = null;
  _bodies = new Map();
}

function seedOf(id) {
  const p = PROMPT_BY_ID[id];
  if (!p) throw new Error(`unknown prompt "${id}"`);
  return p;
}

/**
 * Load the registry overrides. Returns a Map, possibly empty.
 *
 * A database failure here is deliberately NOT fatal: it logs and returns the
 * last known map (or an empty one), so the worst case is that the console shows
 * repo text rather than an error page. Falling back to something correct beats
 * failing loudly when the fallback IS the documented behaviour.
 */
async function loadRegistry({ db, force = false } = {}) {
  const now = Date.now();
  if (!force && _rows && now - _cachedAt < CACHE_TTL_MS) return _rows;

  const client = db || getSupabase();
  if (!client) { _rows = _rows || new Map(); _cachedAt = now; return _rows; }

  const { data, error } = await client
    .from('prompt')
    .select('id, audience, live_version, updated_at, updated_by');

  if (error) {
    console.error(`[Prompts] registry read failed, falling back to repo: ${error.message}`);
    _rows = _rows || new Map();
    _cachedAt = now;
    return _rows;
  }

  _rows = new Map((data || []).map((r) => [r.id, r]));
  _cachedAt = now;
  return _rows;
}

/** The body of one published version, cached by (id, version). */
async function bodyOfVersion(id, version, db) {
  const key = `${id}@${version}`;
  if (_bodies.has(key)) return _bodies.get(key);

  const client = db || getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from('prompt_version')
    .select('body')
    .eq('prompt_id', id)
    .eq('version', version)
    .maybeSingle();

  if (error || !data) {
    /* A live_version pointing at a row that is not there is a broken registry.
       Resolving to the seed is the right answer — the alternative is throwing,
       which would take a working prompt off the air over a bookkeeping fault. */
    console.error(`[Prompts] ${id} live_version ${version} not found; using repo seed`);
    return null;
  }
  _bodies.set(key, data.body);
  return data.body;
}

/**
 * The current state of one prompt: which body wins, and why.
 * @returns {Promise<{ id, body, version: number|null, origin: 'registry'|'seed', audience, updated_at, updated_by }>}
 */
export async function promptState(id, { db, force = false } = {}) {
  const seed = seedOf(id);
  const rows = await loadRegistry({ db, force });
  const row = rows.get(id);

  if (row?.live_version) {
    const body = await bodyOfVersion(id, row.live_version, db);
    if (body != null) {
      return {
        id, body,
        version: row.live_version,
        origin: 'registry',
        audience: row.audience || 'operator',
        updated_at: row.updated_at || null,
        updated_by: row.updated_by || null,
      };
    }
  }

  return {
    id,
    body: seed.body,
    version: null,
    origin: 'seed',
    audience: row?.audience || 'operator',
    updated_at: row?.updated_at || null,
    updated_by: row?.updated_by || null,
  };
}

/**
 * Resolve and assemble. This is the function everything else should call.
 *
 * @param {string} id
 * @param {object} [opts]
 * @param {object} [opts.vars]      values for {{VARIABLES}}
 * @param {string} [opts.industry]  industry block id
 * @param {*}      [opts.clauses]   clause ids or a preset name
 * @param {boolean}[opts.strict]    throw when variables remain unfilled
 * @returns {Promise<{ text, unfilled, used, version, origin }>}
 */
export async function resolvePrompt(id, opts = {}) {
  const state = await promptState(id, { db: opts.db, force: opts.force });
  const seed = seedOf(id);

  const out = compose({ ...seed, body: state.body }, {
    vars: opts.vars,
    industry: opts.industry,
    clauses: opts.clauses,
    strict: opts.strict,
  });

  return { ...out, version: state.version, origin: state.origin };
}

/** The registry state of every prompt, for the console list. */
export async function registryIndex({ db } = {}) {
  const rows = await loadRegistry({ db, force: true });
  const out = {};
  for (const [id, r] of rows) {
    out[id] = {
      liveVersion: r.live_version || null,
      audience: r.audience || 'operator',
      updatedAt: r.updated_at || null,
      updatedBy: r.updated_by || null,
    };
  }
  return out;
}

/** Every version of one prompt, newest first, plus what the repo currently holds. */
export async function versionsOf(id, { db } = {}) {
  const seed = seedOf(id);
  const client = db || getSupabase();
  const state = await promptState(id, { db, force: true });

  if (!client) return { versions: [], live: state, seedBody: seed.body };

  const { data, error } = await client
    .from('prompt_version')
    .select('version, status, note, created_at, created_by, published_at, published_by, body')
    .eq('prompt_id', id)
    .order('version', { ascending: false });

  if (error) throw new Error(error.message);

  return {
    versions: (data || []).map((v) => ({ ...v, chars: v.body.length })),
    live: state,
    seedBody: seed.body,
  };
}

/**
 * Save a candidate. Never live — that is the whole point of a draft.
 *
 * The prompt row is created here if it does not exist, which is why an
 * untouched prompt has no row: nothing has been drafted for it yet.
 */
export async function saveDraft(id, body, { note = null, actor = 'operator', db } = {}) {
  const seed = seedOf(id);
  const text = String(body ?? '').trim();
  if (!text) throw new Error('a draft with no body is not a draft');

  const client = db || getSupabase();
  if (!client) throw new Error('Supabase not configured');

  const { error: upErr } = await client
    .from('prompt')
    .upsert({ id, audience: seed.audience || 'operator', updated_at: new Date().toISOString(), updated_by: actor },
            { onConflict: 'id' });
  if (upErr) throw new Error(upErr.message);

  const { data: last } = await client
    .from('prompt_version')
    .select('version')
    .eq('prompt_id', id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (last?.version || 0) + 1;

  const { error } = await client
    .from('prompt_version')
    .insert({ prompt_id: id, version, body: text, status: 'draft', note, created_by: actor });
  if (error) throw new Error(error.message);

  _invalidateCache();
  return { id, version, status: 'draft', variables: variablesIn(text) };
}

/**
 * Make a version live. Also the rollback path — rolling back is publishing an
 * older version, and giving it a second name would give it a second code path
 * that could disagree with this one.
 */
export async function publishVersion(id, version, { actor = 'operator', db } = {}) {
  const seed = seedOf(id);
  const client = db || getSupabase();
  if (!client) throw new Error('Supabase not configured');

  /* The pause rule. An operator prompt is a note to yourself and publishes
     whenever you like. An agent prompt is live behaviour — publishing one
     while the estate is paused would mean the thing you resume into is not the
     thing you paused. */
  if ((seed.audience || 'operator') === 'agent' && await isPaused({ db })) {
    throw new Error('the estate is paused — agent prompts cannot be published until it is resumed');
  }

  const { data: row, error: findErr } = await client
    .from('prompt_version')
    .select('version, body')
    .eq('prompt_id', id)
    .eq('version', version)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (!row) throw new Error(`${id} has no version ${version}`);

  const now = new Date().toISOString();

  const { error: vErr } = await client
    .from('prompt_version')
    .update({ status: 'published', published_at: now, published_by: actor })
    .eq('prompt_id', id)
    .eq('version', version);
  if (vErr) throw new Error(vErr.message);

  const { error: pErr } = await client
    .from('prompt')
    .update({ live_version: version, updated_at: now, updated_by: actor })
    .eq('id', id);
  if (pErr) throw new Error(pErr.message);

  _invalidateCache();
  return { id, version, live: true };
}

/**
 * Drop the override and go back to the repo.
 *
 * The versions are kept, not deleted. Reverting is a decision you might want to
 * reverse, and a registry that destroys history on revert punishes the operator
 * for being careful.
 */
export async function revertToSeed(id, { actor = 'operator', db } = {}) {
  seedOf(id);
  const client = db || getSupabase();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client
    .from('prompt')
    .update({ live_version: null, updated_at: new Date().toISOString(), updated_by: actor })
    .eq('id', id);
  if (error) throw new Error(error.message);

  _invalidateCache();
  return { id, origin: 'seed' };
}

/**
 * Record that a prompt was actually taken away and used.
 *
 * Called on COPY, not on compose — see the note in the migration. Failure is
 * swallowed: a telemetry write must never be the reason a copy appears to fail.
 */
export async function recordUsage(entry, { db } = {}) {
  const client = db || getSupabase();
  if (!client) return { recorded: false };
  try {
    const { error } = await client.from('prompt_usage').insert({
      prompt_id: entry.promptId,
      version:   entry.version ?? null,
      industry:  entry.industry || null,
      clauses:   Array.isArray(entry.clauses) ? entry.clauses : null,
      chars:     Number.isFinite(entry.chars) ? entry.chars : null,
      unfilled:  Number.isFinite(entry.unfilled) ? entry.unfilled : null,
      surface:   entry.surface || 'console',
      actor:     entry.actor || 'operator',
    });
    if (error) throw new Error(error.message);
    return { recorded: true };
  } catch (e) {
    console.error(`[Prompts] usage not recorded: ${e.message}`);
    return { recorded: false };
  }
}

/**
 * Usage over a window: counts per prompt, plus the prompts never copied.
 *
 * TEN IS THE THRESHOLD, here as everywhere else in this estate. Below ten uses
 * a pattern is an impression; at ten it is evidence. The console shows the
 * count and lets you decide, but the number is the point — a library where
 * every prompt looks equally used is a library nobody has measured.
 */
export async function usageSummary({ days = 30, db } = {}) {
  const client = db || getSupabase();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const empty = { days, total: 0, byPrompt: {}, unused: PROMPTS.map((p) => p.id) };
  if (!client) return empty;

  const { data, error } = await client
    .from('prompt_usage')
    .select('prompt_id, used_at')
    .gte('used_at', since)
    .limit(5000);

  if (error) {
    console.error(`[Prompts] usage summary failed: ${error.message}`);
    return empty;
  }

  const byPrompt = {};
  for (const r of data || []) {
    byPrompt[r.prompt_id] = (byPrompt[r.prompt_id] || 0) + 1;
  }
  return {
    days,
    total: (data || []).length,
    byPrompt,
    unused: PROMPTS.filter((p) => !byPrompt[p.id]).map((p) => p.id),
  };
}

/**
 * Is the registry actually reachable? Reported at boot beside the library
 * check, because "the console shows repo text" and "the database is down" look
 * identical from the outside and only one of them needs attention.
 */
export async function registryHealth({ db } = {}) {
  const client = db || getSupabase();
  if (!client) return { ok: true, storage: 'none', note: 'no Supabase — every prompt resolves from the repo' };
  try {
    const { count, error } = await client
      .from('prompt')
      .select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return { ok: true, storage: 'supabase', overridden: count || 0 };
  } catch (e) {
    return { ok: false, storage: 'supabase', error: e.message };
  }
}

export async function logRegistryHealth() {
  const h = await registryHealth();
  if (!h.ok) {
    console.error(`[Prompts] registry unreachable — every prompt will resolve from the repo (${h.error})`);
  } else if (h.storage === 'none') {
    console.log('[Prompts] registry: no Supabase configured; resolving from the repo');
  } else {
    console.log(`[Prompts] registry ok — ${h.overridden} prompt(s) with a stored row, the rest resolve from the repo`);
  }
  return h;
}
