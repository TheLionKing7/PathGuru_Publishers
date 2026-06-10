/**
 * Nexus Digital CEO — Operational engine (cadence, context, Notion sync, scheduled content)
 */

import { getSupabase } from '../supabaseClient.js';
import { listPosts } from '../supabaseClient.js';
import { notion } from '../notionClient.js';
import { BLOG_CADENCE_DAYS } from './nexusCeoDoctrine.js';

const OPS_CACHE_KEY = 'cache/nexus-ops-context.json';

export async function loadOpsContext() {
  const { getJsonCache } = await import('../cloudflareR2.js');
  return (await getJsonCache(OPS_CACHE_KEY).catch(() => null)) || createEmptyOpsContext();
}

export async function saveOpsContext(ctx) {
  const { putJsonCache } = await import('../cloudflareR2.js');
  ctx.updatedAt = new Date().toISOString();
  await putJsonCache(OPS_CACHE_KEY, ctx);
  return ctx;
}

export function createEmptyOpsContext() {
  return {
    lastMorningBriefing:  null,
    lastEveningBriefing:  null,
    lastNotionSync:       null,
    lastBlogPublishAt:    null,
    lastCadenceCheck:     null,
    pendingApprovalCount: 0,
    blogCadenceDays:      BLOG_CADENCE_DAYS,
    contentScheduleQueued: 0,
    stuckTaskCount:       0,
    updatedAt:            null,
  };
}

export async function getLastBlogPublishDate() {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from('posts')
      .select('published_at, created_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(1);
    const row = data?.[0];
    if (row?.published_at) return row.published_at;
    if (row?.created_at) return row.created_at;
  }
  const listed = await listPosts({ status: 'published', limit: 1 });
  const post = listed?.data?.[0];
  return post?.published_at || post?.created_at || null;
}

export async function getPendingApprovalCount() {
  const db = getSupabase();
  if (!db) return 0;
  const { count } = await db.from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'pending_approval')
    .eq('status', 'pending');
  return count || 0;
}

export async function getStuckTaskCount(hours = 48) {
  const db = getSupabase();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
  const { count } = await db.from('tasks')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'running'])
    .lt('created_at', cutoff);
  return count || 0;
}

export async function getContentScheduleStats() {
  const { getJsonCache } = await import('../cloudflareR2.js');
  const schedule = (await getJsonCache('cache/content-schedule.json').catch(() => null)) || [];
  return {
    total:    schedule.length,
    queued:   schedule.filter(a => a.status === 'queued').length,
    pending:  schedule.filter(a => a.status === 'pending_approval').length,
    published: schedule.filter(a => a.status === 'published').length,
    failed:   schedule.filter(a => a.status === 'failed').length,
  };
}

/** Build live ops snapshot for briefings and API */
export async function buildOpsSnapshot() {
  const [
    lastBlog, pendingApprovals, stuckTasks, scheduleStats,
    engagementOps, economics, utilization, nps,
  ] = await Promise.all([
    getLastBlogPublishDate(),
    getPendingApprovalCount(),
    getStuckTaskCount(48),
    getContentScheduleStats(),
    import('./engagementDelivery.js').then(m => m.getEngagementOpsSummary()).catch(() => ({})),
    import('./partnerEconomics.js').then(m => m.getEconomicsDashboard()).catch(() => ({})),
    import('./utilization.js').then(m => m.computeCurrentUtilization()).catch(() => ({})),
    import('./npsSurvey.js').then(m => m.getNpsDashboard()).catch(() => ({})),
  ]);

  const daysSinceBlog = lastBlog
    ? (Date.now() - new Date(lastBlog).getTime()) / 86400000
    : null;

  return {
    lastBlogPublishAt:    lastBlog,
    daysSinceLastBlog:    daysSinceBlog != null ? Math.round(daysSinceBlog * 10) / 10 : null,
    blogCadenceDays:      BLOG_CADENCE_DAYS,
    cadenceDue:           daysSinceBlog == null || daysSinceBlog >= BLOG_CADENCE_DAYS,
    pendingApprovals,
    stuckTasks,
    contentSchedule:      scheduleStats,
    engagements:          engagementOps,
    economics: {
      avgMargin: economics.totals?.avgMargin,
      revenueBooked: economics.totals?.revenueBooked,
      scaleRecommendation: economics.scaleRecommendation,
    },
    utilization: {
      pct: utilization.utilizationPct,
      alert: utilization.alert,
    },
    nps: {
      rolling90d: nps.rolling90d,
      responses: nps.responseCount,
    },
  };
}

/**
 * Process due scheduled articles — approval path only (never auto-publish).
 * @param {import('../agents/nexus.js').Nexus} nexusAgent
 */
export async function processDueScheduledContent(nexusAgent) {
  const { getJsonCache, putJsonCache } = await import('../cloudflareR2.js');
  const schedule = (await getJsonCache('cache/content-schedule.json').catch(() => null)) || [];
  const now = new Date();
  const due = schedule.filter(a => a.status === 'queued' && new Date(a.scheduledFor) <= now);

  const results = [];
  for (const article of due) {
    console.log(`[Nexus CEO] Scheduled item due — routing to approval: ${article.topic}`);
    try {
      const research = await nexusAgent.dispatchResearch({
        topic:      article.topic,
        forAgent:   'aether',
        focusAreas: article.sector ? [article.sector] : [],
        depth:      'standard',
      });

      if (!research?.brief) throw new Error('Orion returned no research brief');

      const orch = await nexusAgent.orchestrate(article.topic, {
        researchBrief: research.brief,
        nextStep:      'blog',
        priority:      4,
      });

      article.status      = orch.type === 'pending_boss_approval' ? 'pending_approval' : 'failed';
      article.approvalId  = orch.approvalId || null;
      article.processedAt = new Date().toISOString();
      article.error       = orch.type === 'pending_boss_approval' ? null : (orch.message || 'Approval not created');

      results.push({ topic: article.topic, status: article.status, approvalId: article.approvalId });
    } catch (e) {
      article.status = 'failed';
      article.error  = e.message;
      results.push({ topic: article.topic, status: 'failed', error: e.message });
      console.error(`[Nexus CEO] Scheduled content failed: ${article.topic}`, e.message);
    }
  }

  if (due.length) await putJsonCache('cache/content-schedule.json', schedule);
  return { processed: due.length, results };
}

/**
 * If blog cadence exceeded, queue research → approval pipeline (unless already pending).
 * @param {import('../agents/nexus.js').Nexus} nexusAgent
 */
export async function checkContentCadence(nexusAgent) {
  const snap = await buildOpsSnapshot();
  const ctx  = await loadOpsContext();
  ctx.lastCadenceCheck = new Date().toISOString();
  await saveOpsContext(ctx);

  if (!snap.cadenceDue) {
    return { action: 'none', reason: `Last blog ${snap.daysSinceLastBlog}d ago (cadence ${BLOG_CADENCE_DAYS}d)`, snap };
  }

  if (snap.pendingApprovals > 0) {
    return { action: 'none', reason: 'Blog approval already pending for Boss', snap };
  }

  if (snap.contentSchedule.pending > 0 || snap.contentSchedule.queued > 0) {
    return { action: 'none', reason: 'Content already queued or awaiting approval', snap };
  }

  const sectors = ['sme', 'automation', 'business_development', 'digital_media'];
  const sector  = sectors[Math.floor(Date.now() / 86400000) % sectors.length];
  const prompt  = `You are Nexus CEO. Propose ONE blog topic for DigiFusion (sector: ${sector}) aligned with C2C Pipeline and firm IP. African business context. Return JSON only: { "topic": "...", "angle": "...", "sector": "..." }`;

  let topic, angle;
  try {
    const raw = await nexusAgent.runLLM(prompt, { knowledgeQuery: 'content strategy C2C' });
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : {};
    topic = parsed.topic || `How ${sector} leaders use AI automation without losing control`;
    angle = parsed.angle || 'Engagement Model Phase 01 diagnostic angle';
  } catch {
    topic = 'Why African SMEs stall at manual ops — and the 90-day fix';
    angle = 'AVE Diagnose phase + cost of inaction';
  }

  const research = await nexusAgent.dispatchResearch({ topic, forAgent: 'aether', depth: 'standard' });
  const orch = await nexusAgent.orchestrate(topic, {
    researchBrief: research?.brief || '',
    nextStep:      'blog',
    priority:      3,
  });

  return {
    action:     orch.type === 'pending_boss_approval' ? 'approval_sent' : 'failed',
    topic,
    angle,
    approvalId: orch.approvalId,
    snap,
  };
}

/** Sync CEO dashboard row to Notion */
export async function syncNotionCeoDashboard({ period = 'morning', briefingExcerpt = '', snap = null } = {}) {
  const ops = snap || await buildOpsSnapshot();
  const notes = [
    `Period: ${period}`,
    briefingExcerpt ? `Brief: ${briefingExcerpt.slice(0, 400)}` : '',
    `Blog: last ${ops.daysSinceLastBlog ?? 'unknown'}d ago | cadence ${ops.blogCadenceDays}d | due: ${ops.cadenceDue}`,
    `Pending Boss approvals: ${ops.pendingApprovals}`,
    `Stuck tasks (>48h): ${ops.stuckTasks}`,
    `Content queue: ${ops.contentSchedule.queued} queued, ${ops.contentSchedule.pending} pending approval`,
  ].filter(Boolean).join('\n');

  const pageId = await notion.logTask({
    agentId:   'nexus',
    agentName: 'Nexus (Digital CEO)',
    taskTitle: `CEO Dashboard — ${period} ${new Date().toLocaleDateString('en-GB')}`,
    taskType:  'ceo_dashboard',
    outcome:   'synced',
    notes,
  }).catch((e) => {
    console.warn('[Nexus CEO] Notion sync failed:', e.message);
    return null;
  });

  const ctx = await loadOpsContext();
  ctx.lastNotionSync = new Date().toISOString();
  ctx.pendingApprovalCount = ops.pendingApprovals;
  ctx.stuckTaskCount = ops.stuckTasks;
  ctx.contentScheduleQueued = ops.contentSchedule.queued;
  ctx.lastBlogPublishAt = ops.lastBlogPublishAt;
  if (period === 'morning') ctx.lastMorningBriefing = new Date().toISOString();
  if (period === 'evening') ctx.lastEveningBriefing = new Date().toISOString();
  await saveOpsContext(ctx);

  return { synced: !!pageId, pageId, period, ops };
}
