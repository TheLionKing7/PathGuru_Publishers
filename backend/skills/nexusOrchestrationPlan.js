/**
 * Nexus Orchestration Campaigns
 * -----------------------------
 * Turns compound Boss instructions into a persisted campaign:
 *   research → Synthesizer KB → scheduled content workflow → agent delegation
 *
 * Steps live in `tasks` (type orchestration_step) with due_at for interval execution.
 * Activity is recorded on each task row + Nexus episodic memory.
 */

import { getSupabase, supabaseWrite } from '../supabaseClient.js';
import { BLOG_CADENCE_DAYS } from './nexusCeoDoctrine.js';

/** Parse blog cadence + synthesizer intent from natural language. */
export function parseWorkflowSignals(instruction) {
  const lower = String(instruction || '').toLowerCase();

  const intervalMatch = lower.match(/every\s+(\d+)\s*days?/);
  const weeksMatch    = lower.match(/(?:next|for)\s+(\d+)\s*weeks?/);
  const postsMatch    = lower.match(/(\d+)\s*(?:blog|article|post)/);

  const intervalDays = intervalMatch ? Math.min(14, Math.max(1, parseInt(intervalMatch[1], 10))) : BLOG_CADENCE_DAYS;
  const durationDays = weeksMatch ? Math.min(90, parseInt(weeksMatch[1], 10) * 7) : 14;
  const postCount    = postsMatch
    ? parseInt(postsMatch[1], 10)
    : Math.max(1, Math.floor(durationDays / intervalDays));

  const wantsContentCampaign = /content workflow|post blog|blog.*every|every\s+\d+\s*days|pillar.*cluster|editorial (plan|calendar)|c2c/i.test(lower);
  const wantsSynthesizer     = /synthesizer|knowledge base|save to kb|playbook|frameworks?\s+ip|intelligence report/i.test(lower);

  let sector = 'sme';
  if (/africa|african/i.test(lower)) sector = 'sme';
  if (/fintech|digital media|automation|government|pharma/i.test(lower)) {
    const m = lower.match(/fintech|digital media|automation|government|pharma/);
    if (m) sector = m[0].replace(/\s+/g, '_');
  }

  return {
    wantsSynthesizer,
    wantsContentCampaign,
    intervalDays,
    durationDays,
    postCount: Math.min(postCount, 12),
    sector,
    autoWire: wantsSynthesizer || wantsContentCampaign,
  };
}

/** Create parent campaign + child orchestration steps in Supabase. */
export async function createCampaignFromResearch(nexus, {
  instruction,
  researchTaskId,
  brief,
  sources = [],
  priority = 3,
  signals = null,
}) {
  const db = getSupabase();
  const sig = signals || parseWorkflowSignals(instruction);
  if (!sig.autoWire) return null;

  const steps = [];
  const now = new Date();

  if (sig.wantsSynthesizer) {
    steps.push({
      action:      'synthesizer_save',
      title:       'Save Orion research to knowledge base — Synthesizer',
      agent_id:    'synthesizer',
      due_at:      now.toISOString(),
      offsetDays:  0,
    });
  }

  if (!steps.length) return null;

  let parentId = null;
  if (db) {
    const { data: parent } = await db.from('tasks').insert({
      title:       `[Campaign] ${instruction.slice(0, 80)}`,
      description: instruction,
      agent_id:    'nexus',
      created_by:  'nexus',
      status:      'in_progress',
      priority,
      type:        'orchestration_campaign',
      input:       { instruction, researchTaskId, signals: sig, stepCount: steps.length },
    }).select('id').single();
    parentId = parent?.id || null;
  }

  const childRows = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!db || !parentId) continue;
    const { data: child } = await db.from('tasks').insert({
      title:          s.title,
      description:    `Campaign step ${i + 1}/${steps.length} for research task ${researchTaskId}`,
      agent_id:       s.agent_id,
      created_by:     'nexus',
      parent_task_id: parentId,
      status:         'pending',
      priority,
      type:           'orchestration_step',
      due_at:         s.due_at,
      input:          {
        action:         s.action,
        researchTaskId,
        instruction,
        brief:          brief?.slice(0, 8000),
        sources,
        meta:           s.meta || {},
        stepIndex:      i,
      },
    }).select('id, title, due_at, input').single();
    if (child) childRows.push(child);
  }

  await nexus.rememberEpisodic({
    summary:    `Campaign wired: ${steps.length} step(s) after Orion research`,
    content:    { parentId, researchTaskId, signals: sig, steps: steps.map(s => s.action) },
    type:       'decision',
    tags:       ['nexus', 'campaign', 'orchestration'],
    importance: 4,
    taskId:     parentId,
  });

  console.log(`[Nexus Campaign] Created ${parentId} with ${childRows.length} steps`);

  return {
    campaignId:   parentId,
    steps:        childRows,
    signals:      sig,
    message:      `Campaign queued: ${steps.map(s => s.title).join(' → ')}`,
  };
}

/** Execute one orchestration step — called by cron / interval processor. */
export async function executeOrchestrationStep(nexus, taskRow) {
  const input = taskRow.input || {};
  const action = input.action;
  const brief = input.brief || '';
  const instruction = input.instruction || taskRow.description || '';

  await nexus.startTask(taskRow.id);

  let output = {};
  try {
    switch (action) {
      case 'synthesizer_save': {
        const orch = await nexus.orchestrate(instruction, {
          researchBrief: brief,
          nextStep:      'save',
          priority:      taskRow.priority || 3,
        });
        output = { type: 'synthesizer_queued', orch };
        break;
      }
      case 'synthesizer_report': {
        const orch = await nexus.orchestrate(instruction, {
          researchBrief: brief,
          nextStep:      'report',
          priority:      taskRow.priority || 3,
        });
        output = { type: 'report_queued', orch };
        break;
      }
      default:
        output = { type: 'unknown_action', action };
    }

    await nexus.completeTask(taskRow.id, output);
    await nexus.rememberEpisodic({
      summary:    `Campaign step done: ${taskRow.title}`,
      content:    { taskId: taskRow.id, action, output },
      type:       'task_result',
      tags:       ['campaign', taskRow.agent_id || 'nexus'],
      importance: 3,
      taskId:     taskRow.id,
    });

    return { ok: true, output };
  } catch (e) {
    await nexus.failTask(taskRow.id, e.message);
    return { ok: false, error: e.message };
  }
}

/** Process all due orchestration steps (cron + in-process timer). */
export async function processDueOrchestrationSteps(nexus, { limit = 5 } = {}) {
  const db = getSupabase();
  if (!db) return { processed: 0, results: [] };

  const now = new Date().toISOString();
  const { data: due } = await db
    .from('tasks')
    .select('*')
    .eq('type', 'orchestration_step')
    .eq('status', 'pending')
    .lte('due_at', now)
    .order('due_at', { ascending: true })
    .limit(limit);

  const results = [];
  for (const row of due || []) {
    console.log(`[Nexus Campaign] Running step: ${row.title}`);
    const r = await executeOrchestrationStep(nexus, row);
    results.push({ taskId: row.id, title: row.title, ...r });

    if (row.parent_task_id) {
      await maybeCompleteCampaign(row.parent_task_id);
    }
  }

  return { processed: results.length, results };
}

async function maybeCompleteCampaign(parentId) {
  const db = getSupabase();
  if (!db) return;

  const { data: siblings } = await db
    .from('tasks')
    .select('status')
    .eq('parent_task_id', parentId)
    .eq('type', 'orchestration_step');

  const allDone = (siblings || []).every(s =>
    s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled'
  );

  if (allDone && siblings?.length) {
    await supabaseWrite(db.from('tasks').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', parentId), 'campaign complete');
  }
}

/** List recent campaigns for API / UI. */
export async function listOrchestrationCampaigns({ limit = 10 } = {}) {
  const db = getSupabase();
  if (!db) return { campaigns: [] };

  const { data } = await db
    .from('tasks')
    .select('id, title, status, created_at, completed_at, input, output')
    .eq('type', 'orchestration_campaign')
    .order('created_at', { ascending: false })
    .limit(limit);

  const campaigns = [];
  for (const row of data || []) {
    const { data: steps } = await db
      .from('tasks')
      .select('id, title, status, agent_id, due_at, completed_at, output')
      .eq('parent_task_id', row.id)
      .order('due_at', { ascending: true });
    campaigns.push({ ...row, steps: steps || [] });
  }

  return { campaigns };
}
