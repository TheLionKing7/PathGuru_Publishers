/**
 * DigiFusion Intelligence Network — Content Commission pipeline
 * ==============================================================
 * Runs the gates after an angle is approved:
 *
 *   researching   → Orion research scoped to the angle → P1 quality gate
 *                   (< 60 stops at research_review with reasons in the thread)
 *   synthesising  → passing brief → knowledge_base (reference recorded)
 *   drafting      → Aether writes from angle + graded brief → draft_review
 *                   (draft + P3 approval card posted to the thread)
 *   publishing    → (on approval) P1 publish path → published_url in thread
 */

import { getSupabase } from '../supabaseClient.js';
import { postSlackMessage } from './slackNotify.js';
import { scoreResearchBrief } from './researchQualityGate.js';
import { transitionContentCommission } from './contentCommission.js';
import { generateAndPublishBlogPost } from '../blogPublisher.js';

function safeJson(value) {
  if (value == null) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

async function threadMessage(commission, text) {
  if (!commission?.slack_channel || !commission?.slack_thread_ts) return;
  try {
    await postSlackMessage({ channel: commission.slack_channel, threadTs: commission.slack_thread_ts, text });
  } catch (e) {
    console.warn('[ContentCommission] thread message failed:', e.message);
  }
}

async function getResearchBrief(commission, db) {
  if (!commission.research_task_id) return { brief: '', sources: [], grade: commission.research_grade };
  const { data: task } = await db.from('tasks').select('output').eq('id', commission.research_task_id).maybeSingle();
  const out = safeJson(task?.output);
  return { brief: out.brief || '', sources: out.sources || [], grade: commission.research_grade };
}

/** Research stage: angle-approved commission → Orion task → P1 gate. */
async function researchStage(commission, db) {
  const angle = (commission.angle || '').trim();
  if (!angle) {
    await transitionContentCommission({ id: commission.id, status: 'research_review', mirror: false, fields: { close_reason: 'no approved angle' }, db });
    await threadMessage(commission, ':x: No approved angle — cannot research.');
    return;
  }

  let taskId = null;
  const { data: taskRow } = await db.from('tasks').insert({
    title:       `[Orion] ${angle.slice(0, 80)}`,
    description: `Commission ${String(commission.id).slice(0, 8)} — ${angle}`,
    agent_id:    'researcher',
    created_by:  'nexus',
    status:      'in_progress',
    priority:    3,
    type:        'research',
  }).select('id').single();
  taskId = taskRow?.id || null;

  let result;
  try {
    const { researcher } = await import('../agents/researcher.js');
    result = await researcher.research({ topic: angle, forAgent: 'nexus', depth: 'deep', mergeWithKB: true });
  } catch (e) {
    if (taskId) await db.from('tasks').update({ status: 'failed', error: e.message, completed_at: new Date().toISOString() }).eq('id', taskId);
    await transitionContentCommission({ id: commission.id, status: 'research_review', mirror: false, fields: { research_task_id: taskId, close_reason: `research failed: ${e.message}` }, db });
    await threadMessage(commission, `:x: Research failed: ${e.message}`);
    return;
  }

  const qScore = scoreResearchBrief({
    brief:        result?.brief || '',
    sources:      result?.sources || [],
    gaps:         result?.gaps || [],
    coverStats:   result?.coverStats || [],
    mergedWithKB: result?.mergedWithKB || false,
    depth:        result?.depth || 'deep',
  });

  if (taskId) {
    await db.from('tasks').update({
      status:       qScore.passed ? 'completed' : 'failed',
      output:       { instruction: angle, brief: result?.brief || '', sources: result?.sources || [], qualityScore: qScore, grade: qScore.score },
      completed_at: new Date().toISOString(),
      error:        qScore.passed ? null : `quality gate failed: ${qScore.score}/100`,
    }).eq('id', taskId);
  }

  const fields = { research_task_id: taskId, research_grade: qScore.score };
  if (!qScore.passed) {
    await transitionContentCommission({ id: commission.id, status: 'research_review', mirror: false, fields: { ...fields, close_reason: `research_review: ${qScore.score}/100` }, db });
    const reasons = (qScore.failures || []).map((f) => `• ${f}`).join('\n') || '(no reasons recorded)';
    await threadMessage(commission, `:no_entry: *Research failed the quality gate* (${qScore.score}/100)\n${reasons}`);
    return;
  }

  await transitionContentCommission({ id: commission.id, status: 'synthesising', mirror: false, fields, db });
  await threadMessage(commission, `:green_circle: *Research passed* (${qScore.grade}, ${qScore.score}/100).`);
}

/** Synthesis stage: passing brief → knowledge_base; record the reference. */
async function synthesisStage(commission, db) {
  const { brief } = await getResearchBrief(commission, db);
  if (!brief || String(brief).trim().length < 40) {
    await transitionContentCommission({ id: commission.id, status: 'research_review', mirror: false, fields: { close_reason: 'no passing brief to synthesise' }, db });
    await threadMessage(commission, ':x: No passing brief to synthesise.');
    return;
  }

  const sourceKey = `commission/${commission.id}`;
  const { data: existing } = await db.from('knowledge_base').select('id').eq('source_key', sourceKey).limit(1);
  if (!existing?.length) {
    const { error } = await db.from('knowledge_base').insert({
      title:           commission.angle || commission.source_url || 'commission',
      domain:          'general',
      source_type:     'research',
      source_key:      sourceKey,
      source_name:     commission.source_url || commission.angle,
      content:         String(brief).slice(0, 50000),
      frameworks:      [commission.angle].filter(Boolean),
      tags:            ['commission', 'research'],
      metadata:        { commissionId: commission.id, sourceUrl: commission.source_url },
      relevance_score: 4,
      processed_by:    'nexus',
    });
    if (error) {
      await transitionContentCommission({ id: commission.id, status: 'research_review', mirror: false, fields: { close_reason: `synthesis failed: ${error.message}` }, db });
      await threadMessage(commission, `:x: Synthesis failed: ${error.message}`);
      return;
    }
  }

  await transitionContentCommission({ id: commission.id, status: 'drafting', mirror: false, fields: { synthesis_ref: sourceKey }, db });
  await threadMessage(commission, `:books: *Synthesised* into the knowledge base (\`${sourceKey}\`).`);
}

/** Drafting stage: Aether writes from angle + graded brief → draft_review. */
async function draftStage(commission, db) {
  const angle = commission.angle || '';
  const { brief } = await getResearchBrief(commission, db);

  let draft;
  try {
    const { aether } = await import('../agents/aether.js');
    draft = await aether.produceContent('blog post', angle, {
      audience: 'business executives and operators',
      researchBrief: brief,
      proposedTitle: angle,
      bossCaveats: ['Cite only what the research brief sourced — no invented statistics or URLs.'],
    });
  } catch (e) {
    await transitionContentCommission({ id: commission.id, status: 'draft_review', mirror: false, fields: { close_reason: `draft failed: ${e.message}` }, db });
    await threadMessage(commission, `:x: Draft failed: ${e.message}`);
    return;
  }

  if (!draft || String(draft).trim().length < 100) {
    await transitionContentCommission({ id: commission.id, status: 'draft_review', mirror: false, fields: { close_reason: 'draft came back empty' }, db });
    await threadMessage(commission, ':x: Draft came back empty — needs a human.');
    return;
  }

  await threadMessage(commission, `:memo: *Draft for approval*\n\`\`\`${String(draft).slice(0, 2800)}\`\`\``);

  let approvalId = null;
  try {
    const { createApprovalRequest } = await import('./approvalGate.js');
    const approval = await createApprovalRequest({
      approvalType: 'content_commission',
      subject:      `Publish "${angle.slice(0, 60)}"`,
      detail:       'Draft ready for approval. Review the thread and Approve to publish.',
      payload: {
        commissionId:  commission.id,
        angle,
        draft,
        researchBrief: brief,
        slackChannel:  commission.slack_channel,
        slackThreadTs: commission.slack_thread_ts,
      },
    });
    approvalId = approval?.approvalId || null;

    if (approvalId) {
      const { postSlackApproval } = await import('./slackApprovals.js');
      await postSlackApproval({
        approvalId,
        subject:      `Publish "${angle.slice(0, 60)}"`,
        detail:       'Approve to publish, or Reject.',
        approvalType: 'content_commission',
        payload:      { angle, draft },
        channel:      commission.slack_channel,
        threadTs:     commission.slack_thread_ts,
      });
    }
  } catch (e) {
    console.warn('[ContentCommission] approval request failed:', e.message);
  }

  await transitionContentCommission({ id: commission.id, status: 'draft_review', mirror: false, db });
  await threadMessage(commission, approvalId
    ? `:pushpin: Approval requested (\`${String(approvalId).slice(0, 8)}\`) — Approve to publish, Reject to abandon.`
    : ':warning: Approval request could not be created — draft is in the thread above.');
}

/**
 * Publish stage (on approval): run the P1 publish path, record published_url.
 */
export async function publishCommission({ id, payload = {}, db = getSupabase() }) {
  const { data: commission } = await db.from('content_commission').select('*').eq('id', id).maybeSingle();
  if (!commission) return { ok: false, published: false, error: 'commission not found' };

  const draft = payload.draft || '';
  const angle = payload.angle || commission.angle || '';
  if (!draft) return { ok: false, published: false, error: 'no draft to publish' };

  await transitionContentCommission({ id, status: 'publishing', mirror: false, db });
  await threadMessage(commission, ':rocket: Publishing…');

  try {
    const siteUrl = (process.env.DIGIFUSION_API_URL || 'https://www.digitafusion.com').replace(/\/$/, '');
    const result = await generateAndPublishBlogPost({
      topic:         angle,
      aetherContent: draft,
      researchBrief: payload.researchBrief || '',
      postType:      'article',
      author:        payload.author || 'Boroji Adebayo-Hopewell, Founder',
      platforms:     [{ type: 'digifusion', status: 'published', siteUrl }],
    });
    const slug = result?.publishResults?.[0]?.slug || result?.post?.slug || result?.dbResult?.slug || '';
    const url  = result?.publishResults?.[0]?.url || (slug ? `${siteUrl}/blog/${slug}` : '');

    const moved = await transitionContentCommission({ id, status: 'published', mirror: false, fields: { published_url: url || null }, db });
    await threadMessage(moved.commission || commission, url
      ? `:white_check_mark: *Published* — ${url}`
      : ':white_check_mark: *Published* (no URL returned).');
    return { ok: true, published: true, url, commission: moved.commission };
  } catch (e) {
    await transitionContentCommission({ id, status: 'draft_review', mirror: false, fields: { close_reason: `publish failed: ${e.message}` }, db });
    await threadMessage(commission, `:x: Publish failed: ${e.message}`);
    return { ok: false, published: false, error: e.message };
  }
}

/**
 * Auto-advance research → synthesis → draft, stopping at a waiting state
 * (draft_review, research_review) or a terminal state.
 */
export async function runContentCommission({ id, db = getSupabase() }) {
  for (let i = 0; i < 6; i++) {
    const { data: commission } = await db.from('content_commission').select('*').eq('id', id).maybeSingle();
    if (!commission) return { ok: false, error: 'commission not found' };

    switch (commission.status) {
      case 'researching': await researchStage(commission, db); break;
      case 'synthesising': await synthesisStage(commission, db); break;
      case 'drafting': await draftStage(commission, db); break;
      default: return { ok: true, stopped: true, status: commission.status };
    }
  }
  return { ok: false, error: 'stage loop exceeded' };
}
