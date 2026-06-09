/**
 * DigiFusion Intelligence Network — Approval Gate
 * =================================================
 * Manages Boss approval requests for agent-initiated actions.
 *
 * Flow:
 *   1. Agent wants to do something that needs Boss sign-off
 *   2. createApprovalRequest() → saves to tasks table + fires WhatsApp immediately
 *   3. Boss replies via WhatsApp → webhook calls handleApprovalReply()
 *   4. If approved → executes the stored callback / payload
 *   5. If rejected → marks cancelled, notifies Boss
 *
 * Rules:
 *   - User-initiated actions (blog publisher, direct UI) → BYPASS this gate
 *   - Agent-initiated actions (Nexus orchestration) → ALWAYS go through this gate
 *   - Nexus fires WhatsApp and WAITS — no auto-proceed on timeout
 */

import { getSupabase }   from '../supabaseClient.js';
import { sendImmediate } from './notifier.js';

const APPROVAL_TASK_TYPE = 'pending_approval';

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a pending approval request, persist it to Supabase, and fire
 * an immediate WhatsApp notification to Boss.
 *
 * @param {object} opts
 * @param {string} opts.approvalType  — 'blog_post' | 'content_publish' | 'outreach' | etc.
 * @param {string} opts.subject       — Short subject (used as WhatsApp message title)
 * @param {string} opts.detail        — Full detail message for Boss
 * @param {object} opts.payload       — Everything needed to execute the action when approved
 *                                      (e.g. blog topic, tone, author, seoKeyword …)
 * @returns {{ approvalId: string|null, whatsappSent: boolean }}
 */
export async function createApprovalRequest({ approvalType, subject, detail, payload }) {
  const db = getSupabase();

  let approvalId = null;

  if (db) {
    const { data, error } = await db.from('tasks').insert({
      title:       `[APPROVAL] ${subject}`,
      description: detail,
      agent_id:    'nexus',
      created_by:  'nexus',
      status:      'pending',
      priority:    1,                         // highest priority — Boss is waiting
      type:        APPROVAL_TASK_TYPE,
      input:       {
        approvalType,
        subject,
        detail,
        payload,
        requestedAt: new Date().toISOString(),
      },
    }).select('id').single();

    if (error) {
      console.error('[ApprovalGate] Failed to save approval request:', error.message);
    } else {
      approvalId = data?.id || null;
    }
  }

  // Build WhatsApp message — concise, action-oriented
  const shortId  = approvalId ? approvalId.slice(0, 8) : 'N/A';
  const waTitle  = `⏸ Nexus — Approval Required`;
  const waBody   = [
    `*${subject}*`,
    ``,
    detail,
    ``,
    `Reply *YES* to approve or *NO* to reject.`,
    `_(Ref: ${shortId})_`,
  ].join('\n');

  let whatsappSent = false;
  try {
    const result = await sendImmediate(waTitle, waBody, 'whatsapp');
    whatsappSent = !result?.whatsapp?.skipped && !result?.whatsapp?.error;
    console.log(`[ApprovalGate] WhatsApp sent for approval ${shortId}:`, JSON.stringify(result).slice(0, 120));
  } catch (e) {
    console.error('[ApprovalGate] WhatsApp dispatch failed:', e.message);
  }

  return { approvalId, whatsappSent };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIND
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the most recent pending approval request (if any).
 * Called by the WhatsApp webhook before routing to Nexus chat.
 *
 * @returns {object|null} Supabase task row or null
 */
/** Extract 8-char ref from Boss message, e.g. "Ref: ad49f245" */
export function extractApprovalRef(text = '') {
  const m = String(text).match(/\b(?:ref[:\s#]*)?([a-f0-9]{8})\b/i);
  return m?.[1]?.toLowerCase() || null;
}

export async function findPendingApproval(refPrefix = null) {
  const db = getSupabase();
  if (!db) return null;

  let q = db.from('tasks')
    .select('*')
    .eq('type',   APPROVAL_TASK_TYPE)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(refPrefix ? 20 : 1);

  const { data, error } = await q;

  if (error) {
    console.error('[ApprovalGate] findPendingApproval error:', error.message);
    return null;
  }

  if (!refPrefix) return data?.[0] || null;

  const hit = (data || []).find(row => String(row.id || '').toLowerCase().startsWith(refPrefix.toLowerCase()));
  return hit || data?.[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSE BOSS REPLY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse Boss's WhatsApp reply text into a decision.
 *
 * @param {string} text — Raw reply from Boss
 * @returns {{ decision: 'approved'|'rejected'|null, feedback: string }}
 */
/**
 * Parse Boss WhatsApp reply — supports plain YES/NO and conditional approval with caveats.
 * e.g. "YES but shorten the intro" → approved + caveats[]
 */
export function parseApprovalReply(text) {
  const raw = (text || '').trim();
  const t = raw.toLowerCase();

  const rejected = /^(no|nope|reject[ed]?|cancel|stop|don'?t|hold|wait|not yet|abort|pause|skip|❌|👎)\b/i.test(t)
    || /^change\b/i.test(t) || /^revise\b/i.test(t) || /^redo\b/i.test(t)
    || /\b(don'?t publish|do not publish|hold off)\b/i.test(t);

  if (rejected) return { decision: 'rejected', feedback: raw, caveats: [] };

  const approvedLead = /^(yes|yep|yup|yeah|approve[d]?|go ahead|proceed|confirm[ed]?|ok|okay|do it|publish|send it|looks good|fire it|go|green light|sure|affirmative|✅|👍)\b/i.test(t)
    || /\b(i approve|you have my approval|my approval|please publish|go for it|sounds good|that'?s fine|you can publish)\b/i.test(t)
    || /\b(yes|approve[d]?|go ahead|proceed|publish)\b/i.test(t);

  if (!approvedLead) {
    return { decision: null, feedback: raw, caveats: [] };
  }

  const caveats = extractCaveats(raw);
  return {
    decision:  'approved',
    feedback:  raw,
    caveats,
    conditional: caveats.length > 0,
  };
}

/** Pull Boss edit instructions from "YES but …", "approve with …", etc. */
export function extractCaveats(text = '') {
  const raw = String(text).trim();
  const patterns = [
    /\b(?:yes|yep|approve[d]?|ok|go ahead|proceed)[,.]?\s+(?:but|however|except|with caveat[s]?:?|only if|just)\s+(.+)/i,
    /\bapprove\s+with\s+(.+)/i,
    /\bwith\s+(?:these\s+)?changes?:\s*(.+)/i,
    /\bcaveat[s]?:\s*(.+)/i,
  ];
  for (const pat of patterns) {
    const m = raw.match(pat);
    if (m?.[1]?.trim()) return [m[1].trim()];
  }
  if (/\b(but|however)\b/i.test(raw) && approvedWithoutLead(raw)) {
    const after = raw.split(/\b(?:but|however)\b/i)[1];
    if (after?.trim()) return [after.trim()];
  }
  return [];
}

function approvedWithoutLead(raw) {
  return /\b(yes|approve|ok|proceed|publish|go ahead)\b/i.test(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark an approval as approved or rejected in Supabase.
 *
 * @param {string} approvalId
 * @param {'approved'|'rejected'} decision
 * @param {string} [feedback] — Boss's raw reply text
 * @returns {object|null} Updated task row
 */
export async function resolveApproval(approvalId, decision, feedback = '') {
  const db = getSupabase();
  if (!db) return null;

  const newStatus = decision === 'approved' ? 'completed' : 'cancelled';

  const { data, error } = await db.from('tasks')
    .update({
      status:     newStatus,
      output:     { decision, feedback, resolvedAt: new Date().toISOString() },
      completed_at: new Date().toISOString(),
    })
    .eq('id', approvalId)
    .select()
    .single();

  if (error) {
    console.error('[ApprovalGate] resolveApproval error:', error.message);
    return null;
  }

  console.log(`[ApprovalGate] Approval ${approvalId.slice(0,8)} → ${decision}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLE REPLY — full cycle: parse + resolve + return payload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by the WhatsApp webhook when a message arrives.
 * Checks for a pending approval, parses the reply, resolves it.
 *
 * @param {string} replyText — Boss's raw WhatsApp message
 * @returns {{
 *   handled: boolean,
 *   decision: 'approved'|'rejected'|null,
 *   approvalType: string|null,
 *   payload: object|null,
 *   feedback: string
 * }}
 */
export async function handleApprovalReply(replyText) {
  const refPrefix = extractApprovalRef(replyText);
  const pending = await findPendingApproval(refPrefix);
  if (!pending) return { handled: false, decision: null, approvalType: null, payload: null, feedback: replyText };

  const { decision, feedback, caveats = [], conditional = false } = parseApprovalReply(replyText);
  if (!decision) {
    return { handled: false, decision: null, approvalType: null, payload: null, feedback: replyText, caveats: [] };
  }

  await resolveApproval(pending.id, decision, feedback);

  const input = typeof pending.input === 'string' ? JSON.parse(pending.input) : (pending.input || {});
  const payload = {
    ...(input.payload || {}),
    bossFeedback:   feedback,
    bossCaveats:    caveats,
    conditionalApproval: conditional,
  };

  return {
    handled:      true,
    decision,
    approvalId:   pending.id,
    approvalType: input.approvalType || null,
    payload,
    subject:      input.subject      || pending.title,
    feedback,
    caveats,
    conditional,
  };
}
