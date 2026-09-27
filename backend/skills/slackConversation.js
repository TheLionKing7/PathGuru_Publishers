/**
 * DigiFusion Intelligence Network — Slack conversation
 * =====================================================
 * Thread-scoped conversational Nexus. On app_mention or DM the last 20 turns of
 * the thread are loaded as context, Nexus replies, and both turns are persisted
 * to slack_conversation. A "thinking" placeholder is posted immediately and
 * chat.update'd with the answer, so a slow model never looks like a dead bot.
 *
 * Also hosts the deterministic slash-command helpers (/status, /queue).
 */

import { getSupabase } from '../supabaseClient.js';
import { postSlackMessage, slackChatUpdate } from './slackNotify.js';
import { ACTIVE_STATUSES } from './contentCommission.js';

const MAX_HISTORY_TURNS = 20;

function stripBotMention(text) {
  return String(text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
}

/** Conversational entry point: load history, reply in-thread, persist both turns. */
export async function handleSlackConversation({ channel, threadTs, userId, text }) {
  const db = getSupabase();
  if (!db) return { ok: false, error: 'Supabase not configured' };
  if (!channel || !threadTs) return { ok: false, error: 'missing channel/thread' };
  const clean = stripBotMention(text);
  if (!clean) return { ok: false, error: 'empty message' };

  // Load the last 20 turns BEFORE this message (oldest → newest).
  const { data: prior } = await db.from('slack_conversation')
    .select('role, text')
    .eq('channel', channel)
    .eq('thread_ts', threadTs)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY_TURNS);
  const history = (prior || []).reverse().map((t) => ({ role: t.role, content: t.text }));

  // Persist the user turn.
  await db.from('slack_conversation').insert({ channel, thread_ts: threadTs, user_id: userId, role: 'user', text: clean });

  // Thinking placeholder so a slow model doesn't read as a dead bot.
  const placeholder = await postSlackMessage({ channel, threadTs, text: ':hourglass_flowing_sand: Thinking…' });

  let reply;
  try {
    const { nexus } = await import('../agents/nexus.js');
    reply = await nexus.chat(clean, history, 'internal', { channel, threadTs });
  } catch (e) {
    reply = `I hit an error: ${e.message}`;
  }

  // Persist the assistant turn.
  await db.from('slack_conversation').insert({ channel, thread_ts: threadTs, user_id: 'nexus', role: 'assistant', text: reply });

  // Replace the placeholder with the answer.
  if (placeholder.providerId) {
    await slackChatUpdate({ channel, ts: placeholder.providerId, text: reply });
  } else {
    await postSlackMessage({ channel, threadTs, text: reply });
  }

  return { ok: true, reply };
}

/** /status — commissions in flight and their stages. */
export async function handleStatusSlashCommand(form) {
  const db = getSupabase();
  const channel = String(form.channel_id || '').trim();

  let commissions = [];
  if (db) {
    const { data } = await db.from('content_commission')
      .select('angle, source_note, source_url, status, research_grade')
      .in('status', ACTIVE_STATUSES)
      .order('commissioned_at', { ascending: true });
    commissions = data || [];
  }

  const text = !commissions.length
    ? ':memo: No commissions in flight.'
    : `:memo: *Commissions in flight (${commissions.length})*\n${commissions
        .map((c, i) => `${i + 1}. ${c.angle || c.source_note || c.source_url || '—'} — *${c.status}*${c.research_grade != null ? ` (grade ${c.research_grade})` : ''}`)
        .join('\n')}`;

  if (channel) await postSlackMessage({ channel, text });
  return { ok: true, text };
}

/** /queue — pending approvals. */
export async function handleQueueSlashCommand(form) {
  const channel = String(form.channel_id || '').trim();
  const { listPendingApprovals } = await import('./approvalQueue.js');
  const { approvals, total } = await listPendingApprovals();

  const text = !total
    ? ':white_check_mark: No pending approvals.'
    : `:pushpin: *Pending approvals (${total})*\n${approvals
        .map((a, i) => `${i + 1}. ${a.input?.subject || a.title || String(a.id).slice(0, 8)}`)
        .join('\n')}`;

  if (channel) await postSlackMessage({ channel, text });
  return { ok: true, text };
}
