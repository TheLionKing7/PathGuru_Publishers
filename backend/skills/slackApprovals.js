/**
 * DigiFusion Intelligence Network — Slack Approval Surface
 * ========================================================
 * Verifies Slack's x-slack-signature and posts Block Kit approval messages to a
 * Slack Incoming Webhook. Approve / Reject / Edit buttons carry the approval
 * task id in their `value`; approve reuses the existing approvals route logic
 * (approvalQueue.decideApproval) and the referenced draft is marked approved.
 *
 * No secrets (webhook URL, signing secret, draft bodies) are ever logged.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { decideApproval } from './approvalQueue.js';

function env(name) {
  return (process.env[name] || '').trim();
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Verify Slack's request signature (v0 scheme) + 5-minute freshness. */
export function verifySlackSignature({ rawBody, timestamp, signature }) {
  const secret = env('SLACK_SIGNING_SECRET');
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/**
 * Parse a Slack request body. Interactivity posts application/x-www-form-urlencoded
 * with a single `payload` field carrying URL-encoded JSON; the Events API (and
 * other callers) post raw JSON. Returns the decoded payload object, or null when
 * it cannot be parsed.
 */
export function parseSlackPayload(rawBody, contentType = '') {
  const text = String(rawBody || '');
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('application/x-www-form-urlencoded')) {
    const field = new URLSearchParams(text).get('payload');
    if (!field) return null;
    try { return JSON.parse(field); } catch { return null; }
  }
  try { return JSON.parse(text || '{}'); } catch { return null; }
}

function mrkdwn(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Post a Block Kit approval message (subject + draft + Approve/Reject/Edit) to
 * the Slack Incoming Webhook. Returns skipped when SLACK_WEBHOOK_URL is unset.
 */
export async function postSlackApproval({ approvalId, subject, detail, draftBody }) {
  const webhookUrl = env('SLACK_WEBHOOK_URL');
  if (!webhookUrl) return { skipped: true, reason: 'no_slack_webhook_url' };

  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*Approval required — ${mrkdwn(subject || '')}*` } },
  ];
  const body = String(draftBody || detail || '');
  if (body) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '```' + body.slice(0, 2800) + '```' } });
  }
  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: 'Approve' }, style: 'primary', action_id: 'approve', value: String(approvalId) },
      { type: 'button', text: { type: 'plain_text', text: 'Reject' },  style: 'danger',  action_id: 'reject',  value: String(approvalId) },
      { type: 'button', text: { type: 'plain_text', text: 'Edit' },                       action_id: 'edit',    value: String(approvalId) },
    ],
  });

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
    if (!res.ok) {
      // Log only the status — never the webhook URL or message body.
      console.warn(`[Slack] approval notify failed: HTTP ${res.status}`);
      return { skipped: false, error: `HTTP ${res.status}` };
    }
    return { skipped: false, ok: true };
  } catch (e) {
    console.warn('[Slack] approval notify failed:', e.message);
    return { skipped: false, error: e.message };
  }
}

async function postToResponseUrl(responseUrl, text) {
  if (!responseUrl) return;
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.warn('[Slack] response post failed:', e.message);
  }
}

/** Handle a Slack block_actions interaction: Approve / Reject / Edit buttons. */
export async function handleSlackBlockAction(payload) {
  const user = payload.user?.username || payload.user?.name || payload.user?.id || 'operator';
  const results = [];

  for (const action of payload.actions || []) {
    const actionId = action.action_id || '';
    const taskId   = action.value || '';
    if (!taskId) continue;

    if (actionId === 'approve' || actionId === 'reject') {
      const decision = actionId === 'approve' ? 'approve' : 'reject';
      const note = `${decision === 'approve' ? 'Approved' : 'Rejected'} via Slack by @${user}`;
      // Reuses the approvals route logic: resolves the task AND (for email_reply)
      // sets the referenced draft's status to approved / rejected.
      const result = await decideApproval(taskId, decision, note);
      results.push({ actionId, handled: result.handled, reply: result.reply });
      await postToResponseUrl(payload.response_url,
        decision === 'approve'
          ? `:white_check_mark: *Approved* by @${user} — the draft is now queued for outbound.`
          : `:x: *Rejected* by @${user}.`);
    } else if (actionId === 'edit') {
      results.push({ actionId, handled: true });
      await postToResponseUrl(payload.response_url,
        `:pencil2: *Edit requested* by @${user} for approval \`${String(taskId).slice(0, 8)}\`. Reply in this thread with the revised text.`);
    }
  }

  return { ok: true, results };
}
