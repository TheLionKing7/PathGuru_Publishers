/**
 * Client Blueprint Workflow — Nexus-led multi-agent engagement pack.
 * Maps to client-engagement.schema.json for Boss implementation handoff.
 */

import { scoreCeoOutput } from './ceoQualityGate.js';
import { notion } from '../notionClient.js';

const BLUEPRINT_CACHE_PREFIX = 'cache/client-blueprints/';

function parseJsonBlock(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : raw;
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function normalizeTrack(track = '') {
  const t = String(track).toLowerCase();
  if (['automation', 'ai', 'saas', 'nova'].some(k => t.includes(k))) return 'automation';
  if (['bd', 'business', 'deal', 'sales', 'atlas'].some(k => t.includes(k))) return 'business_development';
  if (['media', 'content', 'marketing', 'aether', 'c2c'].some(k => t.includes(k))) return 'digital_media';
  if (t.includes('integrated') || t.includes('full')) return 'integrated';
  return 'integrated';
}

/**
 * Build a full client blueprint: Orion research → specialist JSON → Nexus merge.
 */
export async function buildClientBlueprint(input = {}, nexusAgent = null) {
  const {
    clientName,
    company,
    industry = 'general',
    track: rawTrack = 'integrated',
    goals = '',
    painPoints = '',
    budget = '',
    timeline = '',
    leadId = null,
  } = input;

  if (!clientName?.trim() && !company?.trim()) {
    throw new Error('clientName or company is required');
  }

  const track = normalizeTrack(rawTrack);
  const displayName = clientName || company;
  const topic = `${displayName} — ${industry} — ${goals || painPoints || 'engagement diagnostic'}`.slice(0, 200);

  let researchBrief = input.researchBrief || '';
  if (!researchBrief) {
    const { researcher } = await import('../agents/researcher.js');
    const research = await researcher.research({
      topic,
      forAgent:    'nexus',
      depth:       'standard',
      mergeWithKB: true,
      context:     `Client: ${displayName}. Industry: ${industry}. Goals: ${goals}. Pain: ${painPoints}.`,
    });
    researchBrief = research?.brief || research?.summary || '';
  }

  const specialistOutputs = await runSpecialistPasses({
    displayName,
    company,
    industry,
    track,
    goals,
    painPoints,
    budget,
    timeline,
    researchBrief,
  });

  const merged = await mergeBlueprint({
    nexusAgent,
    displayName,
    company,
    industry,
    track,
    goals,
    painPoints,
    budget,
    timeline,
    researchBrief,
    specialistOutputs,
  });

  const quality = scoreCeoOutput({
    text: JSON.stringify(merged).slice(0, 3000),
    outputType: 'client',
  });

  const blueprintId = `bp-${Date.now().toString(36)}`;
  const record = {
    id:           blueprintId,
    createdAt:    new Date().toISOString(),
    status:       'active',
    metadata:     merged.metadata,
    engagement:   merged.engagement_model,
    ave:          merged.ave_output || null,
    deal:         merged.deal_engine_output || null,
    c2c:          merged.c2c_output || null,
    actionPlan:   merged.action_plan || [],
    bossTasks:    merged.boss_implementation_tasks || [],
    monitoring:   merged.monitoring_kpis || [],
    researchBrief: researchBrief.slice(0, 4000),
    quality,
    leadId,
  };

  await persistBlueprint(record);

  await notion.logTask({
    agentId:   'nexus',
    agentName: 'Nexus (Digital CEO)',
    taskTitle: `Client Blueprint: ${displayName}`,
    taskType:  'client_blueprint',
    outcome:   quality.passed ? 'complete' : 'needs_revision',
    notes:     [
      `Track: ${track} | Phase: ${merged.engagement_model?.current_phase}`,
      `Boss tasks: ${(merged.boss_implementation_tasks || []).length}`,
      quality.flags?.slice(0, 3).join(' | ') || '',
    ].filter(Boolean).join('\n'),
  }).catch(() => {});

  if (leadId) {
    const db = (await import('../supabaseClient.js')).getSupabase();
    if (db) {
      await db.from('tasks').insert({
        title:       `[Boss] Implement: ${displayName} blueprint`,
        description: (merged.boss_implementation_tasks || []).map((t, i) => `${i + 1}. ${t}`).join('\n').slice(0, 4000),
        agent_id:    'nexus',
        created_by:  'nexus',
        status:      'pending',
        priority:    2,
        type:        'client_blueprint',
        input:       JSON.stringify({ blueprintId, leadId, track }),
      }).catch(() => {});
    }
  }

  return { blueprintId, blueprint: record, quality };
}

async function runSpecialistPasses(ctx) {
  const { displayName, industry, track, goals, painPoints, researchBrief } = ctx;
  const base = `
CLIENT: ${displayName}
INDUSTRY: ${industry}
GOALS: ${goals}
PAIN POINTS: ${painPoints}

RESEARCH:
${researchBrief.slice(0, 2500)}
`;

  const out = {};

  const runAtlas = track === 'business_development' || track === 'integrated';
  const runNova  = track === 'automation' || track === 'integrated';
  const runAether = track === 'digital_media' || track === 'integrated';

  await Promise.all([
    runAtlas ? (async () => {
      const { atlas } = await import('../agents/atlas.js');
      const raw = await atlas.chat(`${base}

You are Atlas. Return STRICT JSON only for Deal Engine layer:
{
  "economic_buyer": "...",
  "technical_gatekeeper": "...",
  "internal_champion": "...",
  "pricing_model": "value_based|retainer_performance|savings_share",
  "commercial_actions": ["action 1", "action 2", "action 3"]
}`);
      out.deal = parseJsonBlock(raw);
    })() : null,

    runNova ? (async () => {
      const { nova } = await import('../agents/nova.js');
      const raw = await nova.chat(`${base}

You are Nova. Return STRICT JSON only for AVE layer:
{
  "bottlenecks": ["..."],
  "automation_orchestrator": "recommended stack",
  "ave_phase": "diagnose|architect|build|deploy|scale",
  "systems_actions": ["action 1", "action 2"]
}`);
      out.ave = parseJsonBlock(raw);
    })() : null,

    runAether ? (async () => {
      const { aether } = await import('../agents/aether.js');
      const raw = await aether.chat(`${base}

You are Aether. Return STRICT JSON only for C2C layer:
{
  "stdc_stage": "see|think|do|care",
  "pillar_topic": "...",
  "conversion_asset": "...",
  "media_actions": ["action 1", "action 2"]
}`);
      out.c2c = parseJsonBlock(raw);
    })() : null,
  ]);

  return out;
}

async function mergeBlueprint({
  nexusAgent,
  displayName,
  company,
  industry,
  track,
  goals,
  painPoints,
  budget,
  timeline,
  researchBrief,
  specialistOutputs,
}) {
  const mergePrompt = `You are Nexus Digital CEO. Merge specialist outputs into ONE client blueprint JSON.

CLIENT: ${displayName} (${company || 'n/a'})
INDUSTRY: ${industry} | TRACK: ${track}
GOALS: ${goals} | PAIN: ${painPoints}
BUDGET: ${budget || 'not specified'} | TIMELINE: ${timeline || '90 days'}

RESEARCH (excerpt):
${researchBrief.slice(0, 1500)}

SPECIALIST OUTPUTS:
${JSON.stringify(specialistOutputs, null, 2).slice(0, 3000)}

Return STRICT JSON matching this shape:
{
  "metadata": { "client_name": "...", "industry": "...", "track": "${track}", "currency": "USD" },
  "engagement_model": {
    "current_phase": "discovery_audit|gap_analysis|solution_design|build_deploy_measure",
    "cost_of_inaction_12mo": 0,
    "roi_payback_days": 90,
    "mece_buckets": ["bucket1", "bucket2", "bucket3"]
  },
  "ave_output": { "bottlenecks": [], "automation_orchestrator": "", "ave_phase": "diagnose" },
  "deal_engine_output": { "economic_buyer": "", "technical_gatekeeper": "", "internal_champion": "", "pricing_model": "value_based" },
  "c2c_output": { "stdc_stage": "think", "pillar_topic": "", "conversion_asset": "" },
  "action_plan": [{ "week": 1, "owner": "Boss|Nova|Atlas|Aether", "action": "...", "deliverable": "..." }],
  "boss_implementation_tasks": ["concrete task Boss executes this week"],
  "monitoring_kpis": [{ "metric": "...", "target": "...", "cadence": "weekly" }]
}

Lead with ROI. Use DigiFusion Engagement Model phases. No generic consulting jargon.`;

  let parsed;
  if (nexusAgent?.runLLM) {
    const raw = await nexusAgent.runLLM(mergePrompt, { knowledgeQuery: `${industry} client engagement` });
    parsed = parseJsonBlock(raw);
  } else {
    const { nexus } = await import('../agents/nexus.js');
    const raw = await nexus.runLLM(mergePrompt, { knowledgeQuery: `${industry} client engagement` });
    parsed = parseJsonBlock(raw);
  }

  if (!parsed?.metadata) {
    parsed = {
      metadata: { client_name: displayName, industry, track, currency: 'USD' },
      engagement_model: {
        current_phase: 'discovery_audit',
        cost_of_inaction_12mo: 0,
        roi_payback_days: 90,
        mece_buckets: ['Operations', 'Commercial', 'Media'],
      },
      ave_output: specialistOutputs.ave || {},
      deal_engine_output: specialistOutputs.deal || {},
      c2c_output: specialistOutputs.c2c || {},
      action_plan: [],
      boss_implementation_tasks: ['Review blueprint and schedule kickoff call'],
      monitoring_kpis: [{ metric: 'Pipeline velocity', target: '1 milestone/week', cadence: 'weekly' }],
    };
  }

  return parsed;
}

async function persistBlueprint(record) {
  try {
    const { putJsonCache } = await import('../cloudflareR2.js');
    await putJsonCache(`${BLUEPRINT_CACHE_PREFIX}${record.id}.json`, record);

    const { getJsonCache } = await import('../cloudflareR2.js');
    const index = (await getJsonCache('cache/client-blueprints-index.json').catch(() => null)) || [];
    const next = [{ id: record.id, client: record.metadata?.client_name, status: record.status, createdAt: record.createdAt },
      ...index.filter(i => i.id !== record.id)].slice(0, 100);
    await putJsonCache('cache/client-blueprints-index.json', next);
  } catch (e) {
    console.warn('[ClientBlueprint] Cache persist failed:', e.message);
  }
}

export async function getClientBlueprint(blueprintId) {
  const { getJsonCache } = await import('../cloudflareR2.js');
  return getJsonCache(`${BLUEPRINT_CACHE_PREFIX}${blueprintId}.json`);
}

export async function listClientBlueprints() {
  const { getJsonCache } = await import('../cloudflareR2.js');
  return (await getJsonCache('cache/client-blueprints-index.json').catch(() => null)) || [];
}
