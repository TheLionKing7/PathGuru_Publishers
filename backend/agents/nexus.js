/**
 * DigiFusion Intelligence Network — Nexus
 * =========================================
 * CEO & Operational Coordinator — reports directly to Ola (team owner)
 *
 * Nexus is the command layer of the agent network.
 * Every task, escalation, and knowledge gap flows through Nexus.
 *
 * Responsibilities:
 *   1. Task decomposition  — breaks instructions into discrete agent tasks
 *   2. Smart routing       — assigns work to the right agent, dispatches Researcher for gaps
 *   3. Knowledge gap mgmt  — detects gaps, dispatches Researcher → Synthesizer pipeline
 *   4. Escalation          — surfaces decisions and alerts directly to Ola
 *   5. Lifecycle bridge    — syncs client milestones to Notion
 *   6. Daily briefing      — morning operational summary for Ola
 *   7. Team chat           — direct line between Ola and the agent network
 */

import { AgentBase }      from './agentBase.js';
import { getSupabase }    from '../supabaseClient.js';
import { callAiProvider } from '../aiPipeline.js';
import { notion }         from '../notionClient.js';
import { sendImmediate }  from '../skills/notifier.js';

const NEXUS_SYSTEM = `You are Nexus — the CEO and operational coordinator of the DigiFusion Intelligence Network.

You report directly to Ola (the team owner). Your job is to ensure nothing falls through the cracks, no agent operates with a knowledge gap, and every piece of work reaches the standard DigiFusion is known for.

You manage a team of 7 specialist agents:
— Researcher:   web intelligence (Tavily/Firecrawl/Perplexity), produces KB-merged research briefs
— Synthesizer:  internal knowledge engine — PDF ingestion, knowledge base, internal queries only
— Atlas:        BD intelligence, Deal Engine execution, prospect and competitive research
— Nova:         automation engineering, technical architecture, workflow design
— Aether:       content strategy, digital media, blog publishing, brand voice
— Pulse:        analytics, performance monitoring, KPI tracking, operational alerts
— Assistant:    customer-facing VA, lead qualification, intake, booking

YOUR OPERATING PRINCIPLES:
1. Every instruction is decomposed into discrete, assignable tasks
2. When any agent needs external knowledge, Researcher is dispatched first
3. Researcher merges web findings with the internal KB (via Synthesizer) before delivery
4. You proactively detect and close knowledge gaps — never let an agent execute blind
5. Escalate to Ola when: a decision requires human authority, a client milestone is reached, an agent fails repeatedly, or a strategic inflection point is reached

ESCALATION TRIGGERS (always report to Ola):
— Client books a strategy session or activates a project
— Any agent fails 3+ times on the same task
— Knowledge gap cannot be resolved by Researcher + Synthesizer
— Task pending >48h without movement
— New high-value lead (lead_score ≥ 8)
— Monthly pipeline summary

Communicate in a direct, executive tone. State what is done, in motion, and what needs a decision.`;

// ── Agent capability map ──────────────────────────────────────────────────────
const AGENT_CAPABILITIES = {
  researcher:  ['web research', 'live data', 'competitive intelligence', 'market data', 'external knowledge', 'trend research', 'source scraping', 'research brief'],
  synthesizer: ['internal knowledge', 'pdf ingestion', 'knowledge base query', 'cross-source synthesis', 'proprietary frameworks'],
  atlas:       ['business development', 'deal strategy', 'prospect analysis', 'BD framework', 'Dream 50', 'deal engine', 'client intelligence'],
  nova:        ['automation design', 'workflow architecture', 'technical blueprints', 'system design', 'process automation', 'SaaS tools'],
  aether:      ['content strategy', 'blog posts', 'social media', 'digital media', 'content planning', 'SEO', 'brand voice'],
  pulse:       ['analytics', 'performance reporting', 'system monitoring', 'KPI tracking', 'operational alerts'],
  assistant:   ['lead qualification', 'visitor engagement', 'booking', 'customer queries', 'intake'],
};

// Tasks that always need Researcher dispatched first before execution
const RESEARCH_REQUIRED_TYPES = ['research', 'analysis', 'competitive_intelligence', 'market_research', 'content_research'];

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
  // KNOWLEDGE GAP MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Dispatch Researcher to fill a knowledge gap for any agent.
   * Researcher crawls the web, merges with internal KB, returns an enriched brief.
   * Nexus then injects that brief into the waiting agent's task context.
   */
  async dispatchResearch({ topic, forAgent, context = '', focusAreas = [], depth = 'standard' }) {
    console.log(`[Nexus] Dispatching Researcher for "${topic}" (requested by: ${forAgent})`);
    try {
      const { researcher } = await import('./researcher.js');
      const result = await researcher.research({ topic, forAgent, context, focusAreas, depth, mergeWithKB: true });

      await this.rememberEpisodic({
        summary:    `Research dispatched: "${topic}" for ${forAgent}`,
        content:    { topic, forAgent, sources: result.sources?.length, mergedWithKB: result.mergedWithKB },
        type:       'task_result',
        tags:       ['research_dispatch', forAgent],
        importance: 3,
      });

      return result;
    } catch (e) {
      console.error('[Nexus] Research dispatch failed:', e.message);
      return { brief: '', sources: [], error: e.message };
    }
  }

  /**
   * Proactively scan pending tasks for knowledge gaps.
   * For any task of a research-required type, dispatch Researcher and
   * attach the brief as context before the task executes.
   */
  async detectAndFillGaps() {
    const db = getSupabase();
    if (!db) return { filled: 0 };

    const { data: pendingResearchTasks } = await db.from('tasks')
      .select('*')
      .eq('status', 'pending')
      .in('type', RESEARCH_REQUIRED_TYPES)
      .is('input->researchBrief', null)
      .limit(5);

    if (!pendingResearchTasks?.length) return { filled: 0 };

    let filled = 0;
    for (const task of pendingResearchTasks) {
      try {
        const topic = task.title || task.description?.slice(0, 120) || 'general';
        const brief = await this.dispatchResearch({
          topic,
          forAgent: task.agent_id,
          depth:    'standard',
        });
        // Attach research brief to task input so the agent has context
        await db.from('tasks').update({
          input: { ...(task.input || {}), researchBrief: brief.brief, researchSources: brief.sources },
        }).eq('id', task.id);
        filled++;
        console.log(`[Nexus] Gap filled for task "${task.title}" → ${task.agent_id}`);
      } catch (e) {
        console.warn(`[Nexus] Gap fill failed for task ${task.id}:`, e.message);
      }
    }

    return { filled, total: pendingResearchTasks.length };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DIRECT REPORTING — Ola escalation channel
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Escalate directly to Ola (team owner).
   * Used for: high-value leads, client milestones, agent failures, strategic decisions.
   */
  async escalateToOwner({ subject, body, severity = 'info', context = {} }) {
    console.log(`[Nexus→Ola] ESCALATION [${severity.toUpperCase()}]: ${subject}`);

    // Write to Supabase notifications table (dashboard polling)
    await this.notify(subject, body, severity, 'all', context.leadId || null);

    // For warning/critical — send immediately without waiting for Pulse sweep
    if (severity === 'warning' || severity === 'critical') {
      sendImmediate(subject, body, 'all').catch(e =>
        console.warn('[Nexus] Immediate dispatch error:', e.message)
      );
    }

    // Log to Notion as a Nexus task
    notion.logTask({
      agentId:   'nexus',
      agentName: 'Nexus',
      taskTitle: `[ESCALATION] ${subject}`,
      taskType:  'escalation',
      outcome:   'pending',
      notes:     `${body}\n\nContext: ${JSON.stringify(context).slice(0, 500)}`,
    }).catch(() => {});

    await this.rememberEpisodic({
      summary:    `Escalated to Ola: ${subject}`,
      content:    { subject, body, severity, context },
      type:       'decision',
      tags:       ['escalation', 'owner_report', severity],
      importance: 5,
    });

    return { escalated: true, subject, severity, at: new Date().toISOString() };
  }

  /**
   * Check for escalation triggers and fire them automatically.
   * Called during daily briefing and after any orchestration run.
   */
  async checkEscalationTriggers() {
    const db = getSupabase();
    if (!db) return [];
    const escalations = [];

    // Trigger: high-value leads (score ≥ 8) not yet escalated
    const { data: hotLeads } = await db.from('leads')
      .select('id, name, email, lead_score, created_at')
      .gte('lead_score', 8)
      .eq('status', 'discovery')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .limit(5);

    for (const lead of hotLeads || []) {
      await this.escalateToOwner({
        subject:  `High-value lead: ${lead.name || lead.email} (score ${lead.lead_score})`,
        body:     `A lead scoring ${lead.lead_score}/10 entered the pipeline. Recommend immediate Atlas briefing and strategy session offer.`,
        severity: 'warning',
        context:  { leadId: lead.id },
      });
      escalations.push({ type: 'hot_lead', lead });
    }

    // Trigger: tasks stuck >48h
    const cutoff = new Date(Date.now() - 172800000).toISOString();
    const { data: stuckTasks } = await db.from('tasks')
      .select('id, title, agent_id, created_at')
      .in('status', ['pending', 'in_progress'])
      .lt('created_at', cutoff)
      .limit(5);

    if (stuckTasks?.length) {
      await this.escalateToOwner({
        subject:  `${stuckTasks.length} task(s) stuck >48h`,
        body:     `Tasks requiring attention:\n${stuckTasks.map(t => `• ${t.title} → ${t.agent_id}`).join('\n')}`,
        severity: 'warning',
        context:  { stuckTasks: stuckTasks.map(t => t.id) },
      });
      escalations.push({ type: 'stuck_tasks', count: stuckTasks.length });
    }

    return escalations;
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

    // Auto-prepend a Researcher task for any research-type tasks in the plan
    const researchTasks = tasks.filter(t => RESEARCH_REQUIRED_TYPES.includes(t.type));
    if (researchTasks.length > 0 && (process.env.TAVILY_API_KEY || process.env.PERPLEXITY_API_KEY || process.env.FIRECRAWL_API_KEY)) {
      const researchTopics = researchTasks.map(t => t.title).join('; ');
      tasks.unshift({
        title:                `Research brief: ${researchTopics.slice(0, 80)}`,
        description:          `Researcher to gather web intelligence and merge with internal KB for: ${researchTopics}`,
        agent_id:             'researcher',
        type:                 'research',
        priority:             Math.max(...researchTasks.map(t => t.priority || 3)),
        estimated_complexity: 'moderate',
        depends_on:           [],
      });
    }

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

    // Run escalation checks in parallel with briefing generation
    const [briefing, escalations] = await Promise.all([
      callAiProvider(this.provider, briefingPrompt, this.systemPrompt, { json: false }),
      this.checkEscalationTriggers().catch(() => []),
    ]);

    notion.logTask({
      agentId:   'nexus',
      agentName: 'Nexus',
      taskTitle: `Daily Briefing — ${new Date().toLocaleDateString()}`,
      taskType:  'briefing',
      outcome:   'complete',
      notes:     briefing.slice(0, 500),
    }).catch(() => {});

    return { briefing, escalations, generatedAt: new Date().toISOString() };
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

      case 'dispatch_research':
        return this.dispatchResearch({
          topic:       task.topic || instruction || task.description,
          forAgent:    task.forAgent || 'nexus',
          context:     task.context,
          focusAreas:  task.focusAreas || [],
          depth:       task.depth || 'standard',
        });

      case 'fill_gaps':
        return this.detectAndFillGaps();

      case 'escalate':
        return this.escalateToOwner({
          subject:  task.subject || instruction,
          body:     task.body || task.description || '',
          severity: task.severity || 'info',
          context:  task.context || {},
        });

      case 'check_escalations':
        return { escalations: await this.checkEscalationTriggers() };

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
