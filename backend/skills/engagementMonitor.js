/**
 * Engagement Monitor — Pulse + Nexus retune loop (blueprints + delivery OS)
 */

import { listClientBlueprints, getClientBlueprint } from './clientBlueprint.js';
import { buildOpsSnapshot } from './nexusCeoOps.js';
import { listEngagements, checkEngagementDrift, getEngagementDetail } from './engagementDelivery.js';
import { getSupabase } from '../supabaseClient.js';

/**
 * Review open engagements (DB) + blueprints; drift check + retune suggestions.
 */
export async function retuneOpenEngagements(nexusAgent = null) {
  const drift = await checkEngagementDrift().catch(() => ({ overdue: [], blocked: [] }));
  const { engagements: dbEngagements } = await listEngagements({ status: 'active' });

  const results = [];
  for (const eng of (dbEngagements || []).slice(0, 10)) {
    let detail;
    try { detail = await getEngagementDetail(eng.id); } catch { continue; }
    const retune = await evaluateEngagement(eng, detail, nexusAgent);
    results.push(retune);
    if (retune.adjustments?.length) await logRetuneTask(eng, retune);
  }

  if (!results.length) {
    const index = await listClientBlueprints();
    for (const entry of index.filter(b => b.status === 'active' || !b.status).slice(0, 5)) {
      const bp = await getClientBlueprint(entry.id);
      if (!bp) continue;
      const retune = await evaluateBlueprint(bp, nexusAgent);
      results.push(retune);
      if (retune.adjustments?.length) await logRetuneTask(bp, retune, true);
    }
  }

  const ops = await buildOpsSnapshot();

  if (drift.overdue?.length && nexusAgent?.escalateToOwner) {
    nexusAgent.escalateToOwner({
      subject:  `Engagement drift — ${drift.overdue.length} overdue milestone(s)`,
      body:     drift.overdue.map(o => `${o.client}: ${o.milestone}`).join('\n'),
      severity: 'warning',
    }).catch(() => {});
  }

  return {
    checked:   results.length,
    adjusted:  results.filter(r => r.adjustments?.length).length,
    drift,
    results,
    ops,
    checkedAt: new Date().toISOString(),
  };
}

async function evaluateEngagement(eng, detail, nexusAgent) {
  const overdue = (detail.milestones || []).filter(m => m.status === 'overdue').length;
  const prompt = `You are Nexus Digital CEO. Review this client engagement delivery.

CLIENT: ${eng.client_name}
PHASE: ${eng.current_phase}
HEALTH: ${eng.health}
OVERDUE MILESTONES: ${overdue}
DELIVERABLES: ${JSON.stringify((detail.deliverables || []).map(d => ({ title: d.title, status: d.status, product: d.product_slug })))}

Return STRICT JSON:
{
  "health": "on_track|at_risk|blocked",
  "adjustments": ["tweak 1"],
  "nextBossAction": "one sentence",
  "delegateTo": "nova|atlas|aether|null"
}`;

  let parsed;
  try {
    const agent = nexusAgent || (await import('../agents/nexus.js')).nexus;
    const raw = await agent.runLLM(prompt, { knowledgeQuery: eng.track || 'client engagement' });
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : null;
  } catch {
    parsed = { health: eng.health || 'on_track', adjustments: [], nextBossAction: 'Review milestone board' };
  }

  const health = parsed?.health || eng.health;
  const db = getSupabase();
  if (db && health !== eng.health) {
    await db.from('engagements').update({ health }).eq('id', eng.id);
  }

  return {
    engagementId: eng.id,
    client:       eng.client_name,
    health,
    adjustments:  parsed?.adjustments || [],
    nextBossAction: parsed?.nextBossAction || '',
    delegateTo:   parsed?.delegateTo || null,
  };
}

async function evaluateBlueprint(bp, nexusAgent) {
  const prompt = `You are Nexus Digital CEO. Review this client engagement and recommend adjustments.

CLIENT: ${bp.metadata?.client_name}
PHASE: ${bp.engagement?.current_phase || bp.engagement_model?.current_phase}
BOSS TASKS PENDING: ${(bp.bossTasks || bp.boss_implementation_tasks || []).join('; ')}
KPIs: ${JSON.stringify(bp.monitoring || bp.monitoring_kpis || [])}

Return STRICT JSON:
{
  "health": "on_track|at_risk|blocked",
  "adjustments": ["specific process tweak 1", "tweak 2"],
  "nextBossAction": "one sentence",
  "delegateTo": "nova|atlas|aether|null"
}`;

  let parsed;
  try {
    const agent = nexusAgent || (await import('../agents/nexus.js')).nexus;
    const raw = await agent.runLLM(prompt, { knowledgeQuery: bp.metadata?.industry || 'client engagement' });
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : null;
  } catch {
    parsed = { health: 'on_track', adjustments: [], nextBossAction: 'Continue implementation per blueprint' };
  }

  return {
    blueprintId: bp.id,
    client:      bp.metadata?.client_name,
    health:      parsed?.health || 'on_track',
    adjustments: parsed?.adjustments || [],
    nextBossAction: parsed?.nextBossAction || '',
    delegateTo:  parsed?.delegateTo || null,
  };
}

async function logRetuneTask(target, retune, isBlueprint = false) {
  const { notion } = await import('../notionClient.js');
  const name = isBlueprint ? target.metadata?.client_name : target.client_name;
  await notion.logTask({
    agentId:   'nexus',
    agentName: 'Nexus (Digital CEO)',
    taskTitle: `Engagement retune: ${name}`,
    taskType:  'engagement_retune',
    outcome:   retune.health,
    notes:     [
      `Health: ${retune.health}`,
      ...retune.adjustments.map(a => `• ${a}`),
      retune.nextBossAction ? `Next: ${retune.nextBossAction}` : '',
    ].filter(Boolean).join('\n'),
  }).catch(() => {});

  const db = getSupabase();
  if (db && retune.delegateTo) {
    await db.from('tasks').insert({
      title:       `[${retune.delegateTo}] Retune: ${name}`,
      description: retune.adjustments.join('\n'),
      agent_id:    retune.delegateTo,
      created_by:  'nexus',
      status:      'pending',
      priority:    3,
      type:        'engagement_retune',
      input:       JSON.stringify({
        blueprintId: isBlueprint ? target.id : undefined,
        engagementId: isBlueprint ? undefined : target.id,
      }),
    }).catch(() => {});
  }
}
