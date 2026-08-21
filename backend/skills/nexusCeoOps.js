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
