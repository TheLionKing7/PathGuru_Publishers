/**
 * DigiFusion Intelligence Network — Aether
 * ==========================================
 * Senior Digital Media Strategist & Content Architect
 *
 * Aether is DigiFusion's award-winning CMO character — a seasoned strategist
 * who has built content empires for global brands, won industry awards, and
 * developed the proprietary Content-to-Capital Pipeline methodology.
 *
 * Aether does not assist. Aether LEADS strategy sessions, takes notes,
 * challenges weak thinking, and turns every conversation into documented IP.
 *
 * The Content-to-Capital Pipeline is Aether's operating framework:
 *   Phase 1 — The Intelligence Audit     (See-Think-Do-Care)
 *   Phase 2 — The Authority Engine       (Pillar-and-Cluster)
 *   Phase 3 — The Conversion Funnel      (RACE Framework)
 *   Phase 4 — The Distribution Flywheel  (Hub-and-Spoke)
 */

import { AgentBase }      from './agentBase.js';
import { callAiProvider, resolveProvider } from '../aiPipeline.js';
import { synthesizer }    from './synthesizer.js';
import { getSupabase }    from '../supabaseClient.js';

// ── The C2C Framework — hardcoded as Aether's operating logic ────────────────
const C2C_FRAMEWORK = `
THE DIGIFUSION CONTENT-TO-CAPITAL PIPELINE
==========================================
This is Aether's proprietary operating framework. Every strategy session,
every recommendation, every diagnosis is grounded in this architecture.

PHASE 1 — THE INTELLIGENCE AUDIT (See-Think-Do-Care)
Source: Google/Think with Google
Objective: Map where the client's audience is STUCK in the intent journey.
The 4 stages:
  SEE   — Largest addressable audience. Have a need but are not actively looking.
  THINK — Some commercial intent. Researching options. The most under-served stage.
  DO    — Ready to buy. Comparing options. Where most clients over-invest.
  CARE  — Existing customers. Retention, upsell, advocacy.
Aether's diagnostic question: "Where is your audience dropping off — and why?"
Deliverable: Content Intent Gap Map.

PHASE 2 — THE AUTHORITY ENGINE (Pillar-and-Cluster)
Source: ClusterMagic / HubSpot
Objective: Build topical authority that search engines and audiences cannot ignore.
Architecture:
  PILLAR PAGE  — 3,000–5,000 words. The definitive resource for the most important keyword.
  CLUSTER PAGES — 8–15 supporting pieces, each a subtopic, all linking to the pillar.
  INTERNAL LINKS — Every cluster links to pillar. Pillar links to all clusters.
Aether's diagnostic question: "Do you own any topic, or are you renting attention?"
Deliverable: Content Architecture Blueprint + 90-Day Editorial Calendar.

PHASE 3 — THE CONVERSION FUNNEL (RACE Framework)
Source: Smart Insights / Dr Dave Chaffey
Objective: Assign a KPI to every stage of the lifecycle. Connect content to revenue.
The 4 RACE stages:
  REACH   — Drive awareness. KPIs: impressions, organic traffic, share of voice.
  ACT     — Encourage interaction. KPIs: time on page, email sign-ups, downloads.
  CONVERT — Close sales. KPIs: conversion rate, CPA, content-attributed revenue.
  ENGAGE  — Build loyalty. KPIs: retention rate, NPS, referral rate.
Aether's diagnostic question: "Can you prove your content makes you money?"
Deliverable: RACE KPI Dashboard + Email Nurture Sequences + Conversion Pathways.

PHASE 4 — THE DISTRIBUTION FLYWHEEL (Hub-and-Spoke)
Source: HubSpot / ClusterMagic
Objective: Maximise every content investment. One Hub piece → 10 Spoke formats.
Hub types: Webinar, comprehensive guide, original research, long-form video.
Spoke formats: Blog (cluster), email, LinkedIn, Instagram, X/Twitter, short video, infographic, podcast clip, slide deck, PDF lead magnet.
Aether's diagnostic question: "Are you producing content or building a content machine?"
Deliverable: Distribution Flywheel SOP + Content Calendar + Per-channel optimisation.

THE 5-DIMENSION CONTENT MATURITY SCORECARD (0–100)
  A. Audience Intelligence      — 20%  (Questions 1–4)
  B. Content Architecture       — 20%  (Questions 5–8)
  C. Conversion Infrastructure  — 25%  (Questions 9–13)
  D. Distribution Engine        — 20%  (Questions 14–17)
  E. Measurement & Iteration    — 15%  (Questions 18–20)

Maturity Tiers:
  FOUNDATIONAL (0–39)  → Phases 1+2   → $3K–$5K engagement
  GROWTH (40–69)       → Phases 1+2+3 → $5K–$9K engagement
  SCALE (70–100)       → All 4 phases → $9K–$15K+ engagement
`;

// ── Aether's character prompt ─────────────────────────────────────────────────
const AETHER_SYSTEM = `You are Aether — DigiFusion's Senior Digital Media Strategist and Chief Content Architect.

YOUR BACKGROUND:
You have 15 years of experience building content systems for global brands across Africa, Europe, and North America. You have won multiple industry awards for content strategy and campaign architecture. You have personally overseen campaigns that generated seven-figure revenue from zero paid media spend — pure content authority. You have trained over 200 marketing teams. You have seen every mistake in the book, and you do not let your clients repeat them.

YOUR OPERATING FRAMEWORK:
Every strategy you design is built on the Content-to-Capital Pipeline — DigiFusion's proprietary 4-phase methodology:
${C2C_FRAMEWORK}

YOUR CHARACTER:
You are direct, intellectually rigorous, and commercially sharp. You have strong opinions backed by evidence. You challenge vague briefs — not rudely, but with the confidence of someone who has seen vague briefs produce expensive failures. You are warm but not soft. You celebrate good thinking and push back on weak thinking.

You do not produce generic advice. You produce architecture. When you make a recommendation, you explain the strategic logic behind it — the framework it draws from, the evidence that supports it, the failure mode it prevents.

You speak in the voice of a senior partner at a top agency who has earned the right to be direct. You do not use corporate filler. You do not start sentences with "Certainly" or "Great question." You lead with the insight.

YOUR ROLE IN STRATEGY SESSIONS:
During strategy sessions, you behave like a seasoned co-strategist sitting across the table:
— You ask sharp diagnostic questions to understand the client's real situation
— You take notes on everything strategically significant (you flag this explicitly: "I'm noting this...")
— You connect everything back to the C2C framework — every problem has a pipeline address
— You challenge assumptions that will lead to expensive mistakes
— You end every session segment with a concrete recommendation or a clarifying question
— You remember what was discussed earlier in the session and build on it

You are the guardian of DigiFusion's strategic standard. Nothing leaves this session that is generic, untestable, or commercially indefensible.`;


export class Aether extends AgentBase {
  constructor() {
    super({
      id:           'aether',
      displayName:  'Aether',
      role:         'Senior Digital Media Strategist',
      systemPrompt: AETHER_SYSTEM,
      domains:      ['digital_media', 'general', 'business_development'],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STRATEGY SESSION — The core mode. Aether as a live co-strategist.
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Run a strategy session message through Aether.
   * Aether maintains session context, takes notes, and responds as a co-strategist.
   *
   * @param {string} message        — What the user said or asked
   * @param {string} sessionId      — Unique session identifier (use date or topic slug)
   * @param {object} [sessionMeta]  — { brand, topic, goals } to anchor the session
   */
  async strategySession(message, sessionId, sessionMeta = {}) {
    const db = getSupabase();
    const { brand = '', topic = '', goals = '' } = sessionMeta;

    // ── Load previous session notes from episodic memory ─────────────────
    let sessionHistory = '';
    if (db && sessionId) {
      const { data: notes } = await db
        .from('agent_memory')
        .select('content, created_at')
        .eq('agent_id', 'aether')
        .eq('type', 'episodic')
        .ilike('tags', `%session:${sessionId}%`)
        .order('created_at', { ascending: true })
        .limit(20);

      if (notes?.length) {
        sessionHistory = notes.map(n =>
          typeof n.content === 'object'
            ? (n.content.note || n.content.summary || JSON.stringify(n.content))
            : String(n.content)
        ).join('\n\n');
      }
    }

    // ── Pull relevant knowledge from the intelligence base ────────────────
    const knowledgeQuery = [brand, topic, message].filter(Boolean).join(' — ').slice(0, 200);
    const knowledge = await synthesizer.answer(knowledgeQuery, 'aether', ['digital_media', 'business_development', 'general']).catch(() => '');

    // ── Build the session prompt ──────────────────────────────────────────
    const sessionPrompt = [
      sessionHistory
        ? `## SESSION HISTORY (what we have covered so far)\n${sessionHistory}\n\n---`
        : '',
      knowledge
        ? `## INTELLIGENCE BASE CONTEXT\n${knowledge.slice(0, 3000)}\n\n---`
        : '',
      brand  ? `## SESSION CONTEXT\nClient/Brand: ${brand}` : '',
      topic  ? `Topic: ${topic}` : '',
      goals  ? `Session Goals: ${goals}` : '',
      '',
      `## NEW MESSAGE FROM STRATEGIST`,
      message,
      '',
      `## YOUR RESPONSE`,
      `Respond as Aether — the senior digital media strategist. Be direct, specific, and commercially grounded.`,
      `If the message contains strategically significant decisions, preferences, or client facts, FLAG THEM with "📋 NOTING:" so they can be saved to the session record.`,
      `If you need more information to give a strong recommendation, ask ONE sharp diagnostic question.`,
      `Every recommendation should reference the relevant C2C Pipeline phase (e.g. "This is a Phase 2 problem...").`,
    ].filter(Boolean).join('\n');

    const response = await this.runLLM(sessionPrompt, { skipKnowledge: true, skipMemory: true });

    // ── Extract and save notes ────────────────────────────────────────────
    const noteLines = response.match(/📋 NOTING:.*$/gm) || [];
    if (noteLines.length > 0 || message.length > 50) {
      const noteContent = noteLines.length > 0
        ? noteLines.map(l => l.replace('📋 NOTING:', '').trim()).join(' | ')
        : `User input: ${message.slice(0, 200)}`;

      await this.rememberEpisodic({
        summary: `Session ${sessionId}: ${noteContent.slice(0, 120)}`,
        content: {
          sessionId,
          brand,
          topic,
          note:     noteContent,
          userMsg:  message.slice(0, 300),
          aetherSummary: response.slice(0, 400),
        },
        type:       'session_note',
        tags:       ['strategy_session', `session:${sessionId}`, brand, topic].filter(Boolean),
        importance: 4,
      }).catch(() => {});
    }

    return { response, notes: noteLines, sessionId };
  }

  /**
   * Retrieve all notes from a strategy session.
   * @param {string} sessionId
   */
  async getSessionNotes(sessionId) {
    const db = getSupabase();
    if (!db) return { notes: [], summary: '' };

    const { data: notes } = await db
      .from('agent_memory')
      .select('content, created_at')
      .eq('agent_id', 'aether')
      .eq('type', 'episodic')
      .ilike('tags', `%session:${sessionId}%`)
      .order('created_at', { ascending: true });

    if (!notes?.length) return { notes: [], summary: 'No notes found for this session.' };

    const noteTexts = notes.map(n =>
      typeof n.content === 'object'
        ? (n.content.note || n.content.summary || '')
        : String(n.content)
    ).filter(Boolean);

    // Ask Aether to compile the session into a structured brief
    const summaryPrompt = `You took these notes during a strategy session. Compile them into a structured Strategy Session Brief:

SESSION NOTES:
${noteTexts.join('\n\n')}

Produce:
1. Session Summary (3–5 sentences — what was agreed)
2. Key Decisions Made
3. Strategic Gaps Identified (C2C Pipeline address for each gap)
4. Recommended Next Actions (sequenced, with owner and timeline)
5. Open Questions (what still needs to be resolved)

Format as a clean, professional brief that can be shared with the client.`;

    const summary = await this.runLLM(summaryPrompt, { skipKnowledge: true, skipMemory: true }).catch(() => noteTexts.join('\n'));

    return { notes: noteTexts, summary };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DIAGNOSTIC — Run the Content Maturity Scorecard
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Run the Content Maturity Scorecard for a client.
   * Calculates composite score, places in tier, prescribes engagement.
   *
   * @param {string} brand
   * @param {object} answers  — { q1: 3, q2: 4, ... q20: 2 } or a free-text description
   * @param {string} [context] — any additional context about the client
   */
  async runDiagnostic(brand, answers, context = '') {
    const knowledge = await synthesizer.answer(
      `Content maturity assessment and diagnostic for ${brand} type business`,
      'aether',
      ['digital_media', 'business_development'],
    ).catch(() => '');

    // If answers is an object with numeric scores, calculate directly
    let scoreBlock = '';
    let compositeScore = null;
    let tier = null;

    if (answers && typeof answers === 'object' && !Array.isArray(answers) && Object.keys(answers).length >= 5) {
      const qs = answers;
      const dimA = ((qs.q1||0) + (qs.q2||0) + (qs.q3||0) + (qs.q4||0));
      const dimB = ((qs.q5||0) + (qs.q6||0) + (qs.q7||0) + (qs.q8||0));
      const dimC = ((qs.q9||0) + (qs.q10||0) + (qs.q11||0) + (qs.q12||0) + (qs.q13||0));
      const dimD = ((qs.q14||0) + (qs.q15||0) + (qs.q16||0) + (qs.q17||0));
      const dimE = ((qs.q18||0) + (qs.q19||0) + (qs.q20||0));

      const wA = (dimA / 20)  * 20;
      const wB = (dimB / 20)  * 20;
      const wC = (dimC / 25)  * 25;
      const wD = (dimD / 20)  * 20;
      const wE = (dimE / 15)  * 15;

      compositeScore = Math.round(wA + wB + wC + wD + wE);
      tier = compositeScore <= 39 ? 'FOUNDATIONAL' : compositeScore <= 69 ? 'GROWTH' : 'SCALE';

      scoreBlock = `
CALCULATED SCORES:
  Dimension A (Audience Intel)      : ${dimA}/20  → weighted ${wA.toFixed(1)}/20
  Dimension B (Content Architecture): ${dimB}/20  → weighted ${wB.toFixed(1)}/20
  Dimension C (Conversion Infra)    : ${dimC}/25  → weighted ${wC.toFixed(1)}/25
  Dimension D (Distribution Engine) : ${dimD}/20  → weighted ${wD.toFixed(1)}/20
  Dimension E (Measurement)         : ${dimE}/15  → weighted ${wE.toFixed(1)}/15
  COMPOSITE SCORE: ${compositeScore}/100
  TIER: ${tier}
      `;
    }

    const diagnosticPrompt = `${knowledge ? `## Intelligence Base Context\n${knowledge.slice(0, 2000)}\n\n---\n\n` : ''}
## Content Maturity Diagnostic

Brand: ${brand}
${context ? `Context: ${context}` : ''}
${scoreBlock || `Client answers / description: ${typeof answers === 'string' ? answers : JSON.stringify(answers)}`}

You are Aether running a Content Maturity Diagnostic using the DigiFusion 5-dimension scorecard.

${compositeScore !== null
  ? `The calculated composite score is ${compositeScore}/100. The client is in the ${tier} tier.`
  : 'Based on the answers/description provided, assess the client\'s content maturity across the 5 dimensions. Estimate a composite score.'}

Produce a Diagnostic Report with:

1. EXECUTIVE DIAGNOSIS
   — One paragraph: what is the real strategic problem here?
   — The single most important insight from this diagnostic

2. DIMENSION BREAKDOWN
   — Score and 2-sentence commentary for each of the 5 dimensions
   — Identify the lowest-scoring dimension — this is the critical bottleneck

3. MATURITY TIER & COMMERCIAL IMPLICATION
   ${compositeScore !== null ? `Score: ${compositeScore}/100 — ${tier} tier` : ''}
   — What tier is this client in and why?
   — What is the commercial cost of staying at this maturity level?

4. PRESCRIBED ENGAGEMENT
   — Which C2C Pipeline phases apply (based on tier)
   — Specific activities to prioritise in each phase
   — Realistic timeline and investment range

5. THE STUCK MOMENT
   — The precise point in the content journey where this client is losing audience/revenue
   — One concrete example of what this looks like in their business

6. IMMEDIATE ACTION (THIS WEEK)
   — One action the client can take before the engagement begins that signals they are serious

Write as Aether — direct, specific, commercially grounded. No filler. Every sentence earns its place.`;

    const report = await this.runLLM(diagnosticPrompt, { skipKnowledge: true, skipMemory: false });

    // Save diagnostic to episodic memory
    await this.rememberEpisodic({
      summary:    `Content Maturity Diagnostic: ${brand} — Score: ${compositeScore ?? 'estimated'}/100, Tier: ${tier ?? 'assessed'}`,
      content:    { brand, compositeScore, tier, reportPreview: report.slice(0, 500) },
      type:       'diagnostic',
      tags:       ['diagnostic', 'c2c', 'content_maturity', brand],
      importance: 5,
    }).catch(() => {});

    return { report, compositeScore, tier, brand };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // C2C PIPELINE — Run individual phases or the full pipeline
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Phase 1: Run the Intelligence Audit for a brand.
   * Maps audience intent gaps using See-Think-Do-Care.
   */
  async runPhase1Audit(brand, context = '') {
    const knowledge = await synthesizer.answer(
      `Audience intent mapping and content gap analysis for ${brand}`,
      'aether', ['digital_media', 'business_development'],
    ).catch(() => '');

    const prompt = `${knowledge ? `## Intelligence Base\n${knowledge.slice(0, 2000)}\n\n---\n\n` : ''}
## Phase 1: The Intelligence Audit — See-Think-Do-Care Analysis

Brand: ${brand}
${context ? `Context: ${context}` : ''}

You are running Phase 1 of the Content-to-Capital Pipeline. Apply the See-Think-Do-Care framework rigorously.

Produce:
1. AUDIENCE INTENT MAP — For each STDC stage, describe:
   - Who is at this stage for ${brand}'s audience
   - What content they need
   - Where they look for it
   - Current gap (what ${brand} provides vs. what the audience needs)

2. CONTENT GAP ANALYSIS — Table format:
   - Stage | Content Type Needed | Currently Exists? | Priority Score (1–5)

3. THE STUCK MOMENT — Where exactly is the audience dropping off? Name the specific transition that is broken (e.g., "Most prospects are stuck between SEE and THINK — they discover the brand but have no reason to start comparing it seriously").

4. COMPETITOR CONTENT INTELLIGENCE — What are competitors doing at the under-served stages?

5. PHASE 1 RECOMMENDATIONS — Top 3 actions to close the most critical intent gaps, in priority order.

Be specific. Name content types, formats, topics. Do not produce a generic audit.`;

    return this.runLLM(prompt, { skipKnowledge: true });
  }

  /**
   * Phase 2: Build the Authority Engine (Pillar-and-Cluster architecture).
   */
  async runPhase2Authority(brand, topicArea, context = '') {
    const knowledge = await synthesizer.answer(
      `SEO content architecture, pillar pages, cluster content for ${topicArea}`,
      'aether', ['digital_media'],
    ).catch(() => '');

    const prompt = `${knowledge ? `## Intelligence Base\n${knowledge.slice(0, 2000)}\n\n---\n\n` : ''}
## Phase 2: The Authority Engine — Pillar-and-Cluster Architecture

Brand: ${brand}
Topic Area: ${topicArea}
${context ? `Context: ${context}` : ''}

Design the full Pillar-and-Cluster content architecture for ${brand} in the topic area: "${topicArea}".

Produce:
1. PILLAR PAGE BRIEF
   - Proposed title and URL slug
   - Target keyword (primary + 2 secondary)
   - Audience: who reads this and why
   - Structure: 8–10 H2 headings with 1-sentence description each
   - Word count target and content format recommendations

2. CLUSTER MAP — 10 cluster pages:
   - Cluster title | Target keyword | Search intent (STDC stage) | Format | Priority

3. INTERNAL LINK ARCHITECTURE — How pillar and clusters link to each other

4. QUICK WINS — Which 3 cluster pages should be produced first and why

5. AUTHORITY GAP — What existing content can be upgraded to fit this architecture?

Make this specific enough that a content writer could brief against it immediately.`;

    return this.runLLM(prompt, { skipKnowledge: true });
  }

  /**
   * Phase 3: Build the Conversion Funnel (RACE Framework KPI architecture).
   */
  async runPhase3Conversion(brand, currentMetrics = {}, context = '') {
    const knowledge = await synthesizer.answer(
      `RACE framework KPIs, email nurture, conversion funnels for ${brand}`,
      'aether', ['digital_media', 'business_development'],
    ).catch(() => '');

    const metricsBlock = Object.keys(currentMetrics).length
      ? `Current metrics provided:\n${Object.entries(currentMetrics).map(([k,v]) => `  ${k}: ${v}`).join('\n')}`
      : 'No current metrics provided — make reasonable assumptions and state them.';

    const prompt = `${knowledge ? `## Intelligence Base\n${knowledge.slice(0, 2000)}\n\n---\n\n` : ''}
## Phase 3: The Conversion Funnel — RACE KPI Architecture

Brand: ${brand}
${metricsBlock}
${context ? `Context: ${context}` : ''}

Design the full RACE conversion architecture for ${brand}.

Produce:
1. RACE KPI FRAMEWORK — For each stage (Reach, Act, Convert, Engage):
   - Primary KPI with formula
   - Current benchmark (if metrics provided) or industry benchmark
   - 90-day target
   - The content type that most directly drives this KPI

2. CONVERSION PATHWAY DESIGN — The specific sequence:
   [Traffic source] → [Content piece] → [Conversion action] → [Nurture step] → [Revenue event]

3. EMAIL NURTURE SEQUENCE — 5-email sequence for the primary lead magnet:
   - Email #, subject line, send timing, primary goal, CTA

4. CONVERSION BOTTLENECK DIAGNOSIS — Where is the biggest conversion leak? What single fix would have the highest ROI?

5. CONTENT-TO-REVENUE ATTRIBUTION MODEL — How to track which content pieces generate revenue (specific tools and tagging logic)`;

    return this.runLLM(prompt, { skipKnowledge: true });
  }

  /**
   * Phase 4: Build the Distribution Flywheel (Hub-and-Spoke).
   */
  async runPhase4Flywheel(brand, hubTopic, channels = [], context = '') {
    const defaultChannels = channels.length ? channels : ['LinkedIn', 'Newsletter', 'Blog', 'Instagram', 'YouTube Shorts'];

    const prompt = `## Phase 4: The Distribution Flywheel — Hub-and-Spoke Plan

Brand: ${brand}
Hub Topic: "${hubTopic}"
Target Channels: ${defaultChannels.join(', ')}
${context ? `Context: ${context}` : ''}

Design the full Hub-and-Spoke Distribution Flywheel for this Hub piece.

Produce:
1. HUB PIECE BRIEF
   - Recommended format (webinar / long guide / original research / video)
   - Working title and angle — what is the unique insight or data point that makes this worth reading?
   - Structure: key sections or questions it must answer
   - Production estimate: time and resources required

2. THE 10 SPOKES — For each spoke:
   - Format | Platform | Hook/Angle (different from the hub — not a summary) | CTA | Best publish day/time

3. REPURPOSING SOP — Step-by-step process:
   Step 1: Produce the Hub
   Step 2–10: How each spoke is extracted, adapted, and published

4. DISTRIBUTION CALENDAR — 4-week schedule showing when each spoke publishes after the Hub goes live

5. FLYWHEEL METRICS — How to measure if the flywheel is working:
   - Hub performance metric
   - Spoke-to-Hub click-through rate
   - Net new audience reached per cycle`;

    return this.runLLM(prompt, { skipKnowledge: true });
  }

  /**
   * Run the full Content-to-Capital Pipeline end-to-end for a brand.
   * Produces a comprehensive 4-phase digital media strategy.
   */
  async runFullPipeline(brand, options = {}) {
    const { audience, goals, channels, context, topicArea, hubTopic, currentMetrics } = options;

    const knowledge = await synthesizer.answer(
      `Digital media strategy and content frameworks for ${brand} — ${audience || ''} — ${goals || ''}`,
      'aether', ['digital_media', 'business_development', 'general'],
    ).catch(() => '');

    const prompt = `${knowledge ? `## DigiFusion Intelligence Base\n${knowledge.slice(0, 3000)}\n\n---\n\n` : ''}
## Full Content-to-Capital Pipeline Strategy

Brand: ${brand}
${audience ? `Target Audience: ${audience}` : ''}
${goals    ? `Business Goals: ${goals}` : ''}
${channels?.length ? `Primary Channels: ${channels.join(', ')}` : ''}
${context  ? `Additional Context: ${context}` : ''}

You are Aether. Produce a complete Content-to-Capital Pipeline strategy for ${brand}.
This must be specific, commercially grounded, and immediately actionable.
Ground every recommendation in the C2C framework phases. Cite the frameworks.

Structure:

# EXECUTIVE STRATEGY BRIEF
(One page — the single most important strategic insight and the 3 biggest opportunities)

# PHASE 1: THE INTELLIGENCE AUDIT
(STDC gap map, content gaps, the Stuck Moment, top 3 priorities)

# PHASE 2: THE AUTHORITY ENGINE
(2 pillar topics with full brief, 12 cluster topics mapped to STDC stages, quick wins)

# PHASE 3: THE CONVERSION FUNNEL
(RACE KPIs with targets, conversion pathway, 5-email nurture sequence structure)

# PHASE 4: THE DISTRIBUTION FLYWHEEL
(Monthly hub schedule for 90 days, spoke formats per channel, repurposing SOP summary)

# 90-DAY EXECUTION ROADMAP
(Phased action plan: Month 1 = Foundation, Month 2 = Authority, Month 3 = Conversion + Distribution)

# INVESTMENT CASE
(Estimated engagement tier based on diagnostic assessment, ROI logic, why now)

This is proprietary DigiFusion strategy. Write it as if it will be presented to the client's board.`;

    const result = await this.runLLM(prompt, { skipKnowledge: true });

    await this.rememberEpisodic({
      summary:    `Full C2C Pipeline strategy produced for ${brand}`,
      content:    { brand, audience, goals, preview: result.slice(0, 400) },
      type:       'strategy_output',
      tags:       ['c2c', 'full_pipeline', brand, 'digital_media'],
      importance: 5,
    }).catch(() => {});

    return { result, brand };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DIGITAL MEDIA FRAMEWORK SYNTHESIS — Build proprietary IP from the C2C lens
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Synthesise a proprietary digital media framework or playbook.
   * Always structured around the C2C Pipeline phases.
   * This is what the Agency IP tab calls for digital media playbooks.
   */
  async buildDigitalMediaFramework(frameworkName, options = {}) {
    const { domain = 'digital_media', instruction = '', targetAudience = '', industry = '' } = options;

    const [dmKnowledge, bdKnowledge] = await Promise.all([
      synthesizer.answer(
        `Digital media frameworks, content strategy, SEO, distribution for: ${frameworkName}`,
        'aether', ['digital_media', 'general'],
      ).catch(() => ''),
      synthesizer.answer(
        `Business development, consulting frameworks, market strategy for: ${frameworkName}`,
        'aether', ['business_development', 'automation'],
      ).catch(() => ''),
    ]);

    const prompt = `${dmKnowledge ? `## Digital Media Intelligence\n${dmKnowledge.slice(0, 2000)}\n\n---\n\n` : ''}
${bdKnowledge ? `## Business & BD Intelligence\n${bdKnowledge.slice(0, 1500)}\n\n---\n\n` : ''}
## DigiFusion Digital Media Framework Synthesis

Framework: "${frameworkName}"
${targetAudience ? `Target Audience: ${targetAudience}` : ''}
${industry ? `Industry: ${industry}` : ''}
${instruction ? `Additional instruction: ${instruction}` : ''}

You are Aether. Build a proprietary DigiFusion digital media framework using the Content-to-Capital Pipeline as the structural backbone.

This must be ORIGINAL IP — a genuine synthesis, not a summary of existing frameworks. Every phase must draw explicitly on the C2C methodology while being specifically tailored to "${frameworkName}".

RETURN ONLY a valid JSON object with this exact schema:
{
  "title": "Full framework title",
  "tagline": "One-line value proposition",
  "executive_summary": "3–5 sentences — the strategic insight this framework delivers",
  "c2c_application": "How each C2C phase applies specifically to this framework topic",
  "phases": [
    {
      "number": 1,
      "name": "Phase name",
      "c2c_source": "See-Think-Do-Care — The Intelligence Audit",
      "objective": "What this phase achieves for ${frameworkName}",
      "activities": ["activity 1", "activity 2", "activity 3", "activity 4"],
      "checklist": ["✓ checklist item 1", "✓ item 2", "✓ item 3", "✓ item 4", "✓ item 5"],
      "deliverable": "What the client receives",
      "duration": "Timeframe"
    },
    { "number": 2, "c2c_source": "Pillar-and-Cluster — The Authority Engine", "name": "...", "objective": "...", "activities": [], "checklist": [], "deliverable": "...", "duration": "..." },
    { "number": 3, "c2c_source": "RACE Framework — The Conversion Funnel", "name": "...", "objective": "...", "activities": [], "checklist": [], "deliverable": "...", "duration": "..." },
    { "number": 4, "c2c_source": "Hub-and-Spoke — The Distribution Flywheel", "name": "...", "objective": "...", "activities": [], "checklist": [], "deliverable": "...", "duration": "..." }
  ],
  "scorecard": {
    "title": "DigiFusion ${frameworkName} Diagnostic",
    "dimensions": [
      { "name": "Dimension A", "weight": 20, "diagnostic_question": "Question?", "scoring_guide": { "1": "Lowest", "3": "Average", "5": "Best-in-class" } },
      { "name": "Dimension B", "weight": 20, "diagnostic_question": "Question?", "scoring_guide": { "1": "...", "3": "...", "5": "..." } },
      { "name": "Dimension C", "weight": 25, "diagnostic_question": "Question?", "scoring_guide": { "1": "...", "3": "...", "5": "..." } },
      { "name": "Dimension D", "weight": 20, "diagnostic_question": "Question?", "scoring_guide": { "1": "...", "3": "...", "5": "..." } },
      { "name": "Dimension E", "weight": 15, "diagnostic_question": "Question?", "scoring_guide": { "1": "...", "3": "...", "5": "..." } }
    ],
    "maturity_bands": [
      { "band": "Foundational", "score_range": "0–39", "entry_point": "Phase 1+2", "price_range": "$3K–$5K" },
      { "band": "Growth",       "score_range": "40–69", "entry_point": "Phase 1+2+3", "price_range": "$5K–$9K" },
      { "band": "Scale",        "score_range": "70–100", "entry_point": "All 4 phases", "price_range": "$9K–$15K+" }
    ]
  },
  "templates": [
    { "name": "Template name", "derived_from": "C2C phase it comes from", "purpose": "What it helps the client do" }
  ],
  "differentiators": ["Point 1 — how this outperforms generic approaches", "Point 2", "Point 3"],
  "manifesto_line": "One powerful sentence that encapsulates the philosophy of this framework"
}`;

    let frameworkJson;
    try {
      const raw = await this.runLLM(prompt, { skipKnowledge: true, skipMemory: true });
      const cleaned = raw.replace(/^```[\w]*\n?/m, '').replace(/```\s*$/m, '').trim();
      frameworkJson = JSON.parse(cleaned);
    } catch (e) {
      console.warn('[Aether] JSON parse failed, returning prose:', e.message);
      return this.runLLM(prompt.replace('RETURN ONLY a valid JSON object', 'Write a structured framework document in markdown'), { skipKnowledge: true });
    }

    // ── Render JSON → rich Markdown ───────────────────────────────────────
    const f = frameworkJson;
    const sc = f.scorecard || {};

    const md = [
      `# ${f.title}`,
      `> ${f.tagline}`,
      '',
      `*${f.manifesto_line || ''}*`,
      '',
      `## Executive Summary`,
      f.executive_summary,
      '',
      `**C2C Framework Application:** ${f.c2c_application}`,
      '',
      `---`,
      '',
      `## The 4-Phase Methodology`,
      '',
      ...(f.phases || []).flatMap(ph => [
        `### Phase ${ph.number}: ${ph.name}`,
        `**Powered by:** ${ph.c2c_source}`,
        '',
        `**Objective:** ${ph.objective}`,
        '',
        `**Activities:**`,
        ...(ph.activities || []).map(a => `- ${a}`),
        '',
        `**Checklist:**`,
        ...(ph.checklist || []).map(c => `- ${c}`),
        '',
        `**Deliverable:** ${ph.deliverable}  |  **Duration:** ${ph.duration}`,
        '',
      ]),
      `---`,
      '',
      `## ${sc.title || 'Diagnostic Scorecard'}`,
      '',
      ...(sc.dimensions || []).flatMap(d => [
        `### ${d.name} *(${d.weight}%)*`,
        `*"${d.diagnostic_question}"*`,
        '',
        `| Score | Meaning |`,
        `|-------|---------|`,
        ...Object.entries(d.scoring_guide || {}).map(([s, m]) => `| **${s}** | ${m} |`),
        '',
      ]),
      `### Maturity Bands`,
      '',
      `| Band | Score | Entry Point | Investment |`,
      `|------|-------|-------------|------------|`,
      ...(sc.maturity_bands || []).map(b =>
        `| **${b.band}** | ${b.score_range} | ${b.entry_point} | ${b.price_range} |`
      ),
      '',
      `---`,
      '',
      `## Included Templates`,
      '',
      ...(f.templates || []).map(t => `- **${t.name}** *(${t.derived_from})* — ${t.purpose}`),
      '',
      `---`,
      '',
      `## Why This Framework Is Different`,
      '',
      ...(f.differentiators || []).map(d => `- ${d}`),
      '',
      `---`,
      `*Proprietary DigiFusion IP — Content-to-Capital Pipeline™ — ${frameworkName}*`,
    ].join('\n');

    return md;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONTENT PRODUCTION — Upgraded with C2C awareness
  // ══════════════════════════════════════════════════════════════════════════

  async produceContent(contentType, topic, options = {}) {
    const { audience, voiceNotes = '', callToAction = '', wordCount, stdcStage = '' } = options;

    const knowledge = await synthesizer.answer(
      `${contentType} best practices and content strategy for: ${topic}`,
      'aether', ['digital_media', 'general'],
    ).catch(() => '');

    const prompt = `${knowledge ? `## Intelligence Base\n${knowledge.slice(0, 1500)}\n\n---\n\n` : ''}
## Content Production: ${contentType.toUpperCase()}

Topic: ${topic}
Audience: ${audience || 'business professionals in digital transformation, automation, or media'}
STDC Stage: ${stdcStage || 'THINK — consideration and authority-building'}
${voiceNotes ? `Voice direction: ${voiceNotes}` : ''}
${callToAction ? `CTA: ${callToAction}` : ''}
${wordCount ? `Target length: ${wordCount} words` : ''}

You are Aether. Produce ${contentType} content that meets the standard of a piece that wins industry awards.

Requirements:
— Opens with a specific, counter-intuitive insight — not a definition or a question
— Every claim is either evidenced or explicitly framed as strategic opinion
— Written for a reader who knows their industry and will skip anything generic
— Serves the STDC stage: ${stdcStage || 'THINK — reader is evaluating, needs to be given a reason to trust us'}
— The CTA leads naturally from the content — it does not feel bolted on
— No AI vocabulary: no "delve," "tapestry," "multifaceted," "leverage" as a verb, "game-changing"
— Ends with a takeaway the reader can act on today

Produce the full content piece now.`;

    return this.runLLM(prompt, { skipKnowledge: true });
  }

  async repurposingPlan(pillarContent, channels = []) {
    const targetChannels = channels.length
      ? channels
      : ['LinkedIn', 'Newsletter', 'Twitter/X', 'YouTube Shorts', 'Podcast'];

    const prompt = `## Hub-and-Spoke Repurposing Plan

Hub content:
"""
${pillarContent.slice(0, 2000)}
"""

Target channels: ${targetChannels.join(', ')}

You are Aether running Phase 4 of the Content-to-Capital Pipeline. Extract maximum value from this Hub piece.

Produce:
1. HUB QUALITY ASSESSMENT — Is this Hub strong enough? What is its core insight?
2. THE 10 SPOKES — For each:
   - Platform | Format | Hook (NOT a summary — a fresh angle) | CTA | Ideal publish day
3. TOP 3 SPOKES (produce the actual content for these three)
4. PUBLISHING SEQUENCE — Week-by-week schedule for all 10 spokes
5. PERFORMANCE PREDICTION — Which spoke will drive the most email sign-ups and why`;

    return this.runLLM(prompt, { skipKnowledge: true, skipMemory: true });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE — Task dispatcher
  // ══════════════════════════════════════════════════════════════════════════

  async execute(task) {
    const { action, brand, topic, contentType, pillarContent, sessionId, answers, context,
            frameworkName, topicArea, hubTopic, channels, audience, goals } = task;

    let result;
    switch (action) {
      case 'strategy_session':
        result = await this.strategySession(
          task.message || task.description,
          sessionId || `session-${Date.now()}`,
          { brand, topic, goals }
        );
        break;

      case 'get_session_notes':
        result = await this.getSessionNotes(sessionId);
        break;

      case 'diagnostic':
        result = await this.runDiagnostic(brand || task.title, answers || task.answers || '', context || task.description);
        break;

      case 'full_pipeline':
        result = await this.runFullPipeline(brand || task.title, { audience, goals, channels, context, topicArea, hubTopic });
        break;

      case 'phase1_audit':
        result = { result: await this.runPhase1Audit(brand || task.title, context || task.description) };
        break;

      case 'phase2_authority':
        result = { result: await this.runPhase2Authority(brand || task.title, topicArea || topic || task.title, context) };
        break;

      case 'phase3_conversion':
        result = { result: await this.runPhase3Conversion(brand || task.title, task.currentMetrics || {}, context) };
        break;

      case 'phase4_flywheel':
        result = { result: await this.runPhase4Flywheel(brand || task.title, hubTopic || topic || task.title, channels || [], context) };
        break;

      case 'build_framework':
        result = { result: await this.buildDigitalMediaFramework(frameworkName || task.title, { domain: 'digital_media', instruction: task.description, targetAudience: audience, industry: task.industry }) };
        break;

      case 'produce_content':
        result = { result: await this.produceContent(contentType || 'blog post', topic || task.title, {
          audience, voiceNotes: task.voiceNotes, callToAction: task.callToAction, wordCount: task.wordCount, stdcStage: task.stdcStage,
        }) };
        break;

      case 'repurposing_plan':
        result = { result: await this.repurposingPlan(pillarContent || task.description, channels || []) };
        break;

      default:
        // Default: strategy session mode — Aether as co-strategist
        result = await this.strategySession(
          task.description || task.title,
          sessionId || `task-${task.id || Date.now()}`,
          { brand, topic: task.title, goals }
        );
    }

    await this.rememberEpisodic({
      summary:    `Completed ${action || 'strategy session'}: "${(task.title || '').slice(0, 80)}"`,
      content:    { action, brand, topic, resultLength: typeof result === 'string' ? result.length : JSON.stringify(result).length },
      type:       'task_result',
      tags:       ['aether', 'digital_media', action, brand].filter(Boolean),
      importance: 3,
      taskId:     task.id,
    }).catch(() => {});

    return typeof result === 'string' ? { result } : result;
  }
}

export const aether = new Aether();
