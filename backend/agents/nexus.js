/**
 * DigiFusion Intelligence Network — Nexus
 * =========================================
 * CEO & Operational Coordinator — reports directly to the principal (Boss)
 *
 * Nexus is the command layer of the agent network.
 * Every task, escalation, and knowledge gap flows through Nexus.
 *
 * Responsibilities:
 *   1. Task decomposition  — breaks instructions into discrete agent tasks
 *   2. Smart routing       — assigns work to the right agent, dispatches Orion for gaps
 *   3. Knowledge gap mgmt  — detects gaps, dispatches Orion → Synthesizer pipeline
 *   4. Escalation          — surfaces decisions and alerts directly to Boss
 *   5. Lifecycle bridge    — syncs client milestones to Notion
 *   6. Daily briefings     — morning + evening operational summaries for Boss
 *   7. Content cadence     — blog every 2–3 days via approval gate (never auto-publish)
 *   8. Workflow design     — AVE-aligned specs delegated to Nova
 *   9. Team chat           — direct line between Boss and the agent network
 */

import { AgentBase }      from './agentBase.js';
import { getSupabase }    from '../supabaseClient.js';
import { callAiProvider, resolveProvider } from '../aiPipeline.js';
import { notion }         from '../notionClient.js';
import { sendImmediate }  from '../skills/notifier.js';
import { createApprovalRequest }               from '../skills/approvalGate.js';
import { scoreResearchBrief, formatQualityBadge } from '../skills/researchQualityGate.js';
import { buildNexusCeoPromptBlock, resolveCeoModule, BLOG_CADENCE_DAYS } from '../skills/nexusCeoDoctrine.js';
import { scoreCeoOutput, formatCeoQualityBadge } from '../skills/ceoQualityGate.js';
import {
  buildOpsSnapshot,
  syncNotionCeoDashboard,
  processDueScheduledContent,
  checkContentCadence,
  loadOpsContext,
} from '../skills/nexusCeoOps.js';
import { runIpFactory } from '../skills/ipFactory.js';
import { buildClientBlueprint, listClientBlueprints, getClientBlueprint } from '../skills/clientBlueprint.js';
import { buildPillarClusterPlan, enqueueC2cCalendar, derivePlaybookTeasers } from '../skills/c2cGrowthEngine.js';
import {
  parseWorkflowSignals,
  createCampaignFromResearch,
  processDueOrchestrationSteps,
  listOrchestrationCampaigns,
} from '../skills/nexusOrchestrationPlan.js';
import { retuneOpenEngagements } from '../skills/engagementMonitor.js';
import { buildApprovalStatusReply } from '../skills/approvalStatus.js';
import {
  processBossApprovalMessage,
  isApprovalStatusQuery,
  isWhatsAppApprovalQuery,
  buildApprovalChannelGuidance,
  getNotionCapabilityReply,
} from '../skills/approvalActions.js';
import { findPendingApproval } from '../skills/approvalGate.js';

const CHAT_TIMEOUT_MS = Number(process.env.NEXUS_CHAT_TIMEOUT_MS || 25000);

function withChatTimeout(promise, label = 'chat') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out — backend or AI provider may be slow. Try again in a moment.`)), CHAT_TIMEOUT_MS),
    ),
  ]);
}

const NEXUS_SYSTEM = `You are Nexus — Digital CEO of the DigiFusion Intelligence Network.

You report directly to your principal (address them as "Boss" — never by name). You run a team of 7 specialist agents and are responsible for everything they produce.

YOUR TEAM:
— Orion (Researcher): live web intelligence via Perplexity/Tavily — dispatched first whenever current data is needed
— Synthesizer: internal knowledge engine — PDFs, knowledge base, proprietary frameworks
— Atlas: BD & deal strategy, Deal Engine, prospect intelligence
— Nova: AI automation, SaaS architecture, workflow engineering
— Aether: content, marketing, blog publishing, brand voice
— Pulse: analytics, monitoring, KPI alerts
— Assistant: client-facing VA, lead qualification, bookings

COMMUNICATION RULES — non-negotiable:
1. Be brief. Maximum 4 sentences for routine updates. Expand only when Boss asks.
2. Never use bullet-point status reports unprompted. Speak like a CEO, not a system log.
3. Address your principal as "Boss" — never by any name.
4. Lead with what matters. What's done, what's in motion, what needs a decision — in that order.
5. No filler phrases. No "I will ensure", "as per our operating principles", "it is important to note". Say it directly or don't say it.
6. When escalating, state the issue in one sentence and ask one specific question.

ESCALATION TRIGGERS:
— Client activates a project or books a session
— Agent fails 3+ times on the same task
— High-value lead (score ≥ 8)
— Task stuck >48h
— Strategic decision required

Tone: decisive, direct, confident. You are the most capable operator in the room.

HONESTY RULES — violation of these is a critical failure:
- You can ONLY confirm things that appear in the LIVE SYSTEM STATE block above your response.
- EXCEPTION: Boss approvals — if PENDING APPROVAL appears in LIVE SYSTEM STATE, tell Boss to type YES in this chat or use Command Center; WhatsApp replies are ingested via webhook when configured.
- EXCEPTION: Notion — if NOTION STATUS appears in LIVE SYSTEM STATE, describe those capabilities accurately.
- If a fact is not in LIVE SYSTEM STATE, say "I don't have visibility into that right now."
- NEVER say "I've confirmed X" unless X appears in the data passed to you.
- NEVER say "I've updated", "I've logged", "I've notified" unless code in this session actually ran those functions.
- "The task is moving forward as planned" is forbidden if you have no data proving it.
- When uncertain: be short and honest. "I can't verify that without checking" is always correct.

${buildNexusCeoPromptBlock()}`;

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
/** Chat + briefings must survive a pinned provider outage (e.g. Gemini billing). */
const CHAT_LLM_OPTS = { json: false, fallback: true };
const CEO_LLM_OPTS  = CHAT_LLM_OPTS;

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
      role:         'Digital CEO & Operational Commander',
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
    console.log(`[Nexus→Boss] ESCALATION [${severity.toUpperCase()}]: ${subject}`);

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
      summary:    `Escalated to Boss: ${subject}`,
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

  _isResearchIntent(instruction) {
    const lower = instruction.toLowerCase();
    const researchSignals = [
      'research', 'find out', 'investigate', 'look up', 'look into',
      'coordinate', 'cordinate', 'painpoint', 'pain point', 'playbook',
      'what is', 'what are', 'how does', 'how do', 'tell me about',
      'gather', 'compile', 'analyse', 'analyze', 'study', 'explore',
      'what do we know', 'intelligence on', 'intel on', 'data on',
      'market data', 'market research', 'competitive intel', 'background on',
      'deep dive', 'audit', 'scan', 'survey', 'review the', 'understand',
    ];
    return researchSignals.some(s => lower.includes(s));
  }

  /** IP Factory — verb "synthesize", not the Synthesizer agent name. */
  _isIpFactoryIntent(instruction) {
    if (/synthesizer can|synthesizer to|for synthesizer|save to knowledge/i.test(instruction)) return false;
    return /\b(synthesi[sz]e(?!r\b)|ip factory)\b.*\b(framework|playbook|blueprint|original ip)\b/i.test(instruction)
      || /\b(create|build|develop)\b.{0,30}\b(original|firm)\b.{0,20}\b(framework|playbook|blueprint|ip)\b/i.test(instruction);
  }

  /**
   * Background Orion research — avoids HTTP 502 on long Tavily/Firecrawl runs.
   */
  async _runOrionResearchJob(taskId, instruction, priority = 3) {
    const db = getSupabase();
    let brief = null;
    let researchMeta = {};

    try {
      const { researcher } = await import('./researcher.js');
      const result = await researcher.research({
        topic:       instruction,
        forAgent:    'nexus',
        depth:       'standard',
        mergeWithKB: true,
      });
      brief        = result?.brief || result?.summary || String(result || '');
      researchMeta = {
        sources:      result?.sources      || [],
        gaps:         result?.gaps         || [],
        coverStats:   result?.coverStats   || [],
        mergedWithKB: result?.mergedWithKB || false,
        depth:        result?.depth        || 'standard',
      };
    } catch (e) {
      console.error('[Nexus] Orion research failed:', e.message);
      if (db) {
        await db.from('tasks').update({
          status: 'failed', error: e.message, completed_at: new Date().toISOString(),
        }).eq('id', taskId);
      }
      return;
    }

    let qScore = scoreResearchBrief({ brief, ...researchMeta });
    console.log(`[Nexus] Research quality: ${qScore.grade} (${qScore.score}/100)`);

    if (!qScore.passed) {
      console.warn('[Nexus] Research quality too low — re-running Orion at deep depth');
      try {
        const { researcher } = await import('./researcher.js');
        const deepResult = await researcher.research({
          topic:       instruction,
          forAgent:    'nexus',
          depth:       'deep',
          mergeWithKB: true,
        });
        brief        = deepResult?.brief || brief;
        researchMeta = {
          sources:      deepResult?.sources      || researchMeta.sources,
          gaps:         deepResult?.gaps         || researchMeta.gaps,
          coverStats:   deepResult?.coverStats   || researchMeta.coverStats,
          mergedWithKB: deepResult?.mergedWithKB || researchMeta.mergedWithKB,
          depth:        'deep',
        };
        qScore = scoreResearchBrief({ brief, ...researchMeta });
      } catch (e) {
        console.error('[Nexus] Deep re-run failed:', e.message);
      }
    }

    const workflowSignals = parseWorkflowSignals(instruction);
    const nextSteps       = this._suggestNextSteps(brief, workflowSignals);

    let campaign = null;
    if (workflowSignals.autoWire) {
      try {
        campaign = await createCampaignFromResearch(this, {
          instruction,
          researchTaskId: taskId,
          brief,
          sources:        researchMeta.sources,
          priority,
          signals:        workflowSignals,
        });
        if (campaign?.campaignId) {
          processDueOrchestrationSteps(this).catch(e => {
            console.warn('[Nexus] Campaign step dispatch:', e.message);
          });
        }
      } catch (e) {
        console.error('[Nexus] Campaign wiring failed:', e.message);
      }
    }

    const { persistResearchDeliverable } = await import('../lib/researchDeliverables.js');
    await persistResearchDeliverable({
      taskId,
      instruction,
      brief,
      sources:      researchMeta.sources,
      gaps:         researchMeta.gaps,
      qualityScore: qScore,
      depth:        researchMeta.depth,
      forAgent:     'nexus',
      mergedWithKB: researchMeta.mergedWithKB,
      nextSteps,
      qualityBadge: formatQualityBadge(qScore),
      campaign,
      workflowSignals,
    });

    await this.rememberEpisodic({
      summary:    `Orion researched: "${instruction.slice(0, 80)}"`,
      content:    { instruction, brief: brief?.slice(0, 500), qualityScore: qScore.score, taskId },
      type:       'research',
      tags:       ['orion', 'research'],
      importance: 3,
    });

    console.log(`[Nexus] Orion research complete — task ${taskId}`);
  }

  // ── Route to the right agent after research ──────────────────────────────
  _suggestNextSteps(brief, workflowSignals = null) {
    const steps = [
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

    if (workflowSignals?.wantsContentCampaign) {
      steps.unshift({
        id:          'content_campaign',
        label:       'Run full content campaign (calendar + scheduled blogs)',
        agent:       'nexus',
        description: `Nexus queues ${workflowSignals.postCount} blog topics every ${workflowSignals.intervalDays} days — Boss approves each before publish.`,
      });
    }

    return steps;
  }

  async processOrchestrationCampaigns(opts = {}) {
    return processDueOrchestrationSteps(this, opts);
  }

  async listCampaigns(opts = {}) {
    return listOrchestrationCampaigns(opts);
  }

  async orchestrate(instruction, options = {}) {
    const { priority = 3, researchBrief = null, nextStep = null } = options;
    const db = getSupabase();

    // ── IP Factory: synthesize original framework from resource pool ─────────
    if (options.ipFactory || this._isIpFactoryIntent(instruction)) {
      const result = await runIpFactory({
        title:              options.title || instruction.slice(0, 120),
        domain:             options.domain || 'business_development',
        sources:            options.sources || [],
        instruction,
        promote:            options.promote ?? false,
        promoteAsOperating: options.promoteAsOperating ?? false,
        tagline:            options.tagline || '',
      });
      return { type: 'ip_factory_complete', ...result };
    }

    // ── Client Blueprint: multi-agent engagement pack for Boss ───────────────
    if (options.clientBlueprint || /client blueprint|engagement blueprint|action plan for client/i.test(instruction)) {
      const result = await buildClientBlueprint({
        clientName:   options.clientName,
        company:      options.company,
        industry:     options.industry || 'general',
        track:        options.track || 'integrated',
        goals:        options.goals || instruction,
        painPoints:   options.painPoints || '',
        budget:       options.budget,
        timeline:     options.timeline,
        leadId:       options.leadId,
        researchBrief: options.researchBrief || researchBrief,
      }, this);
      return { type: 'client_blueprint_ready', ...result };
    }

    // ── C2C Growth: pillar + cluster calendar ────────────────────────────────
    if (options.c2cPlan || /pillar.*cluster|c2c (plan|calendar)|content-to-capital plan/i.test(instruction)) {
      const plan = await buildPillarClusterPlan({
        pillarTopic: options.pillarTopic || instruction.slice(0, 120),
        sector:      options.sector || 'sme',
        audience:    options.audience,
      });
      const queued = options.enqueue !== false
        ? await enqueueC2cCalendar(plan)
        : { queued: 0 };
      return { type: 'c2c_plan_ready', plan, ...queued };
    }

    // ── PHASE 2: User has chosen what to do with research results ────────────
    if (researchBrief && nextStep) {
      console.log(`[Nexus] Phase 2 — routing research result to: ${nextStep}`);
      const stepMap = {
        blog:       { agent_id: 'aether',      title: 'Write blog article from Orion research',               type: 'content'  },
        bd_brief:   { agent_id: 'atlas',       title: 'Build BD strategy brief from Orion research',          type: 'analysis' },
        automation: { agent_id: 'nova',        title: 'Design automation solution from Orion research',       type: 'analysis' },
        report:          { agent_id: 'synthesizer', title: 'Build intelligence report from Orion research',        type: 'analysis' },
        save:            { agent_id: 'synthesizer', title: 'Save Orion research to knowledge base',                type: 'research' },
        content_campaign:{ agent_id: 'nexus',       title: 'Run content campaign from Orion research',             type: 'content'  },
        // legacy key kept for backward compat
        strategy:        { agent_id: 'atlas',       title: 'Create strategy brief from Orion research',            type: 'analysis' },
      };
      const step = stepMap[nextStep] || { agent_id: 'atlas', title: 'Act on Orion research findings', type: 'general' };

      if (nextStep === 'content_campaign') {
        const signals = parseWorkflowSignals(instruction);
        const campaign = await createCampaignFromResearch(this, {
          instruction,
          researchTaskId: null,
          brief:          researchBrief,
          priority,
          signals:        { ...signals, wantsSynthesizer: true, wantsContentCampaign: true, autoWire: true },
        });
        if (campaign?.campaignId) {
          await processDueOrchestrationSteps(this);
        }
        return {
          type:    'campaign_wired',
          campaign,
          message: campaign?.message || 'Content campaign queued. Steps run on schedule; check Activity journal.',
        };
      }

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
        // ── BOSS APPROVAL GATE ──────────────────────────────────────────────
        // Nexus NEVER publishes or saves a blog post without explicit Boss sign-off.
        // This step produces a draft outline + first paragraph for Boss to review.
        // Boss must confirm title, author name, tone, and content before Aether writes.
        try {
          const { aether } = await import('./aether.js');
          const outlinePrompt = `You are DigiFusion's senior content strategist. Using the research findings below, produce a blog post BRIEF for Boss approval — NOT the full article.

RESEARCH FINDINGS:
${researchBrief.slice(0, 3000)}

Return a JSON object with:
{
  "proposedTitle": "...",
  "metaDescription": "...",
  "hook": "Opening paragraph (2–3 sentences max)",
  "outline": ["H2 heading 1", "H2 heading 2", "H2 heading 3", "H2 heading 4"],
  "recommendedTone": "...",
  "recommendedAuthor": "...",
  "estimatedWordCount": 1400,
  "seoKeyword": "..."
}

No full article. Brief only.`;

          const rawBrief = await aether.chat(outlinePrompt);
          let brief = {};
          try {
            const jsonMatch = rawBrief.match(/\{[\s\S]*\}/);
            brief = jsonMatch ? JSON.parse(jsonMatch[0]) : { proposedTitle: instruction.slice(0, 80), outline: [], hook: rawBrief.slice(0, 300) };
          } catch { brief = { proposedTitle: instruction.slice(0, 80), hook: rawBrief.slice(0, 400), outline: [] }; }

          // ── Fire WhatsApp + save approval request ──────────────────────
          const approvalDetail = [
            `Aether drafted a blog brief from Orion's research.`,
            ``,
            `📌 *Proposed title:* ${brief.proposedTitle || instruction.slice(0, 80)}`,
            `✍️  *Recommended author:* ${brief.recommendedAuthor || 'Not specified'}`,
            `🎯 *Tone:* ${brief.recommendedTone || 'Not specified'}`,
            `📝 *Outline:*\n${(brief.outline || []).map((h, i) => `  ${i + 1}. ${h}`).join('\n')}`,
            ``,
            `*Hook:*\n${(brief.hook || '').slice(0, 280)}`,
          ].join('\n');

          const { approvalId, whatsappSent } = await createApprovalRequest({
            approvalType: 'blog_post',
            subject:      `Blog post approval — ${(brief.proposedTitle || instruction).slice(0, 60)}`,
            detail:       approvalDetail,
            payload: {
              topic:            instruction,
              proposedTitle:    brief.proposedTitle,
              outline:          brief.outline,
              recommendedTone:  brief.recommendedTone,
              recommendedAuthor: brief.recommendedAuthor || 'Boroji Adebayo-Hopewell, Founder',
              seoKeyword:       brief.seoKeyword,
              researchBrief:    researchBrief.slice(0, 3000),
              frameworkId:      'c2c',
              niche:            'digital_media',
            },
          });

          return {
            type:               'pending_boss_approval',
            stage:              'blog_brief',
            approvalId,
            whatsappSent,
            message:            `Approval request sent to Boss via WhatsApp. Waiting for sign-off before Aether writes anything. Nothing proceeds until Boss replies YES.`,
            proposedTitle:      brief.proposedTitle,
            hook:               brief.hook,
            outline:            brief.outline,
            recommendedTone:    brief.recommendedTone,
            recommendedAuthor:  brief.recommendedAuthor,
            seoKeyword:         brief.seoKeyword,
            estimatedWordCount: brief.estimatedWordCount,
            researchBrief:      researchBrief.slice(0, 800),
          };
        } catch (e) {
          console.error('[Nexus] Aether brief generation failed:', e.message);

          // Even if brief generation fails — still send WhatsApp and wait
          const { approvalId, whatsappSent } = await createApprovalRequest({
            approvalType: 'blog_post',
            subject:      `Blog post approval — ${instruction.slice(0, 60)}`,
            detail:       `Orion completed research on: "${instruction.slice(0, 120)}"\n\nAether is ready to write the blog post. Please confirm:\n• Author name\n• Any specific angles to include or avoid\n• Tone preference`,
            payload: {
              topic:        instruction,
              researchBrief: researchBrief.slice(0, 3000),
            },
          });

          return {
            type:          'pending_boss_approval',
            stage:         'blog_brief',
            approvalId,
            whatsappSent,
            message:       `Approval request sent to Boss via WhatsApp. Waiting for confirmation before proceeding.`,
            researchBrief: researchBrief.slice(0, 800),
          };
        }
      }

      return {
        type:    'task_queued',
        agent:   step.agent_id,
        message: `${step.agent_id.charAt(0).toUpperCase() + step.agent_id.slice(1)} has been briefed and the task is queued. Check the Tasks tab to monitor progress.`,
      };
    }

    // ── PHASE 1A: Pure research intent — dispatch Orion asynchronously ─────
    // Research can exceed Render's 30s proxy timeout; return taskId immediately.
    if (this._isResearchIntent(instruction)) {
      console.log(`[Nexus] Research intent detected — dispatching Orion (async)`);
      const db2 = getSupabase();
      let taskId = null;

      if (db2) {
        const { data: taskRow, error: taskErr } = await db2.from('tasks').insert({
          title:       `[Orion] Research: ${instruction.slice(0, 80)}`,
          description: instruction,
          agent_id:    'researcher',
          created_by:  'nexus',
          status:      'in_progress',
          priority,
          type:        'research',
        }).select('id').single();
        if (taskErr) console.warn('[Nexus] Research task insert failed:', taskErr.message);
        taskId = taskRow?.id || null;
      }

      if (taskId) {
        this._runOrionResearchJob(taskId, instruction, priority).catch(e => {
          console.error('[Nexus] Background Orion job failed:', e.message);
        });
      }

      return {
        type:    'research_started',
        taskId,
        agent:   'orion',
        message: 'Orion research started. This may take 1–3 minutes — polling for results.',
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
      const raw = await callAiProvider(resolveProvider(), decompositionPrompt, this.systemPrompt, { fallback: true });
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
    const ops    = await buildOpsSnapshot();
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

    const briefingPrompt = `You are Nexus, Digital CEO. Generate the MORNING operational briefing for Boss.

TODAY: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

CEO OPS:
— Blog cadence: ${ops.blogCadenceDays} days | Last publish: ${ops.daysSinceLastBlog ?? 'unknown'} days ago | Due: ${ops.cadenceDue ? 'YES — action needed' : 'on track'}
— Pending Boss approvals: ${ops.pendingApprovals}
— Stuck tasks (>48h): ${ops.stuckTasks}
— Content queue: ${ops.contentSchedule.queued} queued, ${ops.contentSchedule.pending} pending approval

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

Write a direct morning CEO briefing: lead with today's top priority, then pipeline pulse, approvals needed, content cadence, one focus line per active agent. Max 6 sentences unless Boss asked for detail. Apply Minto Pyramid — recommendation first.`;

    const [briefingRaw, escalations] = await Promise.all([
      callAiProvider(resolveProvider(), briefingPrompt, this.systemPrompt, CEO_LLM_OPTS),
      this.checkEscalationTriggers().catch(() => []),
    ]);

    let briefing = briefingRaw;
    const quality = scoreCeoOutput({ text: briefing, outputType: 'briefing' });
    if (!quality.passed) {
      const rewrite = await callAiProvider(resolveProvider(),
        `Rewrite this CEO briefing to pass quality gate. Lead with recommendation. Remove platitudes. Reference firm IP where relevant.\n\n${briefing}`,
        this.systemPrompt, CEO_LLM_OPTS);
      briefing = rewrite;
    }

    await syncNotionCeoDashboard({ period: 'morning', briefingExcerpt: briefing, snap: ops }).catch((e) => {
      console.warn('[Nexus CEO] Notion/R2 ops sync failed (briefing still returned):', e.message);
    });

    return {
      briefing,
      summary:     briefing.slice(0, 500),
      quality,
      ops,
      escalations,
      period:      'morning',
      generatedAt: new Date().toISOString(),
    };
  }

  /** Evening CEO briefing — what shipped, what's blocked, tomorrow's focus */
  async generateEveningBriefing() {
    const status = await this.getNetworkStatus();
    const ops    = await buildOpsSnapshot();
    const db     = getSupabase();

    let completedToday = [];
    if (db) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await db.from('tasks')
        .select('title, agent_id, completed_at')
        .eq('status', 'completed')
        .gte('completed_at', start.toISOString())
        .order('completed_at', { ascending: false })
        .limit(12);
      completedToday = data || [];
    }

    const prompt = `You are Nexus, Digital CEO. Generate the EVENING wrap-up for Boss.

TODAY: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}

SHIPPED TODAY (${completedToday.length}):
${completedToday.map(t => `- ${t.title} [${t.agent_id}]`).join('\n') || 'Nothing marked complete today'}

STILL ACTIVE (${status.activeTasks.length}):
${status.activeTasks.slice(0, 6).map(t => `- ${t.title} → ${t.agent_id}`).join('\n') || 'Clear'}

CEO OPS:
— Blog cadence due: ${ops.cadenceDue}
— Pending approvals: ${ops.pendingApprovals}
— Stuck >48h: ${ops.stuckTasks}

Cover: what shipped, what's blocked, tomorrow's top 3 priorities, content/blog status. Max 5 sentences. Recommendation first.`;

    let briefing = await callAiProvider(resolveProvider(), prompt, this.systemPrompt, CEO_LLM_OPTS);
    const quality = scoreCeoOutput({ text: briefing, outputType: 'briefing' });

    await syncNotionCeoDashboard({ period: 'evening', briefingExcerpt: briefing, snap: ops }).catch((e) => {
      console.warn('[Nexus CEO] Notion/R2 ops sync failed (briefing still returned):', e.message);
    });

    return {
      briefing,
      summary:     briefing.slice(0, 500),
      quality,
      ops,
      period:      'evening',
      generatedAt: new Date().toISOString(),
    };
  }

  /** Live CEO ops dashboard for API / UI */
  async getCeoOpsStatus() {
    const [ops, ctx, status] = await Promise.all([
      buildOpsSnapshot(),
      loadOpsContext(),
      this.getNetworkStatus(),
    ]);
    return {
      role:            'Digital CEO',
      blogCadenceDays: BLOG_CADENCE_DAYS,
      ops,
      context:         ctx,
      agentSummary:    status.agents?.map(a => ({ id: a.id, status: a.status })) || [],
      activeTaskCount: status.activeTasks?.length || 0,
      generatedAt:     new Date().toISOString(),
    };
  }

  /**
   * Design/analyze a workflow — Engagement Model Phase 01 + AVE → Nova
   */
  async designWorkflow({ processDescription, clientName = 'Internal', industry = 'general' } = {}) {
    if (!processDescription) throw new Error('processDescription is required');

    const ceoModule = resolveCeoModule(processDescription);
    const designPrompt = `You are Nexus Digital CEO. Design a workflow specification using DigiFusion firm IP only.

PROCESS: ${processDescription}
CLIENT: ${clientName} | INDUSTRY: ${industry}
PRIMARY FRAMEWORK: ${ceoModule.framework} → delegate execution to ${ceoModule.agent}

Deliver:
1. Engagement Model phase this sits in
2. As-is bottleneck map (manual touchpoints, cost of inaction estimate)
3. Target state — AVE phases if automation, Deal Engine if BD, C2C if content
4. Integration map: source of truth DB, triggers, error/dead-letter path, human-in-the-loop nodes (Boss approval only)
5. 2-week sprint outline with acceptance criteria

No generic TOGAF/SAP language. Use DigiFusion framework names.`;

    let spec = await this.runLLM(designPrompt, { knowledgeQuery: processDescription });
    const quality = scoreCeoOutput({ text: spec, outputType: 'workflow' });

    await notion.logTask({
      agentId:   'nexus',
      agentName: 'Nexus (Digital CEO)',
      taskTitle: `Workflow design: ${processDescription.slice(0, 80)}`,
      taskType:  'workflow_design',
      outcome:   quality.passed ? 'complete' : 'needs_revision',
      notes:     `${formatCeoQualityBadge(quality)}\n\n${spec.slice(0, 1500)}`,
    }).catch(() => {});

    const db = getSupabase();
    if (db) {
      await db.from('tasks').insert({
        title:       `[Nova] Implement workflow: ${processDescription.slice(0, 60)}`,
        description: spec.slice(0, 4000),
        agent_id:    'nova',
        created_by:  'nexus',
        status:      'pending',
        priority:    3,
        type:        'analysis',
        input:       JSON.stringify({ workflowSpec: spec, framework: 'ave' }),
      }).catch(() => {});
    }

    return { spec, quality, delegatedTo: 'nova', framework: ceoModule.framework };
  }

  async processDueScheduledContent() {
    return processDueScheduledContent(this);
  }

  async runContentCadenceCheck() {
    return checkContentCadence(this);
  }

  async syncCeoNotionDashboard(period = 'manual') {
    const ops = await buildOpsSnapshot();
    return syncNotionCeoDashboard({ period, snap: ops });
  }

  /** IP Factory — synthesize + optionally promote to agent DNA */
  async runIpSynthesis(input = {}) {
    return runIpFactory(input);
  }

  /** Client Blueprint — Orion + Atlas/Nova/Aether → Boss implementation pack */
  async createClientBlueprint(input = {}) {
    return buildClientBlueprint(input, this);
  }

  async listClientBlueprints() {
    return listClientBlueprints();
  }

  async getClientBlueprint(id) {
    return getClientBlueprint(id);
  }

  /** C2C Growth — pillar/cluster plan + editorial queue */
  async planC2cGrowth(input = {}) {
    const plan = await buildPillarClusterPlan(input);
    const queued = input.enqueue !== false ? await enqueueC2cCalendar(plan) : { queued: 0 };
    let leadMagnet = null;
    try {
      const { createLeadMagnetFromPlan } = await import('../skills/leadMagnetFunnel.js');
      leadMagnet = await createLeadMagnetFromPlan(plan);
    } catch (e) {
      console.warn('[Nexus] Lead magnet creation skipped:', e.message);
    }
    return { plan, leadMagnet, ...queued };
  }

  async derivePlaybookBlogTeasers(playbookSlug, count = 3) {
    return derivePlaybookTeasers(playbookSlug, count);
  }

  /** Engagement retune — Pulse cron calls this weekly */
  async retuneEngagements() {
    return retuneOpenEngagements(this);
  }

  /** Session reminders for booked strategy sessions (Pulse sweep hook) */
  async sendSessionReminders() {
    const db = getSupabase();
    if (!db) return { sent: 0 };

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);

    let bookings = [];
    try {
      const res = await db.from('bookings')
        .select('id, client_name, scheduled_at, status')
        .eq('status', 'confirmed')
        .gte('scheduled_at', tomorrow.toISOString())
        .lte('scheduled_at', dayAfter.toISOString())
        .limit(5);
      bookings = res.data || [];
    } catch {
      bookings = [];
    }

    if (!bookings.length) return { sent: 0 };

    for (const b of bookings) {
      await this.notify(
        'Strategy session reminder',
        `${b.client_name || 'Client'} session tomorrow. Prep brief is in Notion.`,
        'info',
        'dashboard',
      ).catch(() => {});
    }
    return { sent: bookings.length };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHAT — overrides agentBase.chat() to execute real actions, not just talk
  // ══════════════════════════════════════════════════════════════════════════

  async chat(message, history = []) {
    const lower = message.toLowerCase();

    // ── ACTION: Workflow design ────────────────────────────────────────────
    if (/design workflow|analyze workflow|structure workflow|workflow spec|map process/.test(lower)) {
      try {
        const result = await this.designWorkflow({ processDescription: message });
        return `Boss, workflow spec drafted (${result.quality.grade} quality). Logged to Notion and Nova has a build task queued.\n\n${result.spec.slice(0, 1200)}${result.spec.length > 1200 ? '…' : ''}`;
      } catch (e) {
        return `Workflow design failed — ${e.message}`;
      }
    }

    // ── ACTION: Client blueprint ───────────────────────────────────────────
    if (/client blueprint|build blueprint for|engagement plan for/.test(lower)) {
      try {
        const result = await this.createClientBlueprint({
          clientName: message.replace(/client blueprint|build blueprint for|engagement plan for/gi, '').trim().slice(0, 80) || 'Client',
          goals:      message,
        });
        const bp = result.blueprint;
        return `Boss, client blueprint ready (${result.quality?.grade || 'B'}). ID: ${result.blueprintId}\n\nPhase: ${bp.engagement?.current_phase}\nBoss tasks:\n${(bp.bossTasks || []).slice(0, 4).map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
      } catch (e) {
        return `Blueprint failed — ${e.message}`;
      }
    }

    // ── ACTION: IP synthesis ───────────────────────────────────────────────
    if (/synthesi[sz]e (framework|playbook|ip)|ip factory/i.test(lower)) {
      try {
        const title = message.replace(/synthesi[sz]e|framework|playbook|ip factory/gi, '').trim() || 'New Framework';
        const result = await this.runIpSynthesis({ title, instruction: message, domain: 'business_development' });
        return `IP crystallized via GEM Lattice, Boss. Slug: ${result.slug} | IPMS ${result.ipms} | tier: ${result.tier}. ${result.promotion ? 'Encoded into agent DNA.' : 'Stored in firm knowledge base.'}`;
      } catch (e) {
        return `IP synthesis failed — ${e.message}`;
      }
    }

    // ── ACTION: C2C pillar plan ────────────────────────────────────────────
    if (/c2c plan|pillar plan|content calendar/i.test(lower)) {
      try {
        const topic = message.replace(/c2c plan|pillar plan|content calendar/gi, '').trim() || 'AI automation for SMEs';
        const result = await this.planC2cGrowth({ pillarTopic: topic });
        return `C2C plan queued, Boss. Pillar: "${result.plan?.pillar?.title}". ${result.queued || 0} items in editorial calendar (approval path).`;
      } catch (e) {
        return `C2C plan failed — ${e.message}`;
      }
    }

    // ── ACTION: Boss YES/NO on pending approval (chat + WhatsApp parity) ───
    try {
      const approvalResult = await processBossApprovalMessage(message);
      if (approvalResult.handled && approvalResult.reply) {
        return approvalResult.reply;
      }
    } catch (e) {
      console.warn('[Nexus] Approval message handling failed:', e.message);
    }

    // ── ACTION: WhatsApp / approval channel guidance (fast — no LLM) ───────
    if (isWhatsAppApprovalQuery(message) || (isApprovalStatusQuery(message) && /whatsapp|got it|got my|via wa/i.test(lower))) {
      try {
        return await buildApprovalChannelGuidance(/notion/i.test(lower));
      } catch (e) {
        return `I could not read approval status right now: ${e.message}. Type YES here to approve, or use Command → Approve & Publish.`;
      }
    }

    // ── ACTION: Notion capability (fast — no LLM) ─────────────────────────
    if (/notion/.test(lower) && /access|operate|work within|can you|do you|integrat/i.test(lower) && !/log|sync|add/i.test(lower)) {
      return getNotionCapabilityReply();
    }

    // ── ACTION: Approval status query (fast — no LLM) ─────────────────────
    if (isApprovalStatusQuery(message)) {
      try {
        return await buildApprovalStatusReply();
      } catch (e) {
        return `I could not read approval status right now: ${e.message}. Check Network → Command for pending approvals.`;
      }
    }

    // ── ACTION: CEO ops snapshot ───────────────────────────────────────────
    if (/ceo ops|ceo status|cadence status|content cadence/.test(lower)) {
      const ops = await this.getCeoOpsStatus();
      const o = ops.ops;
      return `CEO ops, Boss: Blog last ${o.daysSinceLastBlog ?? '?'}d ago (cadence ${o.blogCadenceDays}d, due: ${o.cadenceDue ? 'yes' : 'no'}). Pending approvals: ${o.pendingApprovals}. Stuck tasks: ${o.stuckTasks}. Queue: ${o.contentSchedule.queued} queued, ${o.contentSchedule.pending} awaiting your YES.`;
    }

    // ── ACTION: Evening briefing on demand ─────────────────────────────────
    if (/evening briefing|end of day|eod briefing|wrap up today/.test(lower)) {
      const { briefing, quality } = await this.generateEveningBriefing();
      return `${formatCeoQualityBadge(quality)}\n\n${briefing}`;
    }

    // ── ACTION: Sync Notion CEO dashboard ──────────────────────────────────
    if (/sync notion|notion dashboard|update notion/.test(lower)) {
      await this.syncCeoNotionDashboard('manual');
      return 'Notion CEO dashboard synced, Boss.';
    }

    // ── ACTION: Log to Notion ──────────────────────────────────────────────
    // Detects "log [X] to notion", "add [X] to notion", "log meeting"
    const notionLogMatch = lower.match(/log (.+?) (?:to|into|in) notion/i) ||
                           lower.match(/add (.+?) to notion/i) ||
                           (lower.includes('log') && lower.includes('notion')) ||
                           (lower.includes('meeting') && lower.includes('notion'));
    if (notionLogMatch) {
      try {
        const subject = typeof notionLogMatch === 'object' && notionLogMatch[1]
          ? notionLogMatch[1]
          : message.replace(/log|to notion|into notion|in notion/gi, '').trim() || message;
        await notion.logTask({
          agentId:   'nexus',
          agentName: 'Nexus',
          taskTitle: subject.slice(0, 200),
          taskType:  'manual_log',
          outcome:   'logged',
          notes:     `Logged via Boss chat at ${new Date().toLocaleString()}. Original message: "${message}"`,
        });
        return `Done, Boss. "${subject.slice(0, 80)}" is now logged in Notion.`;
      } catch (e) {
        return `Notion log failed — ${e.message}. Check your NOTION_TASKS_DB_ID env var on Render.`;
      }
    }

    // ── ACTION: Task status / network status ──────────────────────────────
    if (lower.includes('task log') || lower.includes('task status') ||
        lower.includes('what tasks') || lower.includes('task history')) {
      const db = getSupabase();
      if (db) {
        const { data } = await db.from('tasks')
          .select('title, agent_id, status, created_at')
          .order('created_at', { ascending: false })
          .limit(5);
        if (data?.length) {
          const summary = data.map(t =>
            `• ${t.title?.slice(0, 60)} — ${t.agent_id} [${t.status}]`
          ).join('\n');
          return `Last 5 tasks, Boss:\n\n${summary}`;
        }
      }
    }

    // ── ACTION: Pipeline / leads ───────────────────────────────────────────
    if (lower.includes('pipeline') || lower.includes('leads') || lower.includes('how many leads')) {
      const view = await this.getPipelineView().catch(() => null);
      if (view && !view.error) {
        return `Pipeline: ${view.totalLeads} leads across ${Object.keys(view.pipeline).length} stages. Top stage: ${Object.entries(view.pipeline).sort((a,b) => b[1].length - a[1].length)[0]?.[0] || 'none'}.`;
      }
    }

    // ── DEFAULT: LLM chat with grounded context ────────────────────────────
    // Fetch live context to ground the response so Nexus doesn't hallucinate
    const db = getSupabase();
    let liveContext = '';
    if (db) {
      const { buildClient360Snapshot } = await import('../skills/client360.js');
      const { computeCurrentUtilization } = await import('../skills/utilization.js');
      const [tasksRes, leadsRes, pendingApproval, clientSnap, util] = await Promise.all([
        db.from('tasks').select('title, agent_id, status').order('created_at', { ascending: false }).limit(5),
        db.from('leads').select('name, status, score').order('created_at', { ascending: false }).limit(3),
        findPendingApproval(),
        buildClient360Snapshot().catch(() => ''),
        computeCurrentUtilization().catch(() => null),
      ]);
      const tasks = tasksRes.data || [];
      const leads = leadsRes.data || [];
      if (tasks.length) liveContext += `\nRECENT TASKS:\n${tasks.map(t => `- ${t.title?.slice(0,60)} (${t.agent_id}, ${t.status})`).join('\n')}`;
      if (leads.length) liveContext += `\nRECENT LEADS:\n${leads.map(l => `- ${l.name || 'Unknown'} [${l.status}, score ${l.lead_score}]`).join('\n')}`;
      if (pendingApproval) {
        const inp = typeof pendingApproval.input === 'string' ? JSON.parse(pendingApproval.input) : (pendingApproval.input || {});
        liveContext += `\nPENDING APPROVAL: ${inp.subject || pendingApproval.title} (ref ${String(pendingApproval.id).slice(0, 8)}). Boss can type YES in this chat to publish.`;
      } else {
        liveContext += '\nPENDING APPROVAL: none';
      }
      const notionOk = !!(process.env.NOTION_API_KEY && process.env.NOTION_TASKS_DB_ID);
      liveContext += `\nNOTION STATUS: ${notionOk ? 'connected (log tasks, sync CEO dashboard)' : 'not configured'}`;
      liveContext += '\nBOSS APPROVAL CHANNELS: Nexus chat YES, WhatsApp webhook, Command Center Approve button';
      if (clientSnap) liveContext += clientSnap;
      if (util) liveContext += `\nUTILIZATION: ${util.utilizationPct}%${util.alert ? ' — PAUSE NEW INTAKE' : ''}`;
    }

    const episodic = await this.recallEpisodic(3).catch(() => '');
    const historyBlock = history.slice(-6).map(t =>
      `${t.role === 'user' ? 'Boss' : 'Nexus'}: ${t.content}`
    ).join('\n');

    const fullPrompt = [
      liveContext ? `LIVE SYSTEM STATE:${liveContext}` : '',
      episodic,
      historyBlock ? `CONVERSATION:\n${historyBlock}` : '',
      `Boss: ${message}`,
    ].filter(Boolean).join('\n\n');

    // Hard honesty enforcement: the LLM can ONLY assert facts visible in LIVE SYSTEM STATE above
    const chatSystem = this.systemPrompt +
      '\n\nYOU CAN ONLY CONFIRM FACTS VISIBLE IN THE LIVE SYSTEM STATE BLOCK ABOVE.' +
      ' If PENDING APPROVAL is listed, tell Boss to type YES in this chat (not only WhatsApp). If Boss asks about WhatsApp, explain replies are ingested via webhook — check whether approval is still pending in LIVE SYSTEM STATE.' +
      ' If something is NOT in that block, say "I do not have visibility into that right now." Never say "I have confirmed", "I have logged", "I have updated", or "the project is on track" unless the data above proves it.' +
      ' Be short. Be honest. Wrong but confident is worse than uncertain and honest.';

    const provider = resolveProvider();
    if (!provider) {
      return 'Boss, no AI provider is configured on the server (check DEEPSEEK_API_KEY or GROQ_API_KEY in Render env). I can still answer approval/status questions — try "approval status".';
    }

    const reply = await withChatTimeout(
      callAiProvider(provider, fullPrompt, chatSystem, CHAT_LLM_OPTS),
      'Nexus chat',
    );

    this.rememberEpisodic({
      summary:    `Boss chat: "${message.slice(0, 80)}"`,
      content:    { message, reply: reply.slice(0, 400) },
      type:       'observation', tags: ['chat'], importance: 2,
    }).catch(() => {});

    return reply;
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

    return callAiProvider(resolveProvider(), reportPrompt, this.systemPrompt, CHAT_LLM_OPTS);
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
      case 'design_workflow':
        return this.designWorkflow(payload);
      case 'content_cadence_check':
        return this.runContentCadenceCheck();
      case 'process_scheduled_content':
        return this.processDueScheduledContent();
      case 'process_orchestration':
        return this.processOrchestrationCampaigns(payload);
      case 'ceo_ops':
        return this.getCeoOpsStatus();
      case 'evening_briefing':
        return this.generateEveningBriefing();
      case 'sync_notion_ceo':
        return this.syncCeoNotionDashboard(payload?.period || 'manual');
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
- scheduledFor: ISO date string, spaced every ${BLOG_CADENCE_DAYS} days starting tomorrow (blog cadence — Boss approves before publish)
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
    const fresh = ideas.map((a, i) => {
      const d = new Date();
      d.setDate(d.getDate() + 1 + i * BLOG_CADENCE_DAYS);
      return {
        ...a,
        topic:        a.headline || a.topic,
        status:       'queued',
        scheduledFor: a.scheduledFor || d.toISOString(),
      };
    });
    await putJsonCache('cache/content-schedule.json', [...fresh, ...existing].slice(0, 20));

    return { calendar: fresh, totalQueued: fresh.length + existing.length };
  }

  // Researcher -> Aether pipeline — approval gate only (never direct publish)
  async publishSectorArticle({ sector, topic, angle }) {
    if (!topic) throw new Error('topic is required');

    const research = await this.dispatchResearch({
      topic, forAgent: 'aether',
      focusAreas: [sector].filter(Boolean),
      depth: 'standard',
    });

    if (!research?.brief) {
      return { topic, sector, error: 'Research failed — no brief produced' };
    }

    const orch = await this.orchestrate(topic, {
      researchBrief: research.brief,
      nextStep:      'blog',
      priority:      4,
    });

    return {
      topic,
      sector,
      type:       orch.type,
      approvalId: orch.approvalId,
      message:    orch.type === 'pending_boss_approval'
        ? `Blog brief sent for Boss approval via WhatsApp. Nothing publishes until you reply YES.`
        : orch.message || 'Pipeline completed',
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
      const raw = await callAiProvider(resolveProvider(), prompt, this.systemPrompt, { fallback: true });
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

  async scheduleReminders() {
    const db = getSupabase();
    if (!db) return;
    const cutoff = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const start  = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: bookings } = await db.from('service_bookings')
      .select('*').eq('status', 'confirmed')
      .gte('booking_time', start).lte('booking_time', cutoff);
    for (const booking of (bookings || [])) {
      if (booking.reminder_sent) continue;
      const timeStr = new Date(booking.booking_time).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
      });
      const msg = 'Reminder: Strategy session in 15 min at ' + timeStr + ' with ' + (booking.client_name || 'a client') + '.';
      await _sendWhatsAppDirect(process.env.OWNER_PHONE || '', msg).catch(() => {});
      await db.from('service_bookings').update({ reminder_sent: true }).eq('id', booking.id);
    }
  }

}

export const nexus = new Nexus();

async function _sendWhatsAppDirect(to, message) {
  const sid   = (process.env.TWILIO_ACCOUNT_SID  || '').trim();
  const token = (process.env.TWILIO_AUTH_TOKEN    || '').trim();
  const from  = (process.env.TWILIO_WHATSAPP_FROM || '').trim();
  if (!sid || !token || !from || !to) return;
  const fromWA = from.startsWith('whatsapp:') ? from : 'whatsapp:' + from;
  const toWA   = to.startsWith('whatsapp:')   ? to   : 'whatsapp:' + to;
  try {
    const params = new URLSearchParams({ From: fromWA, To: toWA, Body: message });
    const res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'),
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) console.error('[Nexus] WhatsApp error ' + res.status, JSON.stringify(data));
    else console.log('[Nexus] WhatsApp sent -> ' + toWA);
  } catch (e) { console.error('[Nexus] WhatsApp send failed:', e.message); }
}

async function _notifyOwnerWhatsApp(message) {
  const ownerPhone = (process.env.OWNER_PHONE || '').trim();
  if (!ownerPhone) { console.warn('[Nexus] OWNER_PHONE not set'); return; }
  return _sendWhatsAppDirect(ownerPhone, message);
}

function _getMondayISO() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(now.setDate(diff));
  return mon.toISOString().slice(0, 10);
}

export { _notifyOwnerWhatsApp };
