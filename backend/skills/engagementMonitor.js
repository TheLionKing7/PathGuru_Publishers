/**
 * Engagement Monitor — Pulse + Nexus retune loop for active client blueprints.
 */

import { listClientBlueprints, getClientBlueprint } from './clientBlueprint.js';
import { buildOpsSnapshot } from './nexusCeoOps.js';

/**
 * Review open client blueprints and suggest process adjustments.
 */
export async function retuneOpenEngagements(nexusAgent = null) {
  const index = await listClientBlueprints();
  const active = index.filter(b => b.status === 'active' || !b.status);

  const results = [];
  for (const entry of active.slice(0, 10)) {
    const bp = await getClientBlueprint(entry.id);
    if (!bp) continue;

    const retune = await evaluateBlueprint(bp, nexusAgent);
    results.push(retune);

    if (retune.adjustments?.length) {
      await logRetuneTask(bp, retune);
    }
  }

  const ops = await buildOpsSnapshot();

  return {
    checked:   results.length,
    adjusted:  results.filter(r => r.adjustments?.length).length,
    results,
    ops,
    checkedAt: new Date().toISOString(),
  };
}

async function evaluateBlueprint(bp, nexusAgent) {
  const prompt = `You are Nexus Digital CEO. Review this client engagement and recommend adjustments.

CLIENT: ${bp.metadata?.client_name}
PHASE: ${bp.engagement?.current_phase}
BOSS TASKS PENDING: ${(bp.bossTasks || []).join('; ')}
KPIs: ${JSON.stringify(bp.monitoring || [])}

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

async function logRetuneTask(bp, retune) {
  const { notion } = await import('../notionClient.js');
  await notion.logTask({
    agentId:   'nexus',
    agentName: 'Nexus (Digital CEO)',
    taskTitle: `Engagement retune: ${bp.metadata?.client_name}`,
    taskType:  'engagement_retune',
    outcome:   retune.health,
    notes:     [
      `Health: ${retune.health}`,
      ...retune.adjustments.map(a => `• ${a}`),
      retune.nextBossAction ? `Next: ${retune.nextBossAction}` : '',
    ].filter(Boolean).join('\n'),
  }).catch(() => {});

  const db = (await import('../supabaseClient.js')).getSupabase();
  if (db && retune.delegateTo) {
    await db.from('tasks').insert({
      title:       `[${retune.delegateTo}] Retune: ${bp.metadata?.client_name}`,
      description: retune.adjustments.join('\n'),
      agent_id:    retune.delegateTo,
      created_by:  'nexus',
      status:      'pending',
      priority:    3,
      type:        'engagement_retune',
      input:       JSON.stringify({ blueprintId: bp.id }),
    }).catch(() => {});
  }
}
