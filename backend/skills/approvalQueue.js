/**
 * DigiFusion Intelligence Network — Approvals Queue
 * =================================================
 * Operator-facing read + decide surface for pending approval tasks.
 *
 * Approval requests are stored in the tasks table as type `pending_approval`
 * (title `[APPROVAL] …`). They wait on the Boss, so nothing here auto-approves:
 * every transition is an explicit operator decision. The child tasks (the work
 * an agent already completed, e.g. the Orion research brief) are attached so
 * the operator can read the evidence before deciding.
 */

import { getSupabase } from '../supabaseClient.js';
import { resolveApproval } from './approvalGate.js';
import { buildReplyAfterApproval } from './approvalActions.js';

const APPROVAL_TASK_TYPE = 'pending_approval';

function safeJson(value) {
  if (value == null) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

/**
 * List pending approval tasks with their child task output attached.
 * @returns {{ approvals: Array<object>, total: number, error?: string }}
 */
export async function listPendingApprovals() {
  const db = getSupabase();
  if (!db) return { approvals: [], total: 0 };

  const { data, error } = await db.from('tasks')
    .select('*')
    .eq('type', APPROVAL_TASK_TYPE)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return { approvals: [], total: 0, error: error.message };

  const rows = data || [];
  const ids = rows.map((r) => r.id);

  let children = [];
  if (ids.length) {
    const { data: kids } = await db.from('tasks')
      .select('id, parent_task_id, title, agent_id, status, type, output, error, created_at, completed_at')
      .in('parent_task_id', ids)
      .order('created_at', { ascending: true });
    children = kids || [];
  }

  const approvals = rows.map((a) => ({
    ...a,
    input: safeJson(a.input),
    childTasks: children.filter((c) => c.parent_task_id === a.id),
  }));

  return { approvals, total: approvals.length };
}

/**
 * Resolve one pending approval by id.
 * @param {string} approvalId
 * @param {'approve'|'reject'} decision
 * @param {string} note — operator note stored on the resolved task
 * @returns {{ handled: boolean, error?: string, reply?: string, approval?: object }}
 */
export async function decideApproval(approvalId, decision, note = '', metadata = {}, event = {}) {
  const db = getSupabase();
  if (!db) return { handled: false, error: 'Supabase not configured' };

  const { data: pending } = await db.from('tasks')
    .select('*')
    .eq('id', approvalId)
    .eq('type', APPROVAL_TASK_TYPE)
    .eq('status', 'pending')
    .maybeSingle();

  if (!pending) return { handled: false, error: 'Approval not found or already resolved' };

  const input = safeJson(pending.input);
  const resolvedDecision = decision === 'approve' ? 'approved' : 'rejected';
  const editedDraft = metadata.editedDraft || null;

  const approval = {
    handled: true,
    decision: resolvedDecision,
    approvalId: pending.id,
    approvalType: input.approvalType || null,
    payload: {
      ...(input.payload || {}),
      bossFeedback: note,
      ...(editedDraft ? { draftBody: editedDraft, draft: editedDraft } : {}),
    },
    subject: input.subject || pending.title,
    feedback: note,
    caveats: [],
    conditional: false,
  };

  const resolved = await resolveApproval(approvalId, resolvedDecision, note, metadata, event);
  if (!resolved) return { handled: false, error: 'Failed to persist approval decision' };

  // Email drafts: the approval references an inbound_message row. Approving moves
  // that draft to `approved` (visible on /api/outbound/approved for the sender);
  // rejecting parks it. An edited draft replaces the stored reply body before it
  // is handed to Make. This keeps every approval surface consistent.
  if (input.approvalType === 'email_reply' && input.payload?.inboundMessageId) {
    const draftStatus = resolvedDecision === 'approved' ? 'approved' : 'rejected';
    const patch = {
      status:      draftStatus,
      approved_at: resolvedDecision === 'approved' ? new Date().toISOString() : null,
    };
    if (editedDraft) patch.draft_body = editedDraft;
    await db.from('inbound_message')
      .update(patch)
      .eq('id', input.payload.inboundMessageId);
  }

  const reply = await buildReplyAfterApproval(approval);
  return { handled: true, reply, approval };
}
