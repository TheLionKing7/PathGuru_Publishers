/**
 * Persistent agent chat — survives refresh, searchable, rateable, reply-threaded.
 */

import { getSupabase } from '../supabaseClient.js';

async function getThreadEpoch(agentId) {
  const db = getSupabase();
  if (!db) return 1;

  const { data } = await db.from('agent_chat_threads')
    .select('epoch')
    .eq('agent_id', agentId)
    .maybeSingle();

  return data?.epoch ?? 1;
}

async function ensureThread(agentId) {
  const db = getSupabase();
  if (!db) return 1;

  const { data } = await db.from('agent_chat_threads')
    .upsert({ agent_id: agentId, epoch: 1, updated_at: new Date().toISOString() }, { onConflict: 'agent_id', ignoreDuplicates: true })
    .select('epoch')
    .maybeSingle();

  return data?.epoch ?? 1;
}

/** Load messages for UI (current epoch by default) */
function storeUnavailable(e) {
  console.warn('[agentChatStore]', e?.message || e);
}

export async function loadChatHistory(agentId, {
  limit = 80,
  before = null,
  q = '',
  allEpochs = false,
} = {}) {
  const db = getSupabase();
  if (!db) return { messages: [], epoch: 1, hasMore: false };

  const epoch = await getThreadEpoch(agentId);
  let query = db.from('agent_chat_messages')
    .select('id, agent_id, epoch, role, content, parent_id, rating, feedback, metadata, created_at')
    .eq('agent_id', agentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(Math.min(limit, 200));

  if (!allEpochs) query = query.eq('epoch', epoch);
  if (before) query = query.lt('created_at', before);
  if (q?.trim()) query = query.ilike('content', `%${q.trim().slice(0, 120)}%`);

  try {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return {
      messages: data || [],
      epoch,
      hasMore: (data?.length || 0) >= limit,
    };
  } catch (e) {
    storeUnavailable(e);
    return { messages: [], epoch: 1, hasMore: false, unavailable: true };
  }
}

/** Recent turns for LLM context */
export async function loadChatContext(agentId, limit = 16) {
  const db = getSupabase();
  if (!db) return [];

  try {
    const epoch = await getThreadEpoch(agentId);
    const { data } = await db.from('agent_chat_messages')
      .select('role, content, parent_id, metadata')
      .eq('agent_id', agentId)
      .eq('epoch', epoch)
      .is('deleted_at', null)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data || []).reverse().map(m => ({
      role:     m.role,
      content:  m.content,
      parentId: m.parent_id,
      metadata: m.metadata,
    }));
  } catch (e) {
    storeUnavailable(e);
    return [];
  }
}

export async function appendChatMessage(agentId, role, content, {
  parentId = null,
  metadata = {},
  epoch: forceEpoch = null,
} = {}) {
  const db = getSupabase();
  if (!db) return null;

  try {
    const epoch = forceEpoch ?? await ensureThread(agentId);

    const { data, error } = await db.from('agent_chat_messages')
      .insert({
        agent_id: agentId,
        epoch,
        role,
        content,
        parent_id: parentId || null,
        metadata,
      })
      .select('id, created_at')
      .single();

    if (error) throw new Error(error.message);

    await db.from('agent_chat_threads')
      .upsert({ agent_id: agentId, epoch, updated_at: new Date().toISOString() }, { onConflict: 'agent_id' });

    return data;
  } catch (e) {
    storeUnavailable(e);
    return null;
  }
}

/** Build message with reply context for the agent */
export async function resolveReplyContext(parentId, userMessage) {
  if (!parentId) return userMessage;

  const db = getSupabase();
  if (!db) return userMessage;

  const { data: parent } = await db.from('agent_chat_messages')
    .select('role, content, created_at, agent_id')
    .eq('id', parentId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!parent) return userMessage;

  const who = parent.role === 'user' ? 'Boss' : 'Agent';
  const excerpt = (parent.content || '').slice(0, 400);
  const when = parent.created_at ? new Date(parent.created_at).toLocaleString() : '';
  return `[Referencing ${who}'s message${when ? ` from ${when}` : ''}: "${excerpt}${parent.content?.length > 400 ? '…' : ''}"]\n\n${userMessage}`;
}

export async function clearChatThread(agentId) {
  const db = getSupabase();
  if (!db) return { epoch: 1 };

  const current = await getThreadEpoch(agentId);
  const nextEpoch = current + 1;

  await db.from('agent_chat_threads')
    .upsert({ agent_id: agentId, epoch: nextEpoch, updated_at: new Date().toISOString() }, { onConflict: 'agent_id' });

  await appendChatMessage(agentId, 'system', 'Conversation cleared — new thread started.', {
    epoch: nextEpoch,
    metadata: { event: 'thread_cleared' },
  });

  return { epoch: nextEpoch };
}

export async function softDeleteMessage(messageId) {
  const db = getSupabase();
  if (!db) return false;

  const { error } = await db.from('agent_chat_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId);

  return !error;
}

export async function rateMessage(messageId, rating, feedback = '') {
  const db = getSupabase();
  if (!db) return null;

  const r = Number(rating);
  if (!Number.isFinite(r) || r < -1 || r > 5) {
    throw new Error('rating must be -1, 1, or 2–5');
  }

  const { data, error } = await db.from('agent_chat_messages')
    .update({
      rating:   r,
      feedback: feedback?.trim() || null,
    })
    .eq('id', messageId)
    .select('id, agent_id, role, content, rating, feedback')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Cross-agent search */
export async function searchChatMessages(q, { agentId = null, limit = 40 } = {}) {
  const db = getSupabase();
  if (!db) return [];

  const term = q?.trim().slice(0, 120);
  if (!term) return [];

  let query = db.from('agent_chat_messages')
    .select('id, agent_id, role, content, rating, created_at, epoch')
    .is('deleted_at', null)
    .ilike('content', `%${term}%`)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100));

  if (agentId) query = query.eq('agent_id', agentId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

/** Persist rating as agent episodic memory for learning */
export async function recordFeedbackMemory(agentId, messageRow, rating, feedback) {
  const db = getSupabase();
  if (!db || !messageRow) return;

  const positive = rating >= 1;
  const summary = positive
    ? `Boss rated a response positively (${rating})`
    : `Boss rated a response negatively — course correction needed`;

  try {
    await db.from('agent_memory').insert({
      agent_id:   agentId,
      type:       'feedback',
      summary:    `${summary}: ${(messageRow.content || '').slice(0, 100)}`,
      content:    {
        messageId: messageRow.id,
        rating,
        feedback:  feedback || null,
        excerpt:   (messageRow.content || '').slice(0, 500),
        role:      messageRow.role,
      },
      tags:       ['chat_feedback', positive ? 'positive' : 'negative'],
      importance: positive ? 3 : 5,
    });
  } catch { /* non-blocking */ }
}
