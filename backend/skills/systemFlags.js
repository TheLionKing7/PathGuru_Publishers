/**
 * DigiFusion Intelligence Network — System Flags
 * ==============================================
 * One switch for the whole estate. `agents_paused` lives in public.system_flag
 * and is consulted by every path with an external side effect before it acts.
 *
 *   isPaused()  — cached for 15s so a paused system never thrashes the DB on
 *                 every webhook / cron tick, yet a resume is visible within one
 *                 cache window.
 *   setPaused() — writes the flag and invalidates the cache immediately, so a
 *                 pause takes effect on the very next side-effect path.
 *
 * Reads/writes go through the service-role Supabase client (see supabaseClient.js).
 */

import { getSupabase } from '../supabaseClient.js';

const FLAG_KEY     = 'agents_paused';
const CACHE_TTL_MS = 15_000;

let _cachedValue = false;
let _cachedAt    = 0;

/** Drop the in-memory cache — used by tests and after an external flag write. */
export function _invalidateCache() {
  _cachedAt = 0;
}

/**
 * True when the estate is paused. Cached for 15 seconds.
 *
 * @param {object} [opts]
 * @param {object} [opts.db]    — Supabase client override (tests / dependency injection)
 * @param {boolean} [opts.force] — bypass the cache and re-read the DB
 * @returns {Promise<boolean>}
 */
export async function isPaused({ db, force = false } = {}) {
  const now = Date.now();
  if (!force && now - _cachedAt < CACHE_TTL_MS) return _cachedValue;

  const client = db || getSupabase();
  if (!client) return _cachedValue; // no DB → keep the last known value

  const { data, error } = await client
    .from('system_flag')
    .select('value')
    .eq('key', FLAG_KEY)
    .maybeSingle();

  const value = !error && data ? data.value === true : _cachedValue;
  _cachedValue = value;
  _cachedAt    = Date.now();
  return value;
}

/**
 * Set the global pause flag.
 *
 * @param {boolean} value    — true = paused, false = resumed
 * @param {string} [actor]   — who flipped the switch (operator, slack:<id>, …)
 * @param {object} [opts]
 * @param {object} [opts.db] — Supabase client override (tests)
 * @returns {Promise<{ paused: boolean }>}
 */
export async function setPaused(value, actor = 'operator', { db } = {}) {
  const client = db || getSupabase();
  if (!client) throw new Error('Supabase not configured');

  const paused = Boolean(value);
  const { error } = await client
    .from('system_flag')
    .upsert({
      key:        FLAG_KEY,
      value:      paused,
      updated_at: new Date().toISOString(),
      updated_by: actor || null,
    }, { onConflict: 'key' });

  if (error) throw new Error(error.message);

  _cachedValue = paused;
  _cachedAt    = Date.now();
  return { paused };
}
