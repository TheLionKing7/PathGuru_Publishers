/**
 * Content-to-Capital Growth Engine — pillar/cluster calendar, teasers, lead magnets.
 * Drives digitafusion.com traffic → leads without exposing agent operations.
 */

import { BLOG_CADENCE_DAYS } from './nexusCeoDoctrine.js';

const SCHEDULE_CACHE_KEY = 'cache/content-schedule.json';
const PILLAR_CACHE_KEY   = 'cache/c2c-pillar-plans.json';

function parseJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * Build a 90-day pillar + cluster editorial plan aligned to C2C.
 */
export async function buildPillarClusterPlan(input = {}) {
  const {
    pillarTopic,
    sector = 'sme',
    audience = 'African business leaders and operators',
    frameworkId = 'c2c',
  } = input;

  if (!pillarTopic?.trim()) throw new Error('pillarTopic is required');

  const { aether } = await import('../agents/aether.js');
  const { researcher } = await import('../agents/researcher.js');

  const research = await researcher.research({
    topic:       pillarTopic,
    forAgent:    'aether',
    depth:       'standard',
    mergeWithKB: true,
  }).catch(() => ({ brief: '' }));

  const prompt = `You are Aether. Build a Content-to-Capital 90-day editorial plan.

PILLAR TOPIC: ${pillarTopic}
SECTOR: ${sector}
AUDIENCE: ${audience}
FRAMEWORK: ${frameworkId}

RESEARCH:
${(research.brief || '').slice(0, 2000)}

Return STRICT JSON:
{
  "pillar": {
    "title": "3k+ word pillar page title",
    "seoKeyword": "...",
    "stdcStage": "think",
    "metaDescription": "..."
  },
  "clusters": [
    { "title": "cluster post title", "stdcStage": "see|think|do", "scheduledOffsetDays": 3, "linksToPillar": true }
  ],
  "leadMagnet": {
    "title": "gated playbook/checklist name",
    "format": "pdf|checklist",
    "ctaCopy": "Download the free guide"
  },
  "conversionPath": ["blog teaser", "lead magnet", "strategy session booking"],
  "bookingCta": "Book a free strategy session at digitafusion.com/agency/booking"
}

Rules: 8–12 cluster items, spaced every ${BLOG_CADENCE_DAYS} days. THINK-stage authority first.`;

  const raw = await aether.chat(prompt);
  const plan = parseJson(raw) || {
    pillar: { title: pillarTopic, seoKeyword: pillarTopic, stdcStage: 'think' },
    clusters: [],
    leadMagnet: { title: `${pillarTopic} Checklist`, format: 'checklist', ctaCopy: 'Get the guide' },
    conversionPath: ['blog', 'lead magnet', 'booking'],
    bookingCta: 'digitafusion.com/agency/booking',
  };

  plan.id = `pillar-${Date.now().toString(36)}`;
  plan.createdAt = new Date().toISOString();
  plan.sector = sector;
  plan.researchBrief = (research.brief || '').slice(0, 3000);

  await savePillarPlan(plan);
  return plan;
}

async function savePillarPlan(plan) {
  const { getJsonCache, putJsonCache } = await import('../cloudflareR2.js');
  const list = (await getJsonCache(PILLAR_CACHE_KEY).catch(() => null)) || [];
  list.unshift({ id: plan.id, pillar: plan.pillar?.title, createdAt: plan.createdAt, clusterCount: plan.clusters?.length || 0 });
  await putJsonCache(PILLAR_CACHE_KEY, list.slice(0, 50));
  await putJsonCache(`cache/c2c-pillar-plans/${plan.id}.json`, plan);
}

/**
 * Enqueue cluster posts into content-schedule for Nexus approval pipeline.
 */
export async function enqueueC2cCalendar(plan, options = {}) {
  if (!plan?.clusters?.length && !plan?.pillar) {
    throw new Error('Plan must include pillar or clusters');
  }

  const { getJsonCache, putJsonCache } = await import('../cloudflareR2.js');
  const schedule = (await getJsonCache(SCHEDULE_CACHE_KEY).catch(() => null)) || [];
  const start = options.startDate ? new Date(options.startDate) : new Date();
  start.setDate(start.getDate() + 1);

  const items = [];

  if (plan.pillar?.title) {
    items.push({
      id:           `sched-${Date.now()}-pillar`,
      topic:        plan.pillar.title,
      sector:       plan.sector || 'digital_media',
      type:         'pillar',
      stdcStage:    plan.pillar.stdcStage || 'think',
      seoKeyword:   plan.pillar.seoKeyword,
      leadMagnet:   plan.leadMagnet?.title,
      scheduledFor: start.toISOString(),
      status:       'queued',
      frameworkId:  'c2c',
      planId:       plan.id,
    });
  }

  for (const cluster of plan.clusters || []) {
    const d = new Date(start);
    d.setDate(d.getDate() + (cluster.scheduledOffsetDays || items.length * BLOG_CADENCE_DAYS));
    items.push({
      id:           `sched-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      topic:        cluster.title,
      sector:       plan.sector || 'digital_media',
      type:         'cluster',
      stdcStage:    cluster.stdcStage || 'think',
      scheduledFor: d.toISOString(),
      status:       'queued',
      frameworkId:  'c2c',
      planId:       plan.id,
      linksToPillar: cluster.linksToPillar !== false,
    });
  }

  schedule.push(...items);
  await putJsonCache(SCHEDULE_CACHE_KEY, schedule);

  return { queued: items.length, items };
}

/**
 * Derive THINK-stage blog teasers from a playbook slug for traffic → leads.
 */
export async function derivePlaybookTeasers(playbookSlug, count = 3) {
  const { getAgencyPlaybook } = await import('../cloudflareR2.js');
  const pb = await getAgencyPlaybook(playbookSlug);
  if (!pb?.content) throw new Error(`Playbook not found: ${playbookSlug}`);

  const { aether } = await import('../agents/aether.js');
  return aether.deriveBlogSnippets({
    playbookTitle:   pb.title,
    playbookExcerpt: pb.content.slice(0, 2000),
    frameworkId:     'c2c',
    count,
  });
}

export async function listPillarPlans() {
  const { getJsonCache } = await import('../cloudflareR2.js');
  return (await getJsonCache(PILLAR_CACHE_KEY).catch(() => null)) || [];
}

export async function getPillarPlan(planId) {
  const { getJsonCache } = await import('../cloudflareR2.js');
  return getJsonCache(`cache/c2c-pillar-plans/${planId}.json`);
}
