/**
 * Atlas BD Ops — live pipeline context, deal tools status, session helpers
 */

import { getSupabase } from '../supabaseClient.js';
import { getFrameworksForAgent } from './firmFrameworks.js';

const DEAL_STAGES = ['SUSPECT', 'PROSPECT', 'QUALIFIED', 'CLOSEABLE'];

export function getDealStages() {
  return DEAL_STAGES;
}

/** Build a live BD snapshot for Atlas chat and console */
export async function buildBdOpsSnapshot() {
  const db = getSupabase();
  const notionOk = !!(process.env.NOTION_API_KEY && process.env.NOTION_TASKS_DB_ID);

  const snap = {
    pulledAt:       new Date().toISOString(),
    notionConnected: notionOk,
    pipeline:       {},
    totalLeads:     0,
    recentAtlasTasks: [],
    activeDeals:    [],
    frameworks:     getFrameworksForAgent('atlas').map(f => f.shortName || f.name),
  };

  if (!db) return snap;

  const [leadsRes, tasksRes, dealTasksRes] = await Promise.all([
    db.from('leads')
      .select('id, name, email, company, lead_score, status, track, created_at')
      .order('lead_score', { ascending: false })
      .limit(30),
    db.from('tasks')
      .select('title, status, type, created_at')
      .eq('agent_id', 'atlas')
      .order('created_at', { ascending: false })
      .limit(8),
    db.from('tasks')
      .select('title, status, input, created_at')
      .eq('agent_id', 'atlas')
      .in('type', ['deal_strategy', 'diagnostic', 'evaluation', 'orchestration_step'])
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const leads = leadsRes.data || [];
  snap.totalLeads = leads.length;

  for (const lead of leads) {
    const stage = lead.status || 'discovery';
    if (!snap.pipeline[stage]) snap.pipeline[stage] = [];
    snap.pipeline[stage].push({
      name:  lead.name || lead.company || lead.email || 'Unknown',
      score: lead.lead_score,
      track: lead.track,
    });
  }

  snap.recentAtlasTasks = (tasksRes.data || []).map(t => ({
    title:  (t.title || '').slice(0, 70),
    status: t.status,
    type:   t.type,
  }));

  snap.activeDeals = (dealTasksRes.data || [])
    .filter(t => t.status === 'pending' || t.status === 'in_progress')
    .map(t => ({
      title: (t.title || '').slice(0, 70),
      status: t.status,
    }));

  return snap;
}

/** Format snapshot for LLM / chat grounding */
export function formatBdLiveContext(snap) {
  if (!snap) return '';

  const lines = [
    `NOTION: ${snap.notionConnected ? 'connected (can log BD tasks)' : 'not configured on server'}`,
    `PIPELINE: ${snap.totalLeads} leads`,
  ];

  const stages = Object.entries(snap.pipeline || {});
  if (stages.length) {
    lines.push('LEADS BY STAGE:');
    for (const [stage, items] of stages.slice(0, 6)) {
      lines.push(`  ${stage}: ${items.length} — ${items.slice(0, 3).map(i => i.name).join(', ')}${items.length > 3 ? '…' : ''}`);
    }
  }

  if (snap.recentAtlasTasks?.length) {
    lines.push('RECENT ATLAS TASKS:');
    snap.recentAtlasTasks.slice(0, 5).forEach(t => {
      lines.push(`  - ${t.title} [${t.status}]`);
    });
  }

  if (snap.frameworks?.length) {
    lines.push(`FIRM IP TOOLS: ${snap.frameworks.join(', ')}`);
  }

  lines.push('DEAL ENGINE PHASES: Dream 50 → Phase 1 Intelligence → Phase 2 SPIN Diagnostic → Phase 3 Challenger Insight → Phase 4 Consensus');

  return lines.join('\n');
}

/** Extract account/company name from free text */
export function extractAccountName(text) {
  const m = text.match(/(?:for|on|with|account|prospect|client|deal)\s+([A-Z][A-Za-z0-9&.\- ]{2,40})/i)
    || text.match(/([A-Z][A-Za-z0-9&.\- ]{2,40})\s+(?:deal|account|prospect)/i);
  return m ? m[1].trim() : '';
}
