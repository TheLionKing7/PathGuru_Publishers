/**
 * Approval event audit trail.
 *
 * Every approval decision — Slack button, WhatsApp YES/NO, web console — writes
 * one row to approval_event. The row is the answer to "who approved what, when,
 * from where", as a single query, instead of an archaeology exercise through
 * the approval task's output blob.
 */

import { getSupabase } from '../supabaseClient.js';

/**
 * Record one approval decision. Best-effort: the decision itself is already
 * persisted on the task; this only fails loudly (a logged warning), never
 * throws, so an audit insert cannot take down the approval path.
 *
 * @returns {object|null} inserted row, or null on failure.
 */
export async function recordApprovalEvent({
  approvalId = null,
  approvalType = null,
  subject = null,
  decision = null,
  feedback = null,
  slackUserId = null,
  slackUsername = null,
  channel = null,
  surface = null,
}) {
  const db = getSupabase();
  if (!db) return null;
  if (decision !== 'approved' && decision !== 'rejected') return null;

  try {
    const { data, error } = await db.from('approval_event').insert({
      approval_id:    approvalId || null,
      approval_type:  approvalType || null,
      subject:        subject ? String(subject).slice(0, 500) : null,
      decision,
      feedback:       feedback ? String(feedback).slice(0, 4000) : null,
      slack_user_id:  slackUserId ? String(slackUserId).slice(0, 120) : null,
      slack_username: slackUsername ? String(slackUsername).slice(0, 120) : null,
      channel:        channel ? String(channel).slice(0, 120) : null,
      surface:        surface ? String(surface).slice(0, 40) : null,
      decided_at:     new Date().toISOString(),
    }).select().single();

    if (error) {
      console.warn('[ApprovalEvent] insert failed:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('[ApprovalEvent] record failed:', e.message);
    return null;
  }
}

/**
 * Query the audit trail. The one query that answers "who approved what".
 *
 * @param {object} opts
 * @param {string|null} opts.approvalId — filter to one approval task
 * @param {'approved'|'rejected'|null} opts.decision
 * @param {string|null} opts.surface — 'slack' | 'whatsapp' | 'web'
 * @param {number} opts.limit
 */
export async function listApprovalEvents({ approvalId = null, decision = null, surface = null, limit = 200 } = {}) {
  const db = getSupabase();
  if (!db) return { events: [] };

  const n = Math.min(Number(limit) || 200, 500);
  let q = db.from('approval_event').select('*').order('decided_at', { ascending: false }).limit(n);
  if (approvalId) q = q.eq('approval_id', approvalId);
  if (decision) q = q.eq('decision', decision);
  if (surface) q = q.eq('surface', surface);

  const { data, error } = await q;
  if (error) return { events: [], error: error.message };
  return { events: data || [] };
}
