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
import { isPaused } from './systemFlags.js';
import { getSupabase } from '../supabaseClient.js';
import { postSlackMessage, recordNotificationAttempt, slackChannelFor, slackChatUpdate, slackOpenView } from './slackNotify.js';

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

function approvalTypeLabel(type) {
  const map = {
    email_reply:         'Email reply',
    blog_post:           'Blog post',
    content_commission:  'Content commission',
  };
  return map[type] || 'Approval';
}

function buildFactsMarkdown(approvalType, payload) {
  const p = payload || {};
  if (approvalType === 'email_reply') {
    const e = p.extracted || {};
    return [
      `*Classification:* ${p.classification || '—'}`,
      `*Sender:* ${e.senderName || '—'}`,
      `*Organisation:* ${e.organisation || '—'}`,
      `*Stated need:* ${e.statedNeed || '—'}`,
    ].join('\n');
  }
  if (approvalType === 'blog_post' && p.proposedTitle) {
    const lines = [`*Title:* ${p.proposedTitle}`];
    if (p.recommendedAuthor) lines.push(`*Author:* ${p.recommendedAuthor}`);
    if (p.recommendedTone) lines.push(`*Tone:* ${p.recommendedTone}`);
    return lines.join('\n');
  }
  if (approvalType === 'content_commission' && p.angle) {
    return `*Angle:* ${p.angle}`;
  }
  return '';
}

/**
 * Post a Block Kit approval card: what kind of approval, the classification +
 * extracted facts (so the human checks a judgement, not proofreads), the draft
 * in a quoted section, then Approve / Reject / Edit.
 */
export async function postSlackApproval({ approvalId, subject, detail, approvalType, payload, channel: targetChannel, threadTs }) {
  /* NOT gated on the pause, and the distinction is the whole point of the
     switch. An approval card is the system ASKING THE HUMAN. It is the opposite
     of autonomous action — suppressing it is how a paused estate goes quiet
     about a live prospect while looking healthy. What the pause stops is the
     send that would follow an approval, and that gate lives in
     listApprovedDrafts(), untouched.
     
     The card says so on its face, so nobody approves expecting an immediate
     send. Approving while paused is legitimate: it clears the decision, and the
     send goes the moment the estate resumes. */
  const paused = await isPaused();

  const channel = targetChannel || slackChannelFor('approval');
  if (!channel) {
    await recordNotificationAttempt({ channel: 'slack', target: '', ok: false, error: 'SLACK_APPROVAL_CHANNEL unset' });
    return { ok: false, error: 'SLACK_APPROVAL_CHANNEL unset' };
  }

  const kindLabel = approvalTypeLabel(approvalType);
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${mrkdwn(kindLabel)} approval required*` } },
  ];

  /* Say it on the card rather than in a runbook. Somebody approving at 6am
     needs to know why nothing left the building. */
  if (paused) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: ':double_vertical_bar: The estate is paused. Approve if it is right — nothing sends until you `/resume`.',
      }],
    });
  }

  const facts = buildFactsMarkdown(approvalType, payload);
  if (facts) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: facts } });

  const draft = String(payload?.draftBody || payload?.draft || '').trim();
  if (draft) {
    const quoted = draft.split('\n').map((l) => `> ${l}`).join('\n').slice(0, 2800);
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Draft:*\n${quoted}` } });
  } else if (detail) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: mrkdwn(detail).slice(0, 2800) } });
  }

  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: 'Approve' }, style: 'primary', action_id: 'approve', value: String(approvalId) },
      { type: 'button', text: { type: 'plain_text', text: 'Reject' },  style: 'danger',  action_id: 'reject',  value: String(approvalId) },
      { type: 'button', text: { type: 'plain_text', text: 'Edit' },                       action_id: 'edit',    value: String(approvalId) },
    ],
  });

  const res = await postSlackMessage({ channel, text: `${kindLabel} approval required — ${subject || ''}`, blocks, threadTs });
  await recordNotificationAttempt({ channel: 'slack', target: channel, ok: res.ok, providerId: res.providerId, error: res.error });

  if (!res.ok) {
    console.warn('[Slack] approval notify failed:', res.error);
    return { ok: false, error: res.error };
  }
  return { ok: true, providerId: res.providerId };
}

function safeParseJson(value) {
  if (value == null) return {};
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return {}; } }
  return value;
}

async function fetchApprovalDraft(approvalId) {
  const db = getSupabase();
  if (!db) return '';
  const { data } = await db.from('tasks').select('input').eq('id', approvalId).eq('type', 'pending_approval').maybeSingle();
  const input = safeParseJson(data?.input);
  const p = input.payload || {};
  return String(p.draftBody || p.draft || '').trim();
}

/** Rewrite the card in place with chat.update: who decided, what, when. */
async function rewriteCard({ channel, ts, decision, user, note }) {
  if (!channel || !ts) return;
  const when = new Date().toISOString();
  const emoji = decision === 'Approved' ? ':white_check_mark:' : (decision === 'Rejected' ? ':x:' : ':pencil2:');
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *${decision}*` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `by @${mrkdwn(user)} · ${when}` }] },
  ];
  if (note) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: String(note).slice(0, 2800) } });
  await slackChatUpdate({ channel, ts, blocks, text: `${decision} by @${user}` });
}

async function openRejectModal({ triggerId, taskId, channel, ts, user }) {
  await slackOpenView({
    triggerId,
    view: {
      type: 'modal',
      callback_id: 'approval_reject',
      private_metadata: JSON.stringify({ approvalId: taskId, channel, ts, user }),
      title: { type: 'plain_text', text: 'Reject approval' },
      blocks: [
        {
          type: 'input', block_id: 'reason', label: { type: 'plain_text', text: 'One-word reason' },
          element: { type: 'plain_text_input', action_id: 'reason', max_length: 40, placeholder: { type: 'plain_text', text: 'spam / wrong / tone / length' } },
        },
      ],
      submit: { type: 'plain_text', text: 'Reject' },
    },
  });
}

async function openEditModal({ triggerId, taskId, channel, ts, user }) {
  const draft = await fetchApprovalDraft(taskId);
  await slackOpenView({
    triggerId,
    view: {
      type: 'modal',
      callback_id: 'approval_edit',
      private_metadata: JSON.stringify({ approvalId: taskId, channel, ts, user }),
      title: { type: 'plain_text', text: 'Edit draft' },
      blocks: [
        {
          type: 'input', block_id: 'draft', label: { type: 'plain_text', text: 'Draft' },
          element: { type: 'plain_text_input', action_id: 'draft', multiline: true, initial_value: draft || '' },
        },
      ],
      submit: { type: 'plain_text', text: 'Approve with edit' },
    },
  });
}

/** Handle a Slack block_actions interaction: Approve / Reject / Edit buttons. */
export async function handleSlackBlockAction(payload) {
  const user = payload.user?.username || payload.user?.name || payload.user?.id || 'operator';
  const slackUserId = payload.user?.id || null;
  const channel = payload.channel?.id || payload.container?.channel_id || '';
  const ts = payload.message?.ts || payload.container?.message_ts || '';
  const results = [];

  for (const action of payload.actions || []) {
    const actionId = action.action_id || '';
    const taskId   = action.value || '';
    if (!taskId) continue;

    if (actionId === 'approve') {
      const result = await decideApproval(taskId, 'approve', `Approved via Slack by @${user}`, {}, { surface: 'slack', channel, slackUserId, slackUsername: user });
      results.push({ actionId, handled: result.handled });
      if (result.handled) await rewriteCard({ channel, ts, decision: 'Approved', user, note: result.reply });
    } else if (actionId === 'reject') {
      await openRejectModal({ triggerId: payload.trigger_id, taskId, channel, ts, user });
      results.push({ actionId, handled: true, modal: 'reject' });
    } else if (actionId === 'edit') {
      await openEditModal({ triggerId: payload.trigger_id, taskId, channel, ts, user });
      results.push({ actionId, handled: true, modal: 'edit' });
    }
  }

  return { ok: true, results };
}

/** Handle a modal submission (Reject reason, or Edit + approve in one action). */
export async function handleSlackViewSubmission(payload) {
  const view = payload.view || {};
  const meta = safeParseJson(view.private_metadata);
  const user = payload.user?.username || payload.user?.name || payload.user?.id || meta.user || 'operator';
  const slackUserId = payload.user?.id || null;
  const channel = meta.channel || '';
  const ts = meta.ts || '';
  const values = view.state?.values || {};

  if (view.callback_id === 'approval_reject') {
    const reason = String(values.reason?.reason?.value || '').trim() || 'unspecified';
    const result = await decideApproval(meta.approvalId, 'reject', `Rejected via Slack by @${user}`, { rejectReason: reason }, { surface: 'slack', channel, slackUserId, slackUsername: user });
    if (result.handled) await rewriteCard({ channel, ts, decision: 'Rejected', user, note: `Reason: ${reason}` });
    return { ok: true, handled: result.handled };
  }

  if (view.callback_id === 'approval_edit') {
    const draft = String(values.draft?.draft?.value || '').trim();
    if (!draft) return { ok: false, handled: false, error: 'draft required' };
    const result = await decideApproval(meta.approvalId, 'approve', `Edited + approved via Slack by @${user}`, { editedDraft: draft }, { surface: 'slack', channel, slackUserId, slackUsername: user });
    if (result.handled) await rewriteCard({ channel, ts, decision: 'Approved (edited)', user, note: result.reply });
    return { ok: true, handled: result.handled };
  }

  return { ok: true, handled: false };
}

/**
 * Handle a Slack slash command — /pause and /resume. Restricted to the
 * workspace owner (SLACK_OWNER_USER_ID) so a guest cannot flip the global
 * switch. Returns a Slack-compatible response body.
 */
export async function handleSlashCommand(form) {
  const command = String(form.command || '').trim();
  const userId  = String(form.user_id  || '').trim();

  if (command === '/commission') {
    const { handleCommissionSlashCommand } = await import('./contentCommissionSlack.js');
    await handleCommissionSlashCommand(form);
    return { text: ':memo: Processing your commission — Nexus will reply in this channel.' };
  }

  if (command === '/status') {
    const { handleStatusSlashCommand } = await import('./slackConversation.js');
    await handleStatusSlashCommand(form);
    return { text: ':memo: Status posted to the channel.' };
  }

  if (command === '/queue') {
    const { handleQueueSlashCommand } = await import('./slackConversation.js');
    await handleQueueSlashCommand(form);
    return { text: ':pushpin: Queue posted to the channel.' };
  }

  if (command !== '/pause' && command !== '/resume') {
    return { text: `Unknown command \`${command}\`.` };
  }

  const ownerId = env('SLACK_OWNER_USER_ID');
  if (!ownerId) {
    console.warn('[Slack] /pause or /resume rejected — SLACK_OWNER_USER_ID not set');
    return { text: 'Slack pause/resume is not configured (SLACK_OWNER_USER_ID missing).' };
  }
  if (userId !== ownerId) {
    console.warn(`[Slack] ${command} rejected — ${userId} is not the workspace owner`);
    return { text: 'Only the workspace owner can pause or resume the system.' };
  }

  const { setPaused } = await import('./systemFlags.js');
  const paused = command === '/pause';
  await setPaused(paused, `slack:${userId || 'unknown'}`);

  return paused
    ? { text: ':stop_sign: System paused. All outbound sends are now suppressed.' }
    : { text: ':arrow_forward: System resumed. Outbound sends are enabled.' };
}

/** Handle an Events API `event_callback` — mentions, DMs, and active-thread replies. */
export async function handleSlackEventCallback(payload) {
  const event = payload.event || {};

  // Never answer the bot's own messages or edits — that is a self-loop. bot_id
  // marks messages Nexus sent; subtype marks bot_message / message_changed /
  // message_deleted, none of which are fresh human input.
  if (event.bot_id || event.subtype) return { ok: true, handled: false };

  if (event.type === 'app_mention') {
    const { handleSlackConversation } = await import('./slackConversation.js');
    await handleSlackConversation({
      channel:  event.channel,
      threadTs: event.thread_ts || event.ts,
      userId:   event.user,
      text:     event.text,
    });
    return { ok: true, handled: true };
  }

  if (event.type === 'message') {
    // Gate 1: a reply in a commission thread choosing an angle (deterministic).
    const { handleCommissionThreadReply } = await import('./contentCommissionSlack.js');
    const handled = await handleCommissionThreadReply(event);
    if (handled) return { ok: true, handled: true };

    // Continue a Nexus conversation naturally in its existing thread. Never
    // answer arbitrary channel messages: the thread must already be in history.
    if (event.thread_ts) {
      const { isNexusConversationThread, handleSlackConversation } = await import('./slackConversation.js');
      const knownThread = await isNexusConversationThread({
        channel: event.channel,
        threadTs: event.thread_ts,
      });
      if (knownThread) {
        await handleSlackConversation({
          channel:  event.channel,
          threadTs: event.thread_ts,
          userId:   event.user,
          text:     event.text,
        });
        return { ok: true, handled: true };
      }
    }

    // DM to the bot → conversational.
    if (event.channel_type === 'im') {
      const { handleSlackConversation } = await import('./slackConversation.js');
      await handleSlackConversation({
        channel:  event.channel,
        threadTs: event.thread_ts || event.ts,
        userId:   event.user,
        text:     event.text,
      });
      return { ok: true, handled: true };
    }
  }

  return { ok: true, handled: false };
}

/**
 * Unified Slack dispatcher for the queue drain (and the direct webhook route).
 * Routes slash commands, block_actions, and event_callbacks to their handlers.
 */
export async function handleSlackWebhook({ rawBody, contentType = '' }) {
  const ct = String(contentType || '').toLowerCase();

  // Slash commands post urlencoded with a top-level `command` field (no `payload`).
  if (ct.includes('application/x-www-form-urlencoded')) {
    const form = Object.fromEntries(new URLSearchParams(rawBody));
    if (form.command) return handleSlashCommand(form);
  }

  const payload = parseSlackPayload(rawBody, contentType);
  if (!payload || typeof payload !== 'object') throw new Error('slack payload could not be parsed');

  if (payload.type === 'block_actions') return handleSlackBlockAction(payload);
  if (payload.type === 'view_submission') return handleSlackViewSubmission(payload);
  if (payload.type === 'event_callback') return handleSlackEventCallback(payload);

  // url_verification is answered inline by the Worker; everything else is an ack.
  return { ok: true, handled: false };
}
