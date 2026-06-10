/**
 * Shared approval execution — WhatsApp, Nexus chat, and manual API.
 */

import { handleApprovalReply, findPendingApproval, parseApprovalReply, resolveApproval } from './approvalGate.js';

/**
 * Build a user-facing reply after an approval decision (approve/reject + optional publish).
 */
export async function buildReplyAfterApproval(approval) {
  if (!approval?.handled) return null;

  if (approval.decision === 'approved') {
    if (approval.approvalType === 'blog_post' && approval.payload) {
      try {
        const { executeApprovedBlogPublish } = await import('./blogApprovalFlow.js');
        const blogResult = await executeApprovedBlogPublish(approval.payload);
        const url = blogResult?.url || (blogResult?.slug ? `https://www.digitafusion.com/blog/${blogResult.slug}` : '');
        const caveatNote = approval.caveats?.length
          ? `\n\n(Applied your notes: ${approval.caveats.join('; ').slice(0, 200)})`
          : '';
        return `✅ Approved and published.${caveatNote}\n\n${blogResult.topic || 'Blog post'} is live${url ? `:\n${url}` : ''}.`;
      } catch (blogErr) {
        console.error('[ApprovalActions] Blog publish after approval failed:', blogErr.message);
        return `✅ Approved, but publishing hit an error: ${blogErr.message.slice(0, 200)}. Check PathGuru logs or retry from Command Center.`;
      }
    }
    return `✅ Approved. I'll proceed with: ${approval.subject || approval.approvalType}.`;
  }

  return `❌ Understood. ${approval.approvalType === 'blog_post' ? 'Blog post' : 'Request'} cancelled. Let me know if you want to revisit or change direction.`;
}

/**
 * Process Boss reply text (YES/NO + caveats) when a pending approval exists.
 */
export async function processBossApprovalMessage(replyText) {
  const approval = await handleApprovalReply(replyText);
  if (!approval.handled) return { handled: false, reply: null, approval };
  const reply = await buildReplyAfterApproval(approval);
  return { handled: true, reply, approval };
}

/**
 * Force-resolve the current pending approval (UI / API / emergency).
 */
export async function forceResolvePendingApproval(decision = 'approved', feedback = 'Manual approval via PathGuru') {
  const pending = await findPendingApproval();
  if (!pending) return { handled: false, error: 'No pending approval found' };

  const parsed = decision === 'rejected'
    ? { decision: 'rejected', feedback, caveats: [] }
    : parseApprovalReply(feedback) || { decision: 'approved', feedback, caveats: [] };

  const finalDecision = parsed.decision === 'rejected' ? 'rejected' : (decision === 'rejected' ? 'rejected' : 'approved');

  await resolveApproval(pending.id, finalDecision, feedback);

  const input = typeof pending.input === 'string' ? JSON.parse(pending.input) : (pending.input || {});
  const caveats = parsed.caveats || [];
  const approval = {
    handled:      true,
    decision:     finalDecision,
    approvalId:   pending.id,
    approvalType: input.approvalType || null,
    payload: {
      ...(input.payload || {}),
      bossFeedback: feedback,
      bossCaveats:  caveats,
      conditionalApproval: caveats.length > 0,
    },
    subject:  input.subject || pending.title,
    feedback,
    caveats,
    conditional: caveats.length > 0,
  };

  const reply = await buildReplyAfterApproval(approval);
  return { handled: true, reply, approval };
}

/** True when Boss is asking about blog/approval status, not issuing YES/NO. */
export function isApprovalStatusQuery(text) {
  const raw = (text || '').trim();
  if (!raw) return false;
  if (parseApprovalReply(raw).decision) return false;

  const t = raw.toLowerCase();

  // "Still waiting" alone often means Orion research — not blog approval.
  if (/still waiting/i.test(t) && !/approval|blog|yes|publish|whatsapp|wa\b/i.test(t)) {
    return false;
  }
  if (/orion|researcher|research\s+(result|report|brief)|nocopo|deliverable/i.test(t)) {
    return false;
  }

  return /approval|gotten|received|waiting.*(yes|approval|blog)|pending.*(blog|approval)|have you.*(approval|yes|blog)|did you (get|receive).*(approval|yes|blog)|sent.*yes|honor|whatsapp|via wa|don'?t know if you got|got my (reply|message|response)/i.test(t);
}

/** Boss asking whether WhatsApp / webhook received their reply. */
export function isWhatsAppApprovalQuery(text) {
  const t = (text || '').toLowerCase();
  return /whatsapp|via wa|twilio|don'?t know if you got|got my (reply|message|response)|sent.*(whatsapp|wa|response)/i.test(t);
}

/**
 * Explain approval channels + whether WhatsApp reply was recorded (DB truth).
 */
export async function buildApprovalChannelGuidance(includeNotion = false) {
  const { buildApprovalStatusReply } = await import('./approvalStatus.js');
  const status = await buildApprovalStatusReply();
  const pending = await findPendingApproval();
  const publicUrl = (process.env.PATHGURU_PUBLIC_URL || 'https://pathguru-publishers.onrender.com').replace(/\/$/, '');
  const webhook = `${publicUrl}/api/webhooks/whatsapp`;

  const lines = [status, ''];

  if (pending) {
    lines.push('Your WhatsApp YES has **not** been recorded in PathGuru yet (still pending in Supabase).');
    lines.push(`If you already replied on WhatsApp, check Twilio webhook → \`${webhook}\` and OWNER_PHONE matches your number.`);
    lines.push('**Fastest fix:** type YES here now (caveats OK: "YES but shorten the intro"), or Command Center → Approve & Publish.');
  } else {
    lines.push('No approval is pending — if you sent YES on WhatsApp it was already processed.');
  }

  if (includeNotion) {
    const notionOk = !!(process.env.NOTION_API_KEY && process.env.NOTION_TASKS_DB_ID);
    lines.push('');
    lines.push(notionOk
      ? '**Notion:** connected. I can log tasks ("log meeting to notion"), sync CEO dashboard ("sync notion"), and create client projects on lifecycle events.'
      : '**Notion:** not fully configured — set NOTION_API_KEY and NOTION_TASKS_DB_ID on Render to enable logging and CEO sync.');
  }

  return lines.join('\n');
}

export function getNotionCapabilityReply() {
  const notionOk = !!(process.env.NOTION_API_KEY && process.env.NOTION_TASKS_DB_ID);
  if (!notionOk) {
    return 'Boss, Notion isn\'t wired on this server yet — add NOTION_API_KEY and NOTION_TASKS_DB_ID in Render env. Once set, Nexus will auto-log Orion research deliverables, sync the CEO dashboard, and push client lifecycle updates.';
  }
  return 'Yes Boss — Notion is connected and **only Nexus** writes to it from the agent network. Orion research is auto-logged to the Tasks DB (Type: research_deliverable) when a brief completes. I also sync the CEO dashboard ("sync notion") and client lifecycle pages. Manual logs: "log strategy call with Acme to notion".';
}
