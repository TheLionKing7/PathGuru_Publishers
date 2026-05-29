/**
 * DigiFusion Intelligence Network — Nexus
 * =========================================
 * Project Manager & Task Coordinator
 *
 * Nexus is the operational backbone of the agent network.
 * It does not produce creative work — it ensures all work gets done,
 * is tracked, routed to the right agent, and delivered on time.
 *
 * Responsibilities:
 *   1. Task intake     — receives instructions from the team, decomposes them
 *   2. Routing         — assigns tasks to the right specialist agent
 *   3. Monitoring      — tracks task status across all agents
 *   4. Oversight relay — surfaces bottlenecks and completion to the team
 *   5. Dashboard       — provides the team a live view of the network
 */

import { AgentBase }   from './agentBase.js';
import { getSupabase } from '../supabaseClient.js';
import { callAiProvider } from '../aiPipeline.js';

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
  // TASK ROUTING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Decompose a high-level instruction into sub-tasks and assign to agents.
   * @param {string} instruction  — team instruction (e.g. "Produce a BD playbook on SaaS sales")
   * @param {object} [options]
   * @param {number} [options.priority]
   * @returns {object[]}  — array of created task records
   */
  async orchestrate(instruction, options = {}) {
    const { priority = 3 } = options;

    const decompositionPrompt = `You are decomposing a team instruction into discrete tasks for the DigiFusion agent network.

INSTRUCTION: "${instruction}"

AVAILABLE AGENTS AND CAPABILITIES:
${Object.entries(AGENT_CAPABILITIES).map(([id, caps]) => `- ${id}: ${caps.join(', ')}`).join('\n')}

Break this instruction into 2–6 well-defined tasks. For each task:
{
  "title": "clear task title",
  "description": "what the agent must produce, specific and actionable",
  "agent_id": "which agent should handle this",
  "type": "research|content|design|analysis|general",
  "priority": 1-5,
  "depends_on": [],
  "estimated_complexity": "simple|moderate|complex"
}

Return a JSON array of tasks ordered by execution sequence (tasks that must run first come first).
Return ONLY the JSON array.`;

    let tasks;
    try {
      const raw = await callAiProvider(this.provider, decompositionPrompt, this.systemPrompt);
      tasks = this._parseJsonArray(raw);
    } catch (e) {
      console.error('[Nexus] Decomposition failed:', e.message);
      // Fallback: single task assigned to most relevant agent
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

    // Create a parent task for this instruction
    const { data: parent } = db ? await db.from('tasks').insert({
      title:      `[Nexus] ${instruction.slice(0, 100)}`,
      description: instruction,
      agent_id:   'nexus',
      created_by: 'team',
      status:     'in_progress',
      priority,
      type:       'general',
    }).select().single() : { data: null };

    const parentId = parent?.id;

    // Create each sub-task
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

    // Write episodic memory
    await this.rememberEpisodic({
      summary:    `Orchestrated instruction: "${instruction.slice(0, 100)}" → ${tasks.length} tasks created`,
      content:    { instruction, tasks, parentId },
      type:       'decision',
      tags:       ['orchestration'],
      importance: 4,
    });

    console.log(`[Nexus] Orchestrated: "${instruction.slice(0, 60)}" → ${created.length} tasks`);
    return { parentId, tasks: created };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NETWORK STATUS DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return a live snapshot of the entire agent network.
   * Used by the team oversight dashboard.
   */
  async getNetworkStatus() {
    const db = getSupabase();
    if (!db) return { error: 'Supabase not configured' };

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
      agents:           agentsRes.data || [],
      activeTasks:      tasksRes.data  || [],
      pendingAlerts:    notifRes.data  || [],
      snapshotAt:       new Date().toISOString(),
    };
  }

  /**
   * Return task history with filters.
   */
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

  /**
   * Generate a natural-language status report for the team.
   * Nexus reads the current network state and writes a concise briefing.
   */
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

    return callAiProvider(this.provider, reportPrompt, this.systemPrompt);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE
  // ══════════════════════════════════════════════════════════════════════════

  async execute(task) {
    const { action, instruction, agentId, status, limit, offset } = task;

    switch (action) {
      case 'orchestrate':
        return this.orchestrate(instruction, { priority: task.priority });

      case 'network_status':
        return this.getNetworkStatus();

      case 'task_history':
        return this.getTaskHistory({ agentId, status, limit, offset });

      case 'status_report':
        return { report: await this.generateStatusReport() };

      default:
        // Team sent a natural language instruction — orchestrate it
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
