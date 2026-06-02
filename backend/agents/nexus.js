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
// Agent display names for human-readable output
const AGENT_DISPLAY = {
  nexus:       'Nexus (Coordinator)',
  researcher:  'Orion (Intelligence & Research)',
  atlas:       'Atlas (BD & Deal Strategy)',
  nova:        'Nova (AI, SaaS & Automation)',
  aether:      'Aether (Marketing & Content)',
  synthesizer: 'Synthesizer (Knowledge Engine)',
  pulse:       'Pulse (Analytics & Monitoring)',
  assistant:   'Assistant (Client VA)',
};

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
    // In-memory dedup for stuck-task alerts — prevents repeat notifications
    // even if the stuck_alerted_at DB column doesn't exist yet.
    this._alertedTaskIds = new Set();
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
    // channel = 'whatsapp' — Chrome push is permanently disabled; WhatsApp only.
    await this.notify(subject, body, severity, 'whatsapp', context.leadId || null);

    // For warning/critical — send immediately without waiting for Pulse sweep
    if (severity === 'warning' || severity === 'critical') {
      sendImmediate(subject, body, 'whatsapp').catch(e =>
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

    // Trigger: tasks stuck >48h — alert once per task, not every sweep
    const cutoff = new Date(Date.now() - 172800000).toISOString();
    let stuckQuery = db.from('tasks')
      .select('id, title, agent_id, created_at, stuck_alerted_at')
      .in('status', ['pending', 'in_progress'])
      .lt('created_at', cutoff)
      .limit(10);

    const { data: candidateTasks, error: stuckErr } = await stuckQuery;

    // Filter: exclude tasks already alerted via DB column (if it exists)
    // AND exclude tasks already alerted this process lifetime (in-memory Set)
    const stuckTasks = (candidateTasks || []).filter(t => {
      if (this._alertedTaskIds.has(t.id)) return false;       // in-memory guard
      if (t.stuck_alerted_at) return false;                   // DB column guard
      return true;
    }).slice(0, 5);

    if (stuckTasks.length) {
      await this.escalateToOwner({
        subject:  `${stuckTasks.length} task(s) stuck >48h`,
        body:     `Tasks requiring attention:\n${stuckTasks.map(t => `• ${t.title} → ${t.agent_id}`).join('\n')}`,
        severity: 'warning',
        context:  { stuckTasks: stuckTasks.map(t => t.id) },
      });
      // Mark alerted in memory immediately (survives even if DB update fails)
      stuckTasks.forEach(t => this._alertedTaskIds.add(t.id));
      // Try to persist to DB column (requires migration 009 to be run)
      try {
        await db.from('tasks')
          .update({ stuck_alerted_at: new Date().toISOString() })
          .in('id', stuckTasks.map(t => t.id));
      } catch (_) { /* column may not exist yet — in-memory guard handles it */ }
      escalations.push({ type: 'stuck_tasks', count: stuckTasks.length });
    }

    return escalations;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TASK ROUTING & ORCHESTRATION
  // ══════════════════════════════════════════════════════════════════════════

  // ── Intent classifier — detects if an instruction is primarily research ──
  _isResearchIntent(instruction) {
    const lower = instruction.toLowerCase();
    const researchSignals = [
      'research', 'find out', 'investigate', 'look up', 'look into',
      'what is', 'what are', 'how does', 'how do', 'tell me about',
      'gather', 'compile', 'analyse', 'analyze', 'study', 'explore',
      'what do we know', 'intelligence on', 'intel on', 'data on',
      'market data', 'market research', 'competitive intel', 'background on',
      'deep dive', 'audit', 'scan', 'survey', 'review the', 'understand',
    ];
    return researchSignals.some(s => lower.includes(s));
  }

  // ── Route to the right agent after research ──────────────────────────────
  _suggestNextSteps(brief) {
    return [
      {
        id:          'blog',
        label:       'Write a blog article — Aether (Marketing)',
        agent:       'aether',
        description: 'Aether drafts a publication-ready article using the research. Best for thought leadership, SEO content, and audience education.',
      },
      {
        id:          'bd_brief',
        label:       'Build a BD strategy brief — Atlas (BD)',
        agent:       'atlas',
        description: 'Atlas applies the Deal Engine framework to the research and produces a business development strategy with prospect recommendations and winning angles.',
      },
      {
        id:          'automation',
        label:       'Design an automation solution — Nova (AI & SaaS)',
        agent:       'nova',
        description: 'Nova maps the research findings to an AI workflow or SaaS automation architecture using the Automation Velocity Engine framework.',
      },
      {
        id:          'report',
        label:       'Produce a full intelligence report — Synthesizer',
        agent:       'synthesizer',
        description: 'Synthesizer builds a structured intelligence brief and saves it to the knowledge base for all agents to reference.',
      },
      {
        id:          'save',
        label:       'Save to knowledge base only',
        agent:       'synthesizer',
        description: 'Store findings quietly in the Synthesizer KB. No output document produced.',
      },
    ];
  }

  async orchestrate(instruction, options = {}) {
    const { priority = 3, researchBrief = null, nextStep = null } = options;
    const db = getSupabase();

    // ── PHASE 2: User has chosen what to do with research results ────────────
    if (researchBrief && nextStep) {
      console.log(`[Nexus] Phase 2 — routing research result to: ${nextStep}`);
      const stepMap = {
        blog:       { agent_id: 'aether',      title: 'Write blog article from Orion research',               type: 'content'  },
        bd_brief:   { agent_id: 'atlas',       title: 'Build BD strategy brief from Orion research',          type: 'analysis' },
        automation: { agent_id: 'nova',        title: 'Design automation solution from Orion research',       type: 'analysis' },
        report:     { agent_id: 'synthesizer', title: 'Build intelligence report from Orion research',        type: 'analysis' },
        save:       { agent_id: 'synthesizer', title: 'Save Orion research to knowledge base',                type: 'research' },
        // legacy key kept for backward compat
        strategy:   { agent_id: 'atlas',       title: 'Create strategy brief from Orion research',            type: 'analysis' },
      };
      const step = stepMap[nextStep] || { agent_id: 'atlas', title: 'Act on Orion research findings', type: 'general' };

      if (db) {
        await db.from('tasks').insert({
          title:       step.title,
          description: `Use the following research brief:\n\n${researchBrief.slice(0, 2000)}`,
          agent_id:    step.agent_id,
          created_by:  'nexus',
          status:      'pending',
          priority,
          type:        step.type,
          input:       JSON.stringify({ researchBrief, originalInstruction: instruction }),
        });
      }

      // If BD brief — trigger Atlas immediately
      if (nextStep === 'bd_brief' || nextStep === 'strategy') {
        try {
          const { atlas } = await import('./atlas.js');
          const bdPrompt = `You are Atlas, DigiFusion's BD specialist. Using the research findings below, produce a structured business development strategy brief.

RESEARCH FINDINGS:
${researchBrief.slice(0, 3000)}

Apply the Deal Engine framework: identify the opportunity, the ideal prospect profile, the winning angle, key objections, and recommended next actions. Be specific and actionable.`;
          const brief = await atlas.chat(bdPrompt);
          return {
            type:    'bd_brief_ready',
            agent:   'atlas',
            message: 'Atlas has produced a BD strategy brief from the research.',
            content: brief,
          };
        } catch (e) {
          console.error('[Nexus] Atlas dispatch failed:', e.message);
        }
      }

      // If automation — trigger Nova immediately
      if (nextStep === 'automation') {
        try {
          const { nova } = await import('./nova.js');
          const novaPrompt = `You are Nova, DigiFusion's AI & SaaS automation specialist. Using the research findings below, design an AI automation or SaaS solution architecture.

RESEARCH FINDINGS:
${researchBrief.slice(0, 3000)}

Apply the Automation Velocity Engine (AVE) framework: identify the automation opportunity, map the workflow, recommend the AI/SaaS stack, outline the implementation phases, and estimate the efficiency gain.`;
          const brief = await nova.chat(novaPrompt);
          return {
            type:    'automation_brief_ready',
            agent:   'nova',
            message: 'Nova has designed an automation solution from the research.',
            content: brief,
          };
        } catch (e) {
          console.error('[Nexus] Nova dispatch failed:', e.message);
        }
      }

      // If blog — trigger Aether immediately via content publish pipeline
      if (nextStep === 'blog') {
        try {
          const { aether } = await import('./aether.js');
          const writePrompt = `You are DigiFusion's senior content strategist. Using the research findings below, write a complete, publication-ready blog article for DigiFusion.

RESEARCH FINDINGS:
${researchBrief.slice(0, 3000)}

REQUIREMENTS:
- Length: 1,200–1,800 words
- Tone: Authoritative, insightful, practitioner-grade
- Structure: Strong hook, clear H2/H3 headers, data-backed claims, concrete takeaways
- Close with a CTA pointing to DigiFusion's strategy session
- Format: Markdown

Write the full article now.`;
          const articleContent = await aether.chat(writePrompt);
          const titleMatch = articleContent.match(/^#\s+(.+)$/m);
          const title = titleMatch?.[1] || instruction.slice(0, 80);
          const { generateAndPublishBlogPost } = await import('../blogPublisher.js');
          const publishResult = await generateAndPublishBlogPost({
            title, content: articleContent, sector: 'intelligence',
            tags: ['research', 'digifusion'], status: 'draft', authorName: 'DigiFusion Intelligence',
          }).catch(() => null);

          return {
            type:      'blog_published',
            title,
            published: Boolean(publishResult),
            message:   publishResult
              ? `Aether has written "${title}" and saved it as a draft. Review it in your blog dashboard.`
              : `Aether wrote the article but blog publishing is not configured. The content is ready below.`,
            content:   articleContent.slice(0, 500) + '…',
          };
        } catch (e) {
          console.error('[Nexus] Aether blog dispatch failed:', e.message);
        }
      }

      return {
        type:    'task_queued',
        agent:   step.agent_id,
        message: `${step.agent_id.charAt(0).toUpperCase() + step.agent_id.slice(1)} has been briefed and the task is queued. Check the Tasks tab to monitor progress.`,
      };
    }

    // ── PHASE 1A: Pure research intent — run Orion immediately ───────────────
    if (this._isResearchIntent(instruction)) {
      console.log(`[Nexus] Research intent detected — dispatching Orion immediately`);
      const db2 = getSupabase();

      // Log a parent task
      if (db2) {
        await db2.from('tasks').insert({
          title:       `[Orion] Research: ${instruction.slice(0, 80)}`,
          description: instruction,
          agent_id:    'researcher',
          created_by:  'nexus',
          status:      'in_progress',
          priority,
          type:        'research',
        });
      }

      let brief = null;
      try {
        const { researcher } = await import('./researcher.js');
        const result = await researcher.research({
          topic:        instruction,
          forAgent:     'nexus',
          depth:        'standard',
          mergeWithKB:  true,
        });
        brief = result?.brief || result?.summary || String(result || '');
      } catch (e) {
        console.error('[Nexus] Orion research failed:', e.message);
        brief = `Research could not be completed: ${e.message}`;
      }

      const nextSteps = this._suggestNextSteps(brief);

      await this.rememberEpisodic({
        summary:    `Orion researched: "${instruction.slice(0, 80)}"`,
        content:    { instruction, brief: brief?.slice(0, 500) },
        type:       'research',
        tags:       ['orion', 'research'],
        importance: 3,
      });

      return {
        type:       'research_complete',
        agent:      'orion',
        brief,
        nextSteps,
        message:    `Orion has completed the research. What should I do with these findings?`,
      };
    }

    // ── PHASE 1B: Multi-step instruction — decompose and queue ───────────────
    const decompositionPrompt = `You are Nexus — the strategic coordinator of the DigiFusion agent network. Decompose this instruction into discrete tasks and assign each to the right specialist.

INSTRUCTION: "${instruction}"

SPECIALIST AGENTS — match tasks precisely:
- researcher (Orion): Any task requiring live web data, market intelligence, competitor research, or current facts. ALWAYS first in sequence if research is needed.
- atlas (BD Specialist): Business development, deal strategy, prospect analysis, client intelligence, sales frameworks, BD playbooks, opportunity assessment, Dream 50.
- nova (AI & SaaS Specialist): AI automation design, SaaS tool architecture, workflow automation, technical blueprints, process automation, digital transformation systems.
- aether (Marketing Specialist): Blog articles, content strategy, social media, brand voice, editorial content, SEO, campaign copy, thought leadership writing.
- synthesizer: Building structured knowledge documents, intelligence reports, saving to knowledge base, PDF extraction, knowledge queries.
- pulse: Analytics, performance monitoring, health checks, dashboards, metrics sweeps.

Routing rules:
1. If the instruction mentions research/investigation → researcher (Orion) goes FIRST
2. If it mentions BD, deals, clients, sales, pipeline → atlas
3. If it mentions automation, AI tools, SaaS, workflows, systems → nova
4. If it mentions writing, content, articles, social posts, marketing → aether
5. Never assign content writing to atlas or nova — that is always aether
6. Never assign BD/sales to aether or nova — that is always atlas
7. Break into 2–5 tasks maximum

Return ONLY a JSON array with fields: title, description, agent_id, type (research|content|analysis|general), priority (1-5)`;

    let tasks;
    try {
      const raw = await callAiProvider(this.provider, decompositionPrompt, this.systemPrompt);
      tasks = this._parseJsonArray(raw);
    } catch (e) {
      console.error('[Nexus] Decomposition failed:', e.message);
      tasks = [{ title: instruction.slice(0, 80), description: instruction, agent_id: 'atlas', type: 'general', priority }];
    }

    const { data: parent } = db ? await db.from('tasks').insert({
      title: `[Nexus] ${instruction.slice(0, 100)}`,
      description: instruction, agent_id: 'nexus', created_by: 'team',
      status: 'in_progress', priority, type: 'general',
    }).select().single() : { data: null };

    const parentId = parent?.id;
    const created  = [];

    for (const t of tasks) {
      if (db) {
        const { data } = await db.from('tasks').insert({
          title: t.title, description: t.description, agent_id: t.agent_id,
          created_by: 'nexus', parent_task_id: parentId,
          status: 'pending', priority: t.priority || priority, type: t.type || 'general',
          input: JSON.stringify({ instruction }),
        }).select().single();
        if (data) created.push(data);
      }
    }

    await this.rememberEpisodic({
      summary:    `Orchestrated: "${instruction.slice(0, 100)}" → ${tasks.length} tasks`,
      content:    { instruction, tasks, parentId },
      type:       'decision', tags: ['orchestration'], importance: 4,
    });

    console.log(`[Nexus] Orchestrated "${instruction.slice(0, 60)}" → ${created.length} tasks`);
    return { type: 'plan', parentId, tasks: created, plan: tasks };
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
      totalLeads:  leads?.length || 0,
      stageCount:  Object.fromEntries(Object.entries(pipeline).map(([s, l]) => [s, l.length])),
      generatedAt: new Date().toISOString(),
    };
  }

  // execute() — handle direct task dispatch
  async execute(task) {
    const { action, ...payload } = task;
    switch (action) {
      case 'dispatch_research':
        return this.dispatchResearch(payload);
      case 'fill_gaps':
        return this.detectAndFillGaps();
      case 'escalate':
        return this.escalateToOwner(payload);
      case 'check_escalations':
        return { escalations: await this.checkEscalationTriggers() };
      case 'publish_sector_article':
        return this.publishSectorArticle(payload);
      case 'create_content_calendar':
        return this.createContentCalendar(payload);
      default:
        return this.orchestrate(JSON.stringify(task));
    }
  }

  // Content calendar — generate and queue sector articles
  async createContentCalendar({ sectors = ['sme', 'fintech', 'government', 'pharma', 'hospitality'], count = 5 } = {}) {
    const { putJsonCache, getJsonCache } = await import('../cloudflareR2.js');
    const prompt = `You are the DigiFusion content strategy director. Generate a ${count}-article content calendar targeting: ${sectors.join(', ')}.

For each article provide:
- headline: punchy, SEO-ready, under 70 chars
- sector: target sector
- topic: full topic description  
- angle: unique insight or hook
- keyword: primary SEO keyword
- audience: target reader
- scheduledFor: ISO date string, one per day starting tomorrow
- rationale: why it drives DigiFusion enquiries

Output ONLY a valid JSON array: [{ headline, sector, topic, angle, keyword, audience, scheduledFor, rationale }]

Practitioner-grade topics only. No generic listicles.`;

    const raw = await this._callWithFallback(prompt);
    let ideas = [];
    try {
      const m = raw.match(/\[\s\S]*\]/);
      ideas = JSON.parse(m?.[0] || '[]');
    } catch {
      ideas = [];
    }

    const existing = (await getJsonCache('cache/content-schedule.json').catch(() => null)) || [];
    const fresh = ideas.map(a => ({ ...a, status: 'queued' }));
    await putJsonCache('cache/content-schedule.json', [...fresh, ...existing].slice(0, 20));

    return { calendar: fresh, totalQueued: fresh.length + existing.length };
  }

  // Researcher -> Aether pipeline for a single sector article
  async publishSectorArticle({ sector, topic, angle }) {
    if (!topic) throw new Error('topic is required');

    const research = await this.dispatchResearch({
      topic, forAgent: 'aether',
      focusAreas: [sector].filter(Boolean),
      depth: 'standard',
    });

    const db = getSupabase();
    if (db) {
      await db.from('tasks').insert({
        title:       `Write + publish: ${topic.slice(0, 80)}`,
        description: `Write and publish a full ${sector || 'business'} article on: "${topic}"${angle ? `. Angle: ${angle}` : ''}.`,
        agent_id:    'aether',
        created_by:  'nexus',
        status:      'pending',
        priority:    4,
        type:        'content',
        input:       JSON.stringify({ topic, sector, angle, researchBrief: research?.brief }),
      }).catch(() => {});
    }

    return {
      topic, sector,
      researchReady: Boolean(research?.brief),
      message: `Researcher complete. Aether briefed to write "${topic}". POST /api/content/publish to trigger immediately.`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NEWSLETTER — weekly topic proposal
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Propose 3 newsletter topics for the coming week.
   * Saves them to newsletter_campaigns with status='proposed'.
   * Called by Pulse weekly sweep (Monday morning) or manually.
   */
  async proposeNewsletterTopics() {
    const db = getSupabase();
    if (!db) return { error: 'Supabase not configured' };

    // Don't propose if there are already pending proposals this week
    const monday  = _getMondayISO();
    const { data: existing } = await db.from('newsletter_campaigns')
      .select('id').eq('week_of', monday).in('status', ['proposed', 'approved', 'curating', 'ready', 'sent'])
      .limit(1);
    if (existing?.length) {
      return { skipped: true, reason: 'Proposals already exist for this week', weekOf: monday };
    }

    const prompt = `You are Nexus, the strategic coordinator of DigiFusion — a consulting firm specialising in AI automation, business development, and digital media for SMBs and enterprises in Africa.

Propose 3 newsletter topic ideas for this week's subscriber email. Each topic should:
- Be timely and relevant to Nigerian/African business leaders and entrepreneurs
- Connect clearly to one of DigiFusion's three pillars: AI Automation, BD/Sales Growth, or Digital Media & Content
- Have a strong "why now" angle (recent event, trend, or season)
- Not overlap with generic global tech content — be specific to the African context

Return JSON array only, no markdown:
[
  { "topic": "short compelling headline", "angle": "2-sentence explanation of the hook and why it matters now", "pillar": "automation|bd|digital_media" },
  { "topic": "...", "angle": "...", "pillar": "..." },
  { "topic": "...", "angle": "...", "pillar": "..." }
]`;

    let proposals;
    try {
      const raw = await callAiProvider(this.provider, prompt, this.systemPrompt);
      proposals = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || raw);
    } catch (e) {
      console.error('[Nexus] Newsletter topic generation failed:', e.message);
      return { error: e.message };
    }

    // Save each proposal
    const inserted = [];
    for (const p of (proposals || []).slice(0, 3)) {
      const { data } = await db.from('newsletter_campaigns').insert({
        proposed_topic: p.topic,
        proposed_angle: p.angle,
        proposed_by:    'nexus',
        week_of:        monday,
        status:         'proposed',
      }).select().single();
      if (data) inserted.push(data);
    }

    // Notify team
    if (inserted.length > 0) {
      await this.escalateToOwner({
        subject:  `Newsletter proposals ready — ${inserted.length} topics for your approval`,
        body:     inserted.map((p, i) => `${i + 1}. ${p.proposed_topic}\n   ${p.proposed_angle}`).join('\n\n'),
        severity: 'info',
        context:  { campaignIds: inserted.map(p => p.id) },
      });
    }

    return { proposed: inserted.length, weekOf: monday, campaigns: inserted };
  }

  /**
   * Approve a newsletter campaign and trigger Aether to curate content.
   * Called by the PathGuru console when you click "Approve".
   */
  async approveNewsletter(campaignId) {
    const db = getSupabase();
    if (!db) return { error: 'Supabase not configured' };

    const { data: campaign, error } = await db.from('newsletter_campaigns')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: 'ola' })
      .eq('id', campaignId)
      .select().single();

    if (error || !campaign) return { error: error?.message || 'Campaign not found' };

    // Queue Aether to curate the newsletter
    await db.from('tasks').insert({
      title:       `Write newsletter: "${campaign.proposed_topic}"`,
      description: `Write a DigiFusion weekly newsletter on the topic: "${campaign.proposed_topic}".\n\nAngle: ${campaign.proposed_angle}\n\nThe newsletter should be 400–600 words, professional but warm, with one key insight, one practical takeaway, and a soft CTA to book a strategy session. Return JSON: { "subject_line": "...", "preview_text": "...", "html_body": "...full HTML...", "plain_body": "...plain text..." }`,
      agent_id:    'aether',
      created_by:  'nexus',
      status:      'pending',
      priority:    5,
      type:        'newsletter',
      input:       JSON.stringify({ campaignId, topic: campaign.proposed_topic, angle: campaign.proposed_angle }),
    });

    // Update campaign status to curating
    await db.from('newsletter_campaigns').update({ status: 'curating' }).eq('id', campaignId);

    return { approved: true, campaignId, topic: campaign.proposed_topic };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SESSION REMINDERS — WhatsApp 15 mins before
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Check for upcoming sessions and send WhatsApp reminders.
   * Called by Pulse.sweep() every minute when server is running.
   */
  async sendSessionReminders() {
    const db = getSupabase();
    if (!db) return { checked: 0, sent: 0 };

    const now       = new Date();
    const windowEnd = new Date(now.getTime() + 20 * 60 * 1000); // next 20 mins
    const windowStart = new Date(now.getTime() + 10 * 60 * 1000); // at least 10 mins away

    const { data: upcoming } = await db.from('service_bookings')
      .select('*')
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)
      .gte('booking_time', windowStart.toISOString())
      .lte('booking_time', windowEnd.toISOString());

    if (!upcoming?.length) return { checked: 0, sent: 0 };

    let sent = 0;
    for (const booking of upcoming) {
      if (!booking.client_phone) {
        // Mark sent anyway so we don't keep trying with no phone number
        await db.from('service_bookings').update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() }).eq('id', booking.id);
        continue;
      }

      const timeStr = new Date(booking.booking_time).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: booking.timezone || 'Africa/Lagos'
      });

      const message = `Hi ${booking.client_name?.split(' ')[0] || 'there'}, this is a reminder that your strategy session with DigiFusion starts in about 15 minutes (${timeStr} Lagos time). We're looking forward to speaking with you.`;

      const { sendImmediate: _si } = await import('../skills/notifier.js');
      await _sendWhatsAppDirect(booking.client_phone, message);

      await db.from('service_bookings').update({
        reminder_sent:    true,
        reminder_sent_at: new Date().toISOString(),
      }).eq('id', booking.id);

      sent++;
      console.log(`[Nexus] Session reminder sent to ${booking.client_name} (${booking.client_phone})`);
    }

    return { checked: upcoming.length, sent };
  }
}

// ── Standalone WhatsApp sender (used for reminders, bypasses notifier table) ──
async function _sendWhatsAppDirect(to, message) {
  const sid   = (process.env.TWILIO_ACCOUNT_SID  || '').trim();
  const token = (process.env.TWILIO_AUTH_TOKEN    || '').trim();
  const from  = (process.env.TWILIO_WHATSAPP_FROM || '').trim();
  if (!sid || !token || !from) return;

  // Ensure both From and To carry the whatsapp: prefix (prevents Twilio error 21910)
  const fromWA = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  const toWA   = to.startsWith('whatsapp:')   ? to   : `whatsapp:${to}`;
  try {
    const params = new URLSearchParams({ From: fromWA, To: toWA, Body: message });
    const res    = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[Nexus] WhatsApp error ${res.status}:`, JSON.stringify(data));
    } else {
      console.log(`[Nexus] WhatsApp sent → ${toWA} (sid: ${data.sid})`);
    }
  } catch (e) {
    console.error('[Nexus] WhatsApp send failed:', e.message);
  }
}

// ── Send WhatsApp to the platform owner (Ola) ──────────────────────────────
// Uses OWNER_PHONE env var (e.g. +2348012345678)
async function _notifyOwnerWhatsApp(message) {
  const ownerPhone = (process.env.OWNER_PHONE || '').trim();
  if (!ownerPhone) {
    console.warn('[Nexus] OWNER_PHONE not set — skipping WhatsApp owner notification');
    return;
  }
  return _sendWhatsAppDirect(ownerPhone, message);
}

// ── Monday ISO date helper ─────────────────────────────────────────────────
function _getMondayISO() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun,1=Mon,...
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

export const nexus = new Nexus();
export { _notifyOwnerWhatsApp };
