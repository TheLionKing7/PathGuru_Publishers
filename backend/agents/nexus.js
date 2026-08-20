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
import { callAiProvider, resolveProvider } from '../aiProviders.js';
import { notion }         from '../notionClient.js';
import { sendImmediate }  from '../skills/notifier.js';
import { isPaused }       from '../skills/systemFlags.js';

// ── HARNESS: Phase 1 instrumentation ────────────────────────────────────────
import { generateRunId, writeTrace, hashContent } from '../harness/trace.js';
import { verifyStep, assertChainLength, MAX_UNVERIFIED_STEPS } from '../harness/verify.js';
import { createBudget, consumeBudget, BudgetExceededError } from '../harness/budget.js';
import { checkPermission } from '../harness/perimeter.js';
import { createApprovalRequest }               from '../skills/approvalGate.js';
import { scoreResearchBrief, formatQualityBadge, notifyFailedResearchBrief } from '../skills/researchQualityGate.js';
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
import {
  isWhatsAppOutboundRequest,
  extractOutboundWhatsAppBody,
} from '../skills/whatsappChatIntents.js';
import { findPendingApproval } from '../skills/approvalGate.js';
import {
  isResearchStatusQuery,
  buildResearchStatusReply,
  buildResearchPipelineBlock,
} from '../skills/nexusResearchOps.js';
import {
  parseNotionLogIntent,
  formatNotionLogReply,
  formatWorkflowDesignReply,
  buildHonestyEnforcementBlock,
  isNotionConfigured,
} from '../skills/truthGuard.js';
import { runTaskHygiene } from '../skills/taskHygiene.js';
import { finalizeEmailDraft } from '../skills/emailReplyDraft.js';
import {
  CLASSIFICATION_CATEGORIES,
  shouldDraft,
  countWords,
  MAX_FIRST_TOUCH_WORDS,
  enforceWordCap,
  findUngroundedClaims,
  loadCapabilityCorpus,
  buildClassificationPrompt,
  buildDraftPrompt,
} from '../skills/inboundEmailPipeline.js';

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
— Orion (Researcher): live web intelligence via Tavily + Firecrawl — dispatched first whenever current data is needed
— Synthesizer: internal knowledge engine — PDFs, knowledge base, proprietary frameworks
— Atlas: Business Developer & Strategist — Deal Engine, Dream 50, pipeline intelligence
— Nova: AI automation, SaaS architecture, workflow engineering
— Aether: Copywriter & Marketing Specialist — Baldwin author IP (Digital Ads Playbook, Stop Buying Ads) + C2C; blog secondary
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

// Identity-free system prompt for outbound email drafting. The reply is sent by a
// human after approval, so the model must never sign as an agent or name the
// network or any internal system — the signature is appended by the system.
const EMAIL_DRAFT_SYSTEM = `You draft concise, professional email replies on behalf of a firm.
Write in the first person as the firm's representative. Never mention any AI agent, internal system, or internal team name. Never write a closing signature, sign-off block, name, or title — the signature is appended separately by the system after generation.`;

// Identity-free system prompt for the external surface. The boundary is
// structural, not prompt wording: callers pass surface:'external' and this
// replaces the internal prompt entirely — no agent names, vendors, pricing,
// methodology, or client names can leak.
const NEXUS_EXTERNAL_SYSTEM = `You are a concise, professional assistant acting on behalf of a firm.
Write in the first person as the firm's representative. Never mention AI agents, internal systems, internal team names, vendors, pricing, methodology, or client names. Be direct and brief.`;

const CLASSIFY_SYSTEM = `You are an email triage assistant. Classify an inbound email into exactly one category and extract structured facts. Return strict JSON only — no markdown fences, no commentary. Never invent facts; leave fields empty when absent.`;

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

    // For warning/critical — send immediately without waiting for Pulse sweep.
    // Slack first, WhatsApp fallback (high-priority only).
    if (severity === 'warning' || severity === 'critical') {
      sendImmediate(subject, body, 'whatsapp', severity).catch(e =>
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

  /**
   * Call the configured LLM with automatic provider fallback.
   * Thin wrapper over callAiProvider so call sites don't repeat the
   * resolveProvider() + fallback boilerplate.
   */
  async _callWithFallback(prompt) {
    return callAiProvider(resolveProvider(), prompt, this.systemPrompt, { fallback: true });
  }

  /**
   * Parse a model response that should be a JSON array, tolerating the common
   * failure modes: a top-level array, an object wrapping the array
   * (e.g. {"tasks":[...]}), or markdown/commentary around the array.
   */
  _parseJsonArray(text) {
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      // Some models wrap the array in an object: {"units":[...]}
      if (val && typeof val === 'object') {
        const found = Object.values(val).find((v) => Array.isArray(v));
        if (found) return found;
      }
      return null;
    };
    // Try direct parse first
    try {
      const val = JSON.parse(text);
      const arr = toArray(val);
      if (arr) return arr;
    } catch { /* fall through to bracket extraction */ }
    // Find the first [...] block in the response
    const match = String(text ?? '').match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const val = JSON.parse(match[0]);
      return toArray(val) || [];
    } catch { return []; }
  }

  /**
   * Stage 1 — classify + extract. One call decides a single category and extracts
   * structured facts (sender, organisation, stated need, timeline, budget, referral).
   */
  async classifyInboundEmail(payload) {
    const prompt = buildClassificationPrompt(payload, loadCapabilityCorpus());

    const raw = await callAiProvider(resolveProvider(), prompt, CLASSIFY_SYSTEM, { json: true, fallback: true });
    let parsed = {};
    try {
      const match = String(raw || '').match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    } catch { parsed = {}; }

    const category = CLASSIFICATION_CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
    const e = parsed.extracted && typeof parsed.extracted === 'object' ? parsed.extracted : {};
    const extracted = {
      senderName:     String(e.senderName || '').trim(),
      organisation:   String(e.organisation || '').trim(),
      statedNeed:     String(e.statedNeed || '').trim(),
      timelineSignal: String(e.timelineSignal || '').trim(),
      budgetSignal:   String(e.budgetSignal || '').trim(),
      referralSource: String(e.referralSource || '').trim(),
    };

    return { category, extracted };
  }

  /**
   * Stage 2 + 3 — grounded composition + fixed shape. Grounds the draft in the
   * capability corpus, enforces the first-touch word cap (regenerating once), and
   * runs the ungrounded-claim check. Never sends; the signature is appended later.
   */
  async draftEmailReply(payload, extracted, category) {
    const corpus = loadCapabilityCorpus();
    const prompt = buildDraftPrompt(payload, extracted, corpus, category);

    const generate = async (extra) => {
      const p = extra ? `${prompt}\n\n${extra}` : prompt;
      const raw = await callAiProvider(resolveProvider(), p, EMAIL_DRAFT_SYSTEM, { json: true, fallback: true });
      let parsed = {};
      try {
        const match = String(raw || '').match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
      } catch { parsed = {}; }
      return {
        draftSubject: parsed.draftSubject || `Re: ${String(payload.subject || '').trim()}`,
        draftBody:    parsed.draftBody || null,
      };
    };

    const first = await generate();

    // Stage 3 — hard ceiling 120 words: regenerate once, then flag.
    const { draftBody, regenerated, flagged } = await enforceWordCap(first.draftBody, async () => {
      const retry = await generate(`Your previous draft was ${countWords(first.draftBody)} words. Rewrite it under ${MAX_FIRST_TOUCH_WORDS} words.`);
      return retry.draftBody;
    });

    // Stage 2 post-generation check — capability language absent from the corpus.
    const ungrounded = findUngroundedClaims(draftBody, corpus);
    if (ungrounded.length) {
      console.log('[Draft] ungrounded claim suspected:', ungrounded.map((u) => u.ungrounded.join(', ')).join('; '));
    }

    return { draftSubject: first.draftSubject, draftBody, regenerated, flagged, ungrounded };
  }

  /**
   * Full inbound-email pipeline: persist → classify + extract → (draft → approve).
   * The draft is written onto the inbound_message row; Nexus never sends it.
   * Idempotent: a redelivered webhook reuses the stored classification/draft and
   * never mints a second approval task.
   */
  async processInboundEmail(payload) {
    const { persistInboundMessage } = await import('../skills/inboundEmail.js');
    const row = await persistInboundMessage(payload);

    // Retry guard: if this message was already classified, reuse the stored result.
    if (row?.classification) {
      let approvalId = row.approval_task_id || null;
      if (row.draft_body && !approvalId) {
        approvalId = await this._ensureEmailApprovalTask(row, payload, row.draft_subject, row.draft_body, row.classification, row.extracted);
      }
      return {
        id: row.id,
        approvalId,
        needsReply: Boolean(row.draft_body),
        classification: row.classification || null,
        extracted: row.extracted || null,
        draftSubject: row.draft_subject || null,
        draftBody: row.draft_body,
        deduped: true,
      };
    }

    // Stage 1 — classify + extract.
    const { category, extracted } = await this.classifyInboundEmail(payload);

    const db = getSupabase();
    if (db && row?.id) {
      await db.from('inbound_message').update({ classification: category, extracted }).eq('id', row.id);
    }

    // client_enquiry, partner_approach and not_a_fit draft; everything else is stored classified.
    if (!shouldDraft(category)) {
      return {
        id: row?.id || null,
        approvalId: null,
        needsReply: false,
        classification: category,
        extracted,
        draftSubject: null,
        draftBody: null,
      };
    }

    // Stage 2 + 3 — grounded composition + fixed shape (a decline for not_a_fit).
    const { draftSubject, draftBody: rawDraftBody } = await this.draftEmailReply(payload, extracted, category);
    // System post-processing before storage: strip any leaked internal name and
    // append the human signature (the model never writes a signature itself).
    const draftBody = finalizeEmailDraft(rawDraftBody);

    if (db && row?.id) {
      await db.from('inbound_message').update({
        draft_subject: draftSubject,
        draft_body:    draftBody,
        status:        draftBody ? 'draft' : 'received',
      }).eq('id', row.id);
    }

    let approvalId = null;
    if (draftBody) {
      approvalId = await this._ensureEmailApprovalTask(row, payload, draftSubject, draftBody, category, extracted);
    }

    return {
      id: row?.id || null,
      approvalId,
      needsReply: Boolean(draftBody),
      classification: category,
      extracted,
      draftSubject,
      draftBody,
    };
  }

  /**
   * Create the [APPROVAL] task for an email reply draft and backfill the row's
   * approval_task_id. Returns the approval task id (or null when not created).
   * The approval card surfaces classification + extracted facts above the draft.
   */
  async _ensureEmailApprovalTask(row, payload, draftSubject, draftBody, classification, extracted) {
    const db = getSupabase();
    const subject = payload.subject || '(no subject)';
    const e = extracted || {};
    const { approvalId } = await createApprovalRequest({
      approvalType: 'email_reply',
      subject:      `Email reply — ${String(subject).slice(0, 60)}`,
      detail: [
        `Category: ${classification || '—'}`,
        `Sender: ${e.senderName || '—'}`,
        `Organisation: ${e.organisation || '—'}`,
        `Stated need: ${e.statedNeed || '—'}`,
        `Timeline: ${e.timelineSignal || '—'}`,
        `Budget: ${e.budgetSignal || '—'}`,
        `Referral: ${e.referralSource || '—'}`,
        ``,
        `From: ${payload.from || '—'}`,
        `To: ${payload.to || '—'}`,
        `Subject: ${subject}`,
        ``,
        `Draft reply:`,
        draftSubject || '(no subject)',
        ``,
        draftBody,
      ].join('\n'),
      payload: {
        inboundMessageId: row?.id || null,
        messageId:        payload.messageId || null,
        threadId:         payload.threadId || null,
        from:             payload.from || null,
        to:               payload.to || null,
        subject,
        classification,
        extracted:        e,
        draftSubject,
        draftBody,
      },
    });
    if (db && row?.id && approvalId) {
      await db.from('inbound_message').update({ approval_task_id: approvalId }).eq('id', row.id);
    }
    return approvalId || null;
  }

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
        depth:       'deep',
        mergeWithKB: true,
      });

      // Never stringify an object into a content field — `String(result || '')`
      // can only ever produce "[object Object]". A job that returns no usable
      // brief (absent, or shorter than the 400-character floor) is a failure.
      const rawBrief = typeof result?.brief === 'string' ? result.brief
        : typeof result?.summary === 'string' ? result.summary
        : null;
      if (!rawBrief || rawBrief.trim().length < 400) {
        throw new Error(rawBrief
          ? `Research returned a brief of ${rawBrief.trim().length} characters — shorter than the 400-character floor.`
          : 'Research returned no usable brief (missing brief field).');
      }

      brief        = rawBrief;
      researchMeta = {
        sources:      result?.sources      || [],
        gaps:         result?.gaps         || [],
        coverStats:   result?.coverStats   || [],
        mergedWithKB: result?.mergedWithKB || false,
        depth:        result?.depth        || 'standard',
      };
    } catch (e) {
      console.error('[Nexus] Orion research failed:', e.message);
      const { failResearchDeliverable } = await import('../lib/researchDeliverables.js');

      // A dead / missing Tavily key is an infrastructure outage, not a quality
      // problem — tell the Boss so the key gets fixed, then fail the task.
      if (e?.code === 'TAVILY_UNAVAILABLE') {
        await this.escalateToOwner({
          subject:  '⚠️ Tavily API down — Orion research blocked',
          body:     `Orion tried to research "${instruction.slice(0, 100)}" but Tavily is unavailable: ${e.message}\n\nAction: check TAVILY_API_KEY on Render (quota, expiry, rotation), then re-run this task from the Command Center.`,
          severity: 'critical',
          context:  { taskId, instruction: instruction.slice(0, 200), tavilyReason: e.message },
        }).catch((escErr) => console.warn('[Nexus] Infrastructure escalation failed:', escErr.message));
      }

      await failResearchDeliverable({
        taskId, instruction,
        reason: e.message,
        depth: 'deep', forAgent: 'nexus',
      });
      return;
    }

    const { completeResearchDeliverable, failResearchDeliverable, MIN_BRIEF_LENGTH } = await import('../lib/researchDeliverables.js');

    let qScore = scoreResearchBrief({ brief, ...researchMeta });
    console.log(`[Nexus] Research quality: ${qScore.grade} (${qScore.score}/100)`);

    // ── Quality gate: a brief scoring below 60 never advances to writing ──
    if (!qScore.passed) {
      // API is healthy — one automatic retry with a stricter prompt is permitted.
      await notifyFailedResearchBrief({ topic: instruction, qScore });
      console.warn('[Nexus] Research quality below gate — retrying with a stricter prompt');
      try {
        const { researcher } = await import('./researcher.js');
        const deepResult = await researcher.research({
          topic:       instruction,
          forAgent:    'nexus',
          depth:       'deep',
          mergeWithKB: true,
          strict:      true,
          context:     'The previous brief failed the quality gate. Target specific statistics, named frameworks, and cited sources.',
          focusAreas:  ['market data and statistics', 'expert frameworks', 'regional context', 'competitive landscape'],
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
        console.error('[Nexus] Strict retry failed:', e.message);
      }

      // Second failure — stop and wait for a human.
      if (!qScore.passed) {
        console.error(`[Nexus] Research failed the quality gate twice (${qScore.score}/100) — waiting for human review`);
        await notifyFailedResearchBrief({ topic: instruction, qScore });
        await failResearchDeliverable({
          taskId, instruction, qualityScore: qScore,
          reason: `Research brief failed the quality gate twice (${qScore.score}/100) — waiting for human review`,
          depth: researchMeta.depth, forAgent: 'nexus',
        });
        return;
      }
    }

    // ── Never store a too-short brief as a completed research artifact ──
    const briefLength = String(brief || '').trim().length;
    if (briefLength < MIN_BRIEF_LENGTH) {
      console.error(`[Nexus] Research brief too short (${briefLength} chars) — failing task ${taskId}`);
      await notifyFailedResearchBrief({
        topic: instruction,
        qScore,
        extraReason: `Brief is ${briefLength} characters — shorter than the ${MIN_BRIEF_LENGTH}-character minimum.`,
      });
      await failResearchDeliverable({
        taskId, instruction, qualityScore: qScore,
        reason: `Research brief shorter than ${MIN_BRIEF_LENGTH} characters — not stored as a completed artifact`,
        depth: researchMeta.depth, forAgent: 'nexus',
      });
      return;
    }

    const briefGated     = !(researchMeta.sources?.length);
    const rawBriefText   = brief || '';

    // ── Show Boss the quality scorecard AND whatever raw content exists ──────
    // Previously the brief was entirely replaced by the scorecard when quality
    // failed — meaning Boss saw a D-grade label with no actual intelligence.
    // Now Boss sees: quality badge first, then the raw brief (even if thin),
    // so they can decide whether the partial output is still useful.
    let bossBrief;
    if (briefGated) {
      const reasonBlock = `Brief withheld — Tavily/Firecrawl returned insufficient sources (${researchMeta.sources?.length || 0}). Check \`TAVILY_API_KEY\` quota on Render, then re-run from Command Center.`;

      bossBrief = [
        formatQualityBadge(qScore),
        '',
        '---',
        reasonBlock,
        '',
        rawBriefText && rawBriefText.trim().length > 10
          ? `**Partial output (may be useful):**\n\n${rawBriefText}`
          : '**No output produced.** Orion was unable to generate any brief from the available sources.',
      ].filter(Boolean).join('\n');
    } else {
      bossBrief = brief;
    }

    const workflowSignals = parseWorkflowSignals(instruction);
    const nextSteps       = briefGated ? [] : this._suggestNextSteps(brief, workflowSignals);

    let campaign = null;
    if (!briefGated && workflowSignals.autoWire) {
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

    const deliverableResult = await completeResearchDeliverable({
      taskId,
      instruction,
      brief:        bossBrief,
      rawBrief:     brief,
      briefGated,
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

    if (!deliverableResult.notionOk && deliverableResult.notionReason === 'notion_not_configured') {
      console.warn(`[Nexus] Research saved but Notion not configured — task ${taskId}`);
    } else if (!deliverableResult.notionOk) {
      console.warn(`[Nexus] Research saved but Notion log failed — task ${taskId}`);
    }

    await this.rememberEpisodic({
      summary:    `Orion researched: "${instruction.slice(0, 80)}"`,
      content:    {
        instruction,
        brief: brief?.slice(0, 500),
        qualityScore: qScore.score,
        taskId,
        notionPageId: deliverableResult.notionPageId || null,
      },
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
    if (await isPaused()) {
      console.log('[Paused] autonomous task creation suppressed (Nexus orchestrate)');
      return { type: 'plan', paused: true, parentId: null, tasks: [], plan: [] };
    }

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

      let placeholderTaskId = null;
      if (db) {
        const { data: placeholder } = await db.from('tasks').insert({
          title:       step.title,
          description: `Use the following research brief:\n\n${researchBrief.slice(0, 2000)}`,
          agent_id:    step.agent_id,
          created_by:  'nexus',
          status:      'pending',
          priority,
          type:        step.type,
          input:       JSON.stringify({ researchBrief, originalInstruction: instruction }),
        }).select('id').single();
        placeholderTaskId = placeholder?.id || null;
      }

      // If BD brief — trigger Atlas immediately
      if (nextStep === 'bd_brief' || nextStep === 'strategy') {
        try {
          const { atlas } = await import('./atlas.js');
          if (placeholderTaskId) await this.startTask(placeholderTaskId);
          const bdPrompt = `You are Atlas, DigiFusion's BD specialist. Using the research findings below, produce a structured business development strategy brief.

RESEARCH FINDINGS:
${researchBrief.slice(0, 3000)}

Apply the Deal Engine framework: identify the opportunity, the ideal prospect profile, the winning angle, key objections, and recommended next actions. Be specific and actionable.`;
          const brief = await atlas.chat(bdPrompt);
          if (placeholderTaskId) await this.completeTask(placeholderTaskId, { resultReference: { brief: String(brief || '').slice(0, 4000) } });
          return {
            type:    'bd_brief_ready',
            agent:   'atlas',
            message: 'Atlas has produced a BD strategy brief from the research.',
            content: brief,
          };
        } catch (e) {
          console.error('[Nexus] Atlas dispatch failed:', e.message);
          if (placeholderTaskId) await this.failTask(placeholderTaskId, e.message);
        }
      }

      // If automation — trigger Nova immediately
      if (nextStep === 'automation') {
        try {
          const { nova } = await import('./nova.js');
          if (placeholderTaskId) await this.startTask(placeholderTaskId);
          const novaPrompt = `You are Nova, DigiFusion's AI & SaaS automation specialist. Using the research findings below, design an AI automation or SaaS solution architecture.

RESEARCH FINDINGS:
${researchBrief.slice(0, 3000)}

Apply the Automation Velocity Engine (AVE) framework: identify the automation opportunity, map the workflow, recommend the AI/SaaS stack, outline the implementation phases, and estimate the efficiency gain.`;
          const brief = await nova.chat(novaPrompt);
          if (placeholderTaskId) await this.completeTask(placeholderTaskId, { resultReference: { brief: String(brief || '').slice(0, 4000) } });
          return {
            type:    'automation_brief_ready',
            agent:   'nova',
            message: 'Nova has designed an automation solution from the research.',
            content: brief,
          };
        } catch (e) {
          console.error('[Nexus] Nova dispatch failed:', e.message);
          if (placeholderTaskId) await this.failTask(placeholderTaskId, e.message);
        }
      }

      // If report — dispatch Synthesizer to build an intelligence report
      if (nextStep === 'report') {
        try {
          const { synthesizer } = await import('./synthesizer.js');
          if (placeholderTaskId) await this.startTask(placeholderTaskId);
          const report = await synthesizer.synthesize({
            instruction: `Produce a structured intelligence report from the research findings below. Lead with the most actionable insights and cite sources.\n\nRESEARCH FINDINGS:\n${researchBrief.slice(0, 3000)}`,
            outputFormat: 'brief',
          });
          if (placeholderTaskId) await this.completeTask(placeholderTaskId, { resultReference: { report: String(report || '').slice(0, 4000) } });
          return {
            type:    'report_ready',
            agent:   'synthesizer',
            message: 'Synthesizer has produced an intelligence report from the research.',
            content: report,
          };
        } catch (e) {
          console.error('[Nexus] Synthesizer report failed:', e.message);
          if (placeholderTaskId) await this.failTask(placeholderTaskId, e.message);
        }
      }

      // If save — dispatch Synthesizer to absorb findings into the KB
      if (nextStep === 'save') {
        try {
          const { synthesizer } = await import('./synthesizer.js');
          if (placeholderTaskId) await this.startTask(placeholderTaskId);
          const summary = await synthesizer.synthesize({
            instruction: `Absorb and index the following research findings into the knowledge base. Summarise the key facts, frameworks and data points so other agents can retrieve them.\n\nRESEARCH FINDINGS:\n${researchBrief.slice(0, 3000)}`,
            outputFormat: 'brief',
          });
          if (placeholderTaskId) await this.completeTask(placeholderTaskId, { resultReference: { saved: true, summary: String(summary || '').slice(0, 2000) } });
          return {
            type:    'saved_to_kb',
            agent:   'synthesizer',
            message: 'Findings saved to the knowledge base.',
          };
        } catch (e) {
          console.error('[Nexus] Synthesizer save failed:', e.message);
          if (placeholderTaskId) await this.failTask(placeholderTaskId, e.message);
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

          // This branch owns the placeholder task created above — drafting is
          // its job, so mark it in_progress before Aether is called.
          if (placeholderTaskId) await this.startTask(placeholderTaskId);

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

          const { resolveContentAuthor } = await import('../skills/contentAuthorRegistry.js');
          const { loadContentAuthorSettings } = await import('../skills/contentAuthorSettings.js');
          const authorSettings = await loadContentAuthorSettings().catch(() => ({}));
          const resolvedAuthor = resolveContentAuthor({
            topic:         brief.proposedTitle || instruction,
            niche:         options.niche || options.sector,
            domain:        options.domain || options.contentDomain,
            domainAuthors: authorSettings.domainAuthors,
          });

          const { approvalId, whatsappSent } = await createApprovalRequest({
            approvalType: 'blog_post',
            subject:      `Blog post approval — ${(brief.proposedTitle || instruction).slice(0, 60)}`,
            detail:       approvalDetail,
            payload: {
              topic:            instruction,
              proposedTitle:    brief.proposedTitle,
              outline:          brief.outline,
              recommendedTone:  brief.recommendedTone,
              recommendedAuthor: brief.recommendedAuthor || resolvedAuthor.byline,
              authorId:         resolvedAuthor.id,
              contentDomain:    resolvedAuthor.contentDomain,
              seoKeyword:       brief.seoKeyword,
              researchBrief:    researchBrief.slice(0, 3000),
              frameworkId:      'c2c',
              niche:            resolvedAuthor.contentDomain,
              postType:         options.postType || 'article',
            },
          });

          // The placeholder's job ends the moment the approval request exists —
          // complete it with the draft reference so it never lingers as "stuck".
          if (placeholderTaskId) {
            await this.completeTask(placeholderTaskId, {
              draftReference: {
                approvalId,
                proposedTitle:     brief.proposedTitle || instruction.slice(0, 80),
                outline:           brief.outline || [],
                recommendedTone:   brief.recommendedTone || null,
                recommendedAuthor: brief.recommendedAuthor || resolvedAuthor?.byline || null,
              },
            });
          }

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
          if (placeholderTaskId) await this.failTask(placeholderTaskId, e.message);

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

      // ── HARNESS: Trace research dispatch ──────────────────────────────────
      const runId = generateRunId();
      createBudget({ runId, tokenLimit: 100000, costLimitUsdMills: 5000 }).catch(() => {});

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

      // ── HARNESS: Trace the research dispatch step ─────────────────────────
      writeTrace({
        runId, agentId: 'nexus', stepIndex: 0, chainLength: 2, verified: false,
        input: instruction, output: { taskId, agent: 'researcher' },
        providerName: resolveProvider()?.name, modelName: resolveProvider()?.model,
        verdict: 'passed', verificationCheck: 'research_intent_detected',
      }).catch(() => {});

      if (taskId) {
        this._runOrionResearchJob(taskId, instruction, priority).catch(e => {
          console.error('[Nexus] Background Orion job failed:', e.message);
        });
      }

      return {
        type:    'research_started',
        taskId,
        agent:   'orion',
        runId,
        message: 'Orion research started. This may take 1–3 minutes — polling for results.',
      };
    }

    // ── PHASE 1B: Multi-step instruction — decompose and queue ───────────────
    // ── HARNESS: Generate run ID and create budget for this chain ───────────
    const runId = generateRunId();
    const budget = await createBudget({
      runId,
      tokenLimit: 200000,
      costLimitUsdMills: 10000,
      stepLimit: 12,
    }).catch(() => null);

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
    await runTaskHygiene().catch((e) => console.warn('[Nexus] task hygiene:', e.message));

    const status = await this.getNetworkStatus();
    const ops    = await buildOpsSnapshot();
    const researchPipe = await buildResearchPipelineBlock().catch(() => ({ textBlock: 'unavailable' }));
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

ORION RESEARCH (verified from Supabase — do not invent):
— ${researchPipe.textBlock}

AGENT NETWORK STATUS:
${Nexus.agentList(status).map(a => `- ${a.name}: ${a.status}${a.currentTask ? ' (on task)' : ''}`).join('\n') || 'Status unavailable'}

ACTIVE / PENDING TASKS (${status.activeTasks.length}):
${status.activeTasks.slice(0, 8).map(t => `- [P${t.priority}] ${t.title} → ${t.agent_id} (${t.status})`).join('\n') || 'No active tasks'}

COMPLETED IN LAST 24h (${recentCompleted.length}):
${recentCompleted.map(t => `- ${t.title} [${t.agent_id}]`).join('\n') || 'None'}

RECENT LEADS (${recentLeads.length}):
${recentLeads.map(l => `- ${l.name || l.email}: score ${l.lead_score}, status ${l.status}`).join('\n') || 'None'}

PENDING ALERTS (${status.pendingAlerts.length}):
${status.pendingAlerts.map(a => `- [${a.severity?.toUpperCase()}] ${a.title}`).join('\n') || 'None'}

Write a direct morning CEO briefing: lead with today's top priority, then pipeline pulse, approvals needed, content cadence, one focus line per active agent. Max 6 sentences unless Boss asked for detail. Apply Minto Pyramid — recommendation first.

TRUTH RULES: Only mention tasks listed under ACTIVE / PENDING TASKS above. If ORION RESEARCH shows deliverables with brief > 0, do NOT say research is stuck or pending. If ghost completed count > 0, say deliverable is missing from storage — do not claim Orion finished. Never mention Notion unless Boss asked.`;

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
    await runTaskHygiene().catch((e) => console.warn('[Nexus] task hygiene:', e.message));

    const status = await this.getNetworkStatus();
    const ops    = await buildOpsSnapshot();
    const researchPipe = await buildResearchPipelineBlock().catch(() => ({ textBlock: 'unavailable' }));
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

ORION RESEARCH (verified): ${researchPipe.textBlock}

Cover: what shipped, what's blocked, tomorrow's top 3 priorities, content/blog status. Max 5 sentences. Recommendation first. Only cite tasks from SHIPPED/STILL ACTIVE lists — do not invent stuck research if deliverables with brief > 0.`;

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
      agentSummary:    Nexus.agentList(status).map(a => ({ id: a.id, status: a.status })),
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

    const notionPageId = await notion.logTask({
      agentId:   'nexus',
      agentName: 'Nexus (Digital CEO)',
      taskTitle: `Workflow design: ${processDescription.slice(0, 80)}`,
      taskType:  'workflow_design',
      outcome:   quality.passed ? 'complete' : 'needs_revision',
      notes:     `${formatCeoQualityBadge(quality)}\n\n${spec.slice(0, 1500)}`,
    }).catch(() => null);

    const db = getSupabase();
    let novaQueued = false;
    if (db) {
      const { error } = await db.from('tasks').insert({
        title:       `[Nova] Implement workflow: ${processDescription.slice(0, 60)}`,
        description: spec.slice(0, 4000),
        agent_id:    'nova',
        created_by:  'nexus',
        status:      'pending',
        priority:    3,
        type:        'analysis',
        input:       JSON.stringify({ workflowSpec: spec, framework: 'ave' }),
      });
      novaQueued = !error;
    }

    return { spec, quality, delegatedTo: 'nova', framework: ceoModule.framework, notionPageId, novaQueued };
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

  async chat(message, history = [], surface = 'internal') {
    const lower = message.toLowerCase();

    // ── ACTION: Workflow design ────────────────────────────────────────────
    if (/design workflow|analyze workflow|structure workflow|workflow spec|map process/.test(lower)) {
      try {
        const result = await this.designWorkflow({ processDescription: message });
        return formatWorkflowDesignReply({
          spec: result.spec,
          quality: result.quality,
          notionPageId: result.notionPageId,
          novaQueued: result.novaQueued,
        });
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

    // ── ACTION: Boss wants outbound WhatsApp (test ping / text me) ───────
    if (isWhatsAppOutboundRequest(message)) {
      const bodyText = extractOutboundWhatsAppBody(message);
      const toRaw = (process.env.WHATSAPP_TO || process.env.OWNER_PHONE || '').trim();
      if (!toRaw) {
        return 'Boss, outbound WhatsApp is not configured — set OWNER_PHONE (or WHATSAPP_TO) plus Twilio credentials on the server.';
      }
      try {
        const { sendWhatsAppRecorded } = await import('../skills/notifier.js');
        const result = await sendWhatsAppRecorded('Nexus', bodyText);
        if (result?.skipped) {
          const reason = result.reason === 'no_credentials'
            ? 'Twilio/Meta WhatsApp credentials are missing.'
            : 'No WhatsApp recipient is configured.';
          return `Could not send — ${reason}`;
        }
        const sent = result?.results?.some((r) => r.sent || r.sid);
        if (sent) {
          return `Done Boss — sent "${bodyText}" to your WhatsApp. Check your phone; if nothing arrives, verify Twilio sandbox join and OWNER_PHONE.`;
        }
        const err = result?.results?.find((r) => r.error)?.error || result?.error;
        return `WhatsApp send failed${err ? `: ${err}` : ''}. Check Twilio logs and webhook config.`;
      } catch (e) {
        return `WhatsApp send failed — ${e.message}`;
      }
    }

    // ── ACTION: Boss YES/NO on pending approval (chat + WhatsApp parity) ───
    try {
      const approvalResult = await processBossApprovalMessage(message, 'web');
      if (approvalResult.handled && approvalResult.reply) {
        return approvalResult.reply;
      }
    } catch (e) {
      console.warn('[Nexus] Approval message handling failed:', e.message);
    }

    // ── ACTION: Orion research / deliverable status (fast — no LLM) ────────
    if (isResearchStatusQuery(message)) {
      try {
        return await buildResearchStatusReply(message);
      } catch (e) {
        return `I could not read Orion deliverables right now: ${e.message}. Check Agent Console → Orion → Deliverables.`;
      }
    }

    // ── ACTION: WhatsApp approval receipt (fast — no LLM) ─────────────────
    if (isWhatsAppApprovalQuery(message)) {
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
      if (!isNotionConfigured()) {
        return 'Notion is not configured (NOTION_API_KEY / NOTION_TASKS_DB_ID). Dashboard sync did not run.';
      }
      const syncResult = await this.syncCeoNotionDashboard('manual');
      if (syncResult?.pageId) {
        return `Notion CEO dashboard synced, Boss (page \`${String(syncResult.pageId).slice(0, 8)}…\`).`;
      }
      return 'Notion sync attempted but did not return a page ID — check Render logs.';
    }

    // ── ACTION: Log to Notion (imperative only — verified pageId) ──────────
    const notionIntent = parseNotionLogIntent(message);
    if (notionIntent) {
      try {
        const pageId = await notion.logTask({
          agentId:   'nexus',
          agentName: 'Nexus',
          taskTitle: notionIntent.subject.slice(0, 200),
          taskType:  'manual_log',
          outcome:   'logged',
          notes:     `Logged via Boss chat at ${new Date().toLocaleString()}. Original message: "${message}"`,
        });
        return formatNotionLogReply({ pageId, subject: notionIntent.subject });
      } catch (e) {
        return `Notion log failed — ${e.message}. Check NOTION_TASKS_DB_ID on Render.`;
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
    // Fetch live context to ground the response so Nexus doesn't hallucinate.
    // `surface` is structural: internal (Slack) may see agent names + live state;
    // external (client email / non-staff WhatsApp / published) gets an
    // identity-free system prompt and no internal context at all.
    const external = surface === 'external';
    const db = getSupabase();
    let liveContext = '';
    if (db && !external) {
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
      const notionOk = isNotionConfigured();
      liveContext += `\nNOTION STATUS: ${notionOk ? 'connected (log tasks, sync CEO dashboard)' : 'not configured'}`;
      liveContext += '\nBOSS APPROVAL CHANNELS: Nexus chat YES, WhatsApp webhook, Command Center Approve button';
      const researchPipe = await buildResearchPipelineBlock().catch(() => null);
      if (researchPipe) {
        liveContext += `\nORION RESEARCH: ${researchPipe.textBlock}`;
      }
      if (clientSnap) liveContext += clientSnap;
      if (util) liveContext += `\nUTILIZATION: ${util.utilizationPct}%${util.alert ? ' — PAUSE NEW INTAKE' : ''}`;
    }

    const episodic = external ? '' : await this.recallEpisodic(3).catch(() => '');
    const historyBlock = history.slice(-6).map(t =>
      external
        ? `${t.role === 'user' ? 'You' : 'Assistant'}: ${t.content}`
        : `${t.role === 'user' ? 'Boss' : 'Nexus'}: ${t.content}`
    ).join('\n');

    const fullPrompt = [
      liveContext ? `LIVE SYSTEM STATE:${liveContext}` : '',
      episodic,
      historyBlock ? `CONVERSATION:\n${historyBlock}` : '',
      `Boss: ${message}`,
    ].filter(Boolean).join('\n\n');

    // Hard honesty enforcement: the LLM can ONLY assert facts visible in LIVE SYSTEM STATE above
    const baseSystem = external ? NEXUS_EXTERNAL_SYSTEM : this.systemPrompt;
    const chatSystem = `${baseSystem}\n\n${buildHonestyEnforcementBlock()}` +
      (external
        ? ' Never mention AI agents, internal systems, internal team names, vendors, pricing, methodology, or client names.'
        : ' If PENDING APPROVAL is listed, tell Boss to type YES in this chat (not only WhatsApp). If Boss asks about Orion research, cite ORION RESEARCH lines only — deliverables live in PathGuru (tasks.output / Deliverables panel), not Notion by default.');

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

    // Hard-coded agent roster — used as fallback when DB is unavailable
    const AGENT_DEFS = [
      { id: 'nexus',       name: 'Nexus',       role: 'CEO / Orchestrator',     color: '#f59e0b', status: 'idle', lastActivity: null, currentTask: null },
      { id: 'atlas',       name: 'Atlas',       role: 'BD & Research Director',  color: '#3b82f6', status: 'idle', lastActivity: null, currentTask: null },
      { id: 'nova',        name: 'Nova',        role: 'Automation Architect',    color: '#10b981', status: 'idle', lastActivity: null, currentTask: null },
      { id: 'aether',      name: 'Aether',      role: 'Marketing Studio Lead',   color: '#8b5cf6', status: 'idle', lastActivity: null, currentTask: null },
      { id: 'pulse',       name: 'Pulse',       role: 'Monitoring & Notifications', color: '#ef4444', status: 'idle', lastActivity: null, currentTask: null },
      { id: 'synthesizer', name: 'Synthesizer', role: 'Knowledge & IP Engine',   color: '#ec4899', status: 'idle', lastActivity: null, currentTask: null },
      { id: 'researcher',  name: 'Orion',       role: 'Research Agent',          color: '#06b6d4', status: 'idle', lastActivity: null, currentTask: null },
      { id: 'assistant',   name: 'Aria',        role: 'Lead Intake & Assistant', color: '#84cc16', status: 'idle', lastActivity: null, currentTask: null },
    ];

    // If DB is unavailable, return roster with idle status
    if (!db) {
      const byId = {};
      for (const a of AGENT_DEFS) {
        a.lastActivity = 'unavailable';
        byId[a.id] = { status: a.status, lastActivity: a.lastActivity, currentTask: a.currentTask, name: a.name, role: a.role, color: a.color };
      }
      return { agents: byId, activeTasks: [], pendingAlerts: [], snapshotAt: new Date().toISOString() };
    }

    // Try fetching from DB
    let dbAgents = [];
    let tasksRes, notifRes;
    try {
      const results = await Promise.all([
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
      dbAgents = results[0]?.data || [];
      tasksRes = results[1];
      notifRes = results[2];
    } catch (_) {
      // DB query failed — fall back to hard-coded roster
    }

    // Build agent map from DB rows, falling back to hard-coded defs
    const dbAgentMap = {};
    for (const row of dbAgents) {
      const id = row.id || row.agent_id;
      if (id) dbAgentMap[id] = row;
    }

    const agentStatuses = {};
    for (const def of AGENT_DEFS) {
      const dbRow = dbAgentMap[def.id];
      const activeTasks = (tasksRes?.data || []).filter(t => t.agent_id === def.id);

      // Determine status: prioritize DB row, then active tasks, then idle
      let status = 'idle';
      if (dbRow?.status) {
        status = dbRow.status === 'active' ? 'active' : dbRow.status === 'busy' ? 'busy' : 'idle';
      } else if (activeTasks.length > 0) {
        const hasRunning = activeTasks.some(t => t.status === 'in_progress');
        status = hasRunning ? 'busy' : 'active';
      }

      agentStatuses[def.id] = {
        status,
        lastActivity: dbRow?.last_active || dbRow?.updated_at || (activeTasks.length > 0 ? new Date().toISOString() : '—'),
        currentTask: activeTasks[0]?.title || dbRow?.current_task || null,
        name: def.name,
        role: def.role,
        color: def.color,
      };
    }

    return {
      agents:        agentStatuses,
      activeTasks:   tasksRes?.data  || [],
      pendingAlerts: notifRes?.data  || [],
      snapshotAt:    new Date().toISOString(),
    };
  }

  /**
   * getNetworkStatus() returns `agents` as an OBJECT KEYED BY AGENT ID, not an
   * array — see the two return statements above, both of which build `{}`.
   * Three call sites called `.map` on it directly, which is why the command tab
   * died with "status.agents?.map is not a function". The optional chaining at
   * one of them made it worse, not better: it silenced the null case and left
   * the type error, so the failure surfaced in the browser instead of at the
   * boundary.
   *
   * Field names differ too, and that is the second half of the bug. The object's
   * values carry `name`, `lastActivity` and `currentTask`; the call sites were
   * reading `display_name`, `last_active_at` and `current_task_id`, which do not
   * exist on this shape and would have rendered "undefined" into a prompt sent
   * to a model even once the crash was fixed. Normalising in one place is the
   * only way that stays fixed.
   */
  static agentList(status) {
    const agents = status?.agents;
    if (!agents) return [];
    const rows = Array.isArray(agents)
      ? agents.map(a => [a.id, a])
      : Object.entries(agents);
    return rows.map(([id, a]) => ({
      id,
      name:        a?.name || a?.display_name || id,
      status:      a?.status || 'unknown',
      currentTask: a?.currentTask || a?.current_task || a?.current_task_id || null,
      lastActive:  a?.lastActivity || a?.last_active_at || a?.last_active || null,
    }));
  }

  /**
   * Reduce a task's output JSONB into a single human-readable summary string,
   * or null when there is nothing renderable. Keeps the activity journal from
   * printing "[object Object]" when output is a structured object rather than
   * a flat string. Prefers an explicit summary/message/result text field and
   * falls back to a JSON string for anything else.
   */
  static summarizeTaskOutput(output) {
    if (output == null || output === '') return null;
    if (typeof output === 'string') return output;
    if (typeof output !== 'object') return String(output);

    for (const key of ['summary', 'message', 'result', 'response', 'brief']) {
      const v = output[key];
      if (typeof v === 'string' && v.trim()) return v;
    }
    if (output.result && typeof output.result === 'object') {
      const nested = Nexus.summarizeTaskOutput(output.result);
      if (nested) return nested;
    }
    if (output.output && typeof output.output === 'string' && output.output.trim()) return output.output;
    try { return JSON.stringify(output); } catch { return String(output); }
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
    const tasks = (data || []).map((t) => ({ ...t, summary: Nexus.summarizeTaskOutput(t.output) }));
    return { tasks, total: count, limit, offset };
  }

  async generateStatusReport() {
    const status = await this.getNetworkStatus();

    const reportPrompt = `You are Nexus, the project manager. Generate a concise status report for the DigiFusion team.

AGENT STATUSES:
${Nexus.agentList(status).map(a => `- ${a.name}: ${a.status}${a.currentTask ? ' (on task)' : ''}, last active: ${a.lastActive && a.lastActive !== '—' ? new Date(a.lastActive).toLocaleString() : 'never'}`).join('\n') || 'Status unavailable'}

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

  // Content calendar generation is retired — no agent invents its own topics.
  // Content is now commissioned by a human (see /api/content/commission).
  async createContentCalendar() {
    return { error: 'content is now commissioned, not scheduled — see /api/content/commission' };
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
  // NEWSLETTER — commissioned only (no autonomous topic proposal)
  // ══════════════════════════════════════════════════════════════════════════

  async proposeNewsletterTopics() {
    // Autonomous topic generation is retired — no agent proposes its own topic.
    // Newsletter topics are now commissioned by a human (see /api/content/commission).
    return { error: 'content is now commissioned, not scheduled — see /api/content/commission' };
  }

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
  if (await isPaused()) {
    console.log('[Paused] WhatsApp send suppressed');
    return;
  }

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
