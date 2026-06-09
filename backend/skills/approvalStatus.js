/**
 * Approval status — fast DB lookups for Nexus chat (no LLM required).
 */

import { findPendingApproval } from './approvalGate.js';
import { getLastBlogPublishDate, getPendingApprovalCount } from './nexusCeoOps.js';

export async function buildApprovalStatusReply() {
  const [pending, pendingCount, lastBlog] = await Promise.all([
    findPendingApproval(),
    getPendingApprovalCount(),
    getLastBlogPublishDate().catch(() => null),
  ]);

  const lines = [];

  if (pending) {
    const input = typeof pending.input === 'string' ? JSON.parse(pending.input) : (pending.input || {});
    const payload = input.payload || {};
    const title = payload.proposedTitle || input.subject || pending.title || 'Blog post';
    lines.push(`⏸ **Still waiting on your YES**, Boss.`);
    lines.push(`Pending: *${String(title).slice(0, 80)}*`);
    lines.push(`Reply YES on WhatsApp to publish (or NO to cancel). You can add caveats: "YES but shorten the intro".`);
    lines.push(`Ref: ${pending.id?.slice(0, 8) || 'n/a'}`);
    return lines.join('\n');
  }

  if (pendingCount > 0) {
    lines.push(`I show ${pendingCount} pending approval(s) in the queue — check Tasks for detail.`);
  } else {
    lines.push(`✅ No blog approval is pending right now.`);
  }

  const db = (await import('../supabaseClient.js')).getSupabase();
  if (db) {
    const { data: recent } = await db.from('tasks')
      .select('title, status, output, completed_at, created_at')
      .eq('type', 'pending_approval')
      .in('status', ['completed', 'cancelled'])
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(3);

    const last = recent?.[0];
    if (last) {
      const out = typeof last.output === 'string' ? JSON.parse(last.output) : (last.output || {});
      if (last.status === 'completed' && out.decision === 'approved') {
        const when = last.completed_at || last.created_at;
        lines.push(`Last decision: **approved**${when ? ` (${new Date(when).toLocaleString()})` : ''}.`);
        if (out.feedback && out.feedback.length > 20) {
          lines.push(`Your note: "${String(out.feedback).slice(0, 120)}"`);
        }
      } else if (last.status === 'cancelled') {
        lines.push(`Last decision: **rejected/cancelled**.`);
      }
    }
  }

  if (lastBlog) {
    const days = Math.round((Date.now() - new Date(lastBlog).getTime()) / 86400000);
    lines.push(`Last published blog: ${days === 0 ? 'today' : `${days}d ago`}.`);
  }

  return lines.join('\n');
}
