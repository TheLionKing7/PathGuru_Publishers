/**
 * DigiFusion Intelligence Network — Task purge
 * ============================================
 * Permanently removes old terminal tasks so the activity journal stays legible.
 * Deleting a task is safe because 0025_task_fk_cascade.sql sets
 * agent_memory.task_id, tasks.parent_task_id and agents.current_task_id to
 * ON DELETE SET NULL — a delete is a delete.
 */

import { getSupabase } from '../supabaseClient.js';

export const DEFAULT_PURGE_DAYS = 30;
export const DEFAULT_PURGE_STATUSES = ['completed', 'cancelled'];

/** Resolve body params to concrete statuses + a `before` Date (defaults applied). */
export function resolvePurgeParams({ before, statuses } = {}) {
  const resolved = Array.isArray(statuses) && statuses.length ? statuses : DEFAULT_PURGE_STATUSES;
  const date = before ? new Date(before) : new Date(Date.now() - DEFAULT_PURGE_DAYS * 86400000);
  return { statuses: resolved, before: date };
}

/** Pending tasks may be purged only when the caller explicitly opts in. */
export function isPurgeAllowed(statuses, allowPending) {
  if (statuses.includes('pending') && allowPending !== true) return false;
  return true;
}

/** Count tasks that would be removed (for the console confirmation). */
export async function countTasksToPurge(db, { before, statuses }) {
  const { count, error } = await db.from('tasks')
    .select('id', { count: 'exact', head: true })
    .in('status', statuses)
    .lt('created_at', before.toISOString());
  if (error) throw new Error(error.message);
  return count || 0;
}

/** Delete matching tasks; returns the number removed. */
export async function purgeTasks(db, { before, statuses }) {
  const { count, error } = await db.from('tasks')
    .delete({ count: 'exact' })
    .in('status', statuses)
    .lt('created_at', before.toISOString());
  if (error) throw new Error(error.message);
  return count || 0;
}

/** Nightly default: completed + cancelled older than 30 days. */
export async function runNightlyPurge(db = getSupabase()) {
  if (!db) return { removed: 0, error: 'no_db' };
  const { statuses, before } = resolvePurgeParams();
  const removed = await purgeTasks(db, { before, statuses });
  return { removed, before: before.toISOString(), statuses };
}
