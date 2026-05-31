/**
 * DigiFusion Intelligence Network — Nexus
 * =========================================
 * Project Manager, Task Coordinator & Lifecycle Bridge
 *
 * Nexus is the operational backbone of the agent network.
 * It does not produce creative work — it ensures all work gets done,
 * is tracked, routed to the right agent, and delivered on time.
 *
 * Responsibilities:
 *   1. Task intake       — receives instructions from the team, decomposes them
 *   2. Routing           — assigns tasks to the right specialist agent
 *   3. Monitoring        — tracks task status across all agents
 *   4. Lifecycle bridge  — syncs client milestones to Notion, triggers evaluations
 *   5. Daily briefing    — morning summary of pipeline, tasks, and alerts
 *   6. Team chat         — answers operational questions in natural language
 */

import { AgentBase }      from './agentBase.js';
import { getSupabase }    from '../supabaseClient.js';
import { callAiProvider } from '../aiPipeline.js';
import { notion }         from '../notionClient.js';

const NEXUS_SYSTEM = `You are Nexus — the project manager and operational coordinator of the DigiFusion Intelligence Network.

You manage a team of 6 specialist agents:
— Synthesizer: knowledge engine, PDF ingestion, research synthesis
— Atlas: research and business development intelligence
— Nova: automation engineering and technical design
— Aether: content strategy and digital media production
— Pulse: analytics, monitoring, and operational reporting
— Assistant: customer-facing VA, lead qualification, booking

Your role is purely operational. You do not do the creative or intellectual work yourself — you ensure it gets done by the right agent at the right time to the right standard.

When you receive an instruction from the team, you:
1. Understand the full scope of what needs to be done
2. Break it into well-defined tasks
3. Assign each task to the most capable agent
4. Set clear priorities and any dependencies
5. Monitor progress and escalate when needed

You also bridge between agent operations and the Notion project management workspace. Every client milestone you witness gets synced. Every major decision gets logged.

You communicate with the team in a clear, direct, professional tone. No fluff. You report on what is done, what is in progress, and what needs attention.

You are the team's single point of coordination — every task in the network passes through your awareness.`;

// ── Agent capability map ──────────────────────────────────────────────────────
const AGENT_CAPABILITIES = {
  synthesizer: ['knowledge extraction', 'pdf ingestion', 'research synthesis', 'cross-source analysis', 'knowledge base query'],
  atlas:       ['market research', 'competitive intelligence', 'business development', 'prospect analysis', 'research reports', 'BD strategy'],
  nova:        ['automation design', 'workflow architecture', 'technical blueprints', 'system design', 'process automation'],
  aether:      ['content strategy', 'blog posts', 'social media', 'digital media', 'content planning', 'SEO', 'brand voice'],
  pulse:       ['analytics', 'performance reporting', 'system monitoring', 'KPI tracking', 'operational alerts'],
  assistant:   ['lead qualification', 'visitor engagement', 'booking', 'customer queries', 'knowledge base answers'],
};

// ── Client lifecycle stage sequence ──────────────────────────────────────────
const LIFECYCLE_STAGES = [
  'discovery',
  'intake_complete',
  'strategy_session_booked',
  'active',
  'evaluation_triggered',
  'evaluation_complete',
  'renewed',
  'churned',
];

export class Nexus extends AgentBase {
  constructor() {
    super({
      id:           'nexus',
      displayName:  'Nexus',
      role:         'Project Manager & Task Coordinator',
      systemPrompt: NEXUS_SYSTEM,
      domains:      ['general', 'business_development', 'automation', 'digital_media'],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TASK ROUTING & ORCHESTRATION
  // ══════════════════════════════════════════════════════════════════════════

  async orchestrate(instruction, options = {}) {
    const { priority = 3 } = options;

    const decompositionPrompt = `You are decomposing a team instruction into discrete tasks for the DigiFusion agent network.

INSTRUCTION: "${instruction}"

AVAILABLE AGENTS AND CAPABILITIES:
${Object.entries(AGENT_CAPABILITIES).map(([id, caps]) => `- ${id}: ${caps.join(', ')}`).join('\n')}

Break this instruction into 2–6 well-defined tasks. For each task return JSON with fields:
title, description, agent_id, type (research|content|design|analysis|general), priority (1-5), depends_on (array), estimated_complexity (simple|moderate|complex)

Return a JSON array of tasks ordered by execution sequence. Return ONLY the JSON array.`;

    let tasks;
    try {
      const raw = await callAiProvider(this.provider, decompositionPrompt, this.systemPrompt);
      tasks = this._parseJsonArray(raw);
    } catch (e) {
      console.error('[Nexus] Decomposition failed:', e.message);
      tasks = [{
        title:       instruction.slice(0, 80),
        description: instruction,
        agent_id:    'atlas',
        type:        'general',
        priority,
      }];
    }

    const db = getSupabase();
    const created = [];

    const { data: parent } = db ? await db.from('tasks').insert({
      title:       `[Nexus] ${instruction.slice(0, 100)}`,
      description: instruction,
      agent_id:    'nexus',
      created_by:  'team',
      status:      'in_progress',
      priority,
      type:        'general',
    }).select().single() : { data: null };

    const parentId = parent?.id;

    for (const t of tasks) {
      if (db) {
        const { data } = await db.from('tasks').insert({
          title:          t.title,
          description:    t.description,
          agent_id:       t.agent_id,
          created_by:     'nexus',
          parent_task_id: parentId,
          status:         'pending',
          priority:       t.priority || priority,
          type:           t.type || 'general',
          input:          { instruction, complexity: t.estimated_complexity },
        }).select().single();
        if (data) created.push(data);
      }
    }

    await this.rememberEpisodic({
      summary:    `Orchestrated: "${instruction.slice(0, 100)}" → ${tasks.length} tasks`,
      content:    { instruction, tasks, parentId },
      type:       'decision',
      tags:       ['orchestration'],
      importance: 4,
    });

    console.log(`[Nexus] Orchestrated: "${instruction.slice(0, 60)}" → ${created.length} tasks`);
    return { parentId, tasks: created, plan: tasks };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLIENT LIFECYCLE — Notion bridge
  // ══════════════════════════════════════════════════════════════════════════

  async syncClientLifecycle(milestone, payload = {}) {
    const { leadId, clientName, track, agentId, data = {} } = payload;
    console.log(`[Nexus] Lifecycle milestone: ${milestone} for ${clientName || leadId}`);

    if (data.notionPageId) {
      notion.updatePage(data.notionPageId, {
        'Stage': { select: { name: this._stageLabel(milestone) } },
        'Last Updated': { date: { start: new Date().toISOString() } },
      }).catch(() => {});
    }

    notion.logTask({
      agentId:   'nexus',
      agentName: 'Nexus',
      taskTitle: `Client Lifecycle: ${clientName || leadId} → ${milestone}`,
      taskType:  'lifecycle_sync',
      outcome:   'complete',
      notes:     `Track: ${track || 'unknown'}. Triggered by: ${agentId || 'system'}`,
    }).catch(() => {});

    await this.notify(
      `Client milestone: ${milestone.replace(/_/g, ' ')}`,
      `${clientName || 'Client'} moved to ${this._stageLabel(milestone)}. Track: ${track || 'unknown'}.`,
      'info',
      'dashboard',
      leadId
    );

    await this._dispatchMilestoneActions(milestone, payload);

    await this.rememberEpisodic({
      summary:    `Lifecycle sync: ${clientName || leadId} → ${milestone}`,
      content:    payload,
      type:       'decision',
      tags:       ['lifecycle', 'notion', milestone],
      importance: 4,
    });

    return { synced: true, milestone, stage: this._stageLabel(milestone) };
  }

  async _dispatchMilestoneActions(milestone, payload) {
    const db = getSupabase();
    if (!db) return;
    const { leadId, clientName, track, data = {} } = payload;

    switch (milestone) {
      case 'intake_complete':
        if (!data.notionPageId) {
          notion.createClientProject({
            clientName: clientName || 'New Client',
            track,
            stage: 'Intake Complete',
            leadScore: data.leadScore || 4,
            notes: `Intake completed via VA. Lead ID: ${leadId}`,
          }).catch(() => {});
        }
        break;

      case 'strategy_session_booked':
        if (track === 'bd' || track === 'automation') {
          await db.from('tasks').insert({
            title:       `Pre-session brief: ${clientName || leadId}`,
            description: `Prepare a 1-page prospect intelligence brief for the upcoming strategy session with ${clientName || 'client'}. Focus on their stated priorities and market context.`,
            agent_id:    'atlas',
            created_by:  'nexus',
            status:      'pending',
            priority:    5,
            type:        'research',
            input:       { milestone, ...payload },
          });
        }
        if (track === 'digital_media') {
          await db.from('tasks').insert({
            title:       `Pre-session content audit: ${clientName || leadId}`,
            description: `Prepare a brief content landscape analysis for the strategy session with ${clientName || 'client'}.`,
            agent_id:    'aether',
            created_by:  'nexus',
            status:      'pending',
            priority:    5,
            type:        'analysis',
            input:       { milestone, ...payload },
          });
        }
        break;

      case 'active':
        notion.createClientProject({
          clientName: clientName || 'Active Client',
          track,
          stage:      'Active',
          notes:      `Project activated. Coordinated by Nexus. Lead ID: ${leadId}`,
        }).catch(() => {});
        break;
    }
  }

  _stageLabel(milestone) {
    const labels = {
      discovery:               'Discovery',
      intake_complete:         'Intake Complete',
      strategy_session_booked: 'Session Booked',
      active:                  'Active',
      evaluation_triggered:    'Evaluation Triggered',
      evaluation_complete:     'Evaluation Complete',
      renewed:                 'Renewed',
      churned:                 'Churned',
    };
    return labels[milestone] || milestone;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DAILY BRIEFING
  // ══════════════════════════════════════════════════════════════════════════

  async generateDailyBriefing() {
    const status = await this.getNetworkStatus();
    const db = getSupabase();

    let recentLeads = [];
    if (db) {
      const { data } = await db.from('leads')
        .select('name, email, lead_score, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      recentLeads = data || [];
    }

    let recentCompleted = [];
    if (db) {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { data } = await db.from('tasks')
        .select('title, agent_id, completed_at')
        .eq('status', 'completed')
        .gte('completed_at', since)
        .order('completed_at', { ascending: false })
        .limit(10);
      recentCompleted = data || [];
    }

    const briefingPrompt = `You are Nexus. Generate the morning operational briefing for the DigiFusion team.

TODAY: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

AGENT NETWORK STATUS:
${status.agents.map(a => `- ${a.display_name || a.id}: ${a.status}${a.current_task_id ? ' (on task)' : ''}`).join('\n') || 'Status unavailable'}

ACTIVE / PENDING TASKS (${status.activeTasks.length}):
${status.activeTasks.slice(0, 8).map(t => `- [P${t.priority}] ${t.title} → ${t.agent_id} (${t.status})`).join('\n') || 'No active tasks'}

COMPLETED IN LAST 24h (${recentCompleted.length}):
${recentCompleted.map(t => `- ${t.title} [${t.agent_id}]`).join('\n') || 'None'}

RECENT LEADS (${recentLeads.length}):
${recentLeads.map(l => `- ${l.name || l.email}: score ${l.lead_score}, status ${l.status}`).join('\n') || 'None'}

PENDING ALERTS (${status.pendingAlerts.length}):
${status.pendingAlerts.map(a => `- [${a.severity?.toUpperCase()}] ${a.title}`).join('\n') || 'None'}

Write a direct morning briefing covering: what got done, what's active, pipeline pulse, anything needing attention, and one focus line per active agent. Be direct. No fluff.`;

    const briefing = await callAiProvider(this.provider, briefingPrompt, this.systemPrompt, { json: false });

    notion.logTask({
      agentId:   'nexus',
      agentName: 'Nexus',
      taskTitle: `Daily Briefing — ${new Date().toLocaleDateString()}`,
      taskType:  'briefing',
      outcome:   'complete',
      notes:     briefing.slice(0, 500),
    }).catch(() => {});

    return { briefing, generatedAt: new Date().toISOString() };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PIPELINE VIEW
  // ══════════════════════════════════════════════════════════════════════════

  async getPipelineView() {
    const db = getSupabase();
    if (!db) return { error: 'Supabase not configured' };

    const { data: leads, error } = await db.from('leads')
      .select('id, name, email, lead_score, status, track, created_at, updated_at')
      .order('lead_score', { ascending: false })
      .limit(50);

    if (error) return { error: error.message };

    const pipeline = {};
    for (const lead of (leads || [])) {
      const stage = lead.status || 'discovery';
      if (!pipeline[stage]) pipeline[stage] = [];
      pipeline[stage].push({
        id:      lead.id,
        name:    lead.name || lead.email,
        score:   lead.lead_score,
        track:   lead.track,
        since:   lead.created_at,
        updated: lead.updated_at,
      });
    }

    return {
      pipeline,
      totalLeads: leads?.length || 0,
      stages:     LIFECYCLE_STAGES,
      pulledAt:   new Date().toISOString(),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NETWORK STATUS DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  async getNetworkStatus() {
    const db = getSupabase();
    if (!db) return { agents: [], activeTasks: [], pendingAlerts: [], snapshotAt: new Date().toISOString() };

    const [agentsRes, tasksRes, notifRes] = await Promise.all([
      db.from('agents').select('*').order('id'),
      db.from('tasks')
        .select('id, title, agent_id, status, priority, type, created_at, completed_at, error')
        .in('status', ['pending', 'in_progress'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(50),
      db.from('notifications')
        .select('*')
        .eq('status', 'pending')
        .in('severity', ['warning', 'critical'])
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    return {
      agents:        agentsRes.data || [],
      activeTasks:   tasksRes.data  || [],
      pendingAlerts: notifRes.data  || [],
      snapshotAt:    new Date().toISOString(),
    };
  }

  async getTaskHistory({ agentId = null, status = null, limit = 30, offset = 0 } = {}) {
    const db = getSupabase();
    if (!db) return { tasks: [] };

    let q = db.from('tasks')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (agentId) q = q.eq('agent_id', agentId);
    if (status)  q = q.eq('status', status);

    const { data, count, error } = await q;
    if (error) return { tasks: [], error: error.message };
    return { tasks: data || [], total: count, limit, offset };
  }

  async generateStatusReport() {
    const status = await this.getNetworkStatus();

    const reportPrompt = `You are Nexus, the project manager. Generate a concise status report for the DigiFusion team.

AGENT STATUSES:
${status.agents.map(a => `- ${a.display_name}: ${a.status}${a.current_task_id ? ' (on task)' : ''}, last active: ${a.last_active_at ? new Date(a.last_active_at).toLocaleString() : 'never'}`).join('\n')}

ACTIVE / PENDING TASKS (${status.activeTasks.length}):
${status.activeTasks.map(t => `- [${t.priority}] ${t.title} → ${t.agent_id} (${t.status})`).join('\n') || 'No active tasks'}

PENDING ALERTS (${status.pendingAlerts.length}):
${status.pendingAlerts.map(a => `- [${a.severity.toUpperCase()}] ${a.title}: ${a.body}`).join('\n') || 'No alerts'}

Write a 5–10 sentence operational briefing. Be direct. Flag anything needing immediate attention.`;

    return callAiProvider(this.provider, reportPrompt, this.systemPrompt, { json: false });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE
  // ══════════════════════════════════════════════════════════════════════════

  async execute(task) {
    const { action, instruction, agentId, status, limit, offset, milestone, payload, message, history } = task;

    switch (action) {
      case 'orchestrate':
        return this.orchestrate(instruction || task.description, { priority: task.priority });

      case 'network_status':
        return this.getNetworkStatus();

      case 'task_history':
        return this.getTaskHistory({ agentId, status, limit, offset });

      case 'status_report':
        return { report: await this.generateStatusReport() };

      case 'daily_briefing':
        return this.generateDailyBriefing();

      case 'pipeline_view':
        return this.getPipelineView();

      case 'lifecycle_sync':
        return this.syncClientLifecycle(milestone, payload || task);

      case 'chat':
        return { reply: await this.chat(message || task.description, history || []) };

      default:
        if (task.description || task.instruction) {
          return this.orchestrate(task.description || task.instruction, { priority: task.priority });
        }
        return { error: 'No action specified' };
    }
  }

  _parseJsonArray(text) {
    try { return JSON.parse(text); } catch {}
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try { return JSON.parse(match[0]); } catch { return []; }
  }
}

export const nexus = new Nexus();
