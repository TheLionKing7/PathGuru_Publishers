/**
 * DigiFusion Intelligence Network — Atlas
 * =========================================
 * Research & Business Development Agent
 *
 * Atlas is the firm's intelligence officer and deal architect.
 * It conducts deep market research, competitive analysis, and BD strategy —
 * producing the research briefs, prospect intelligence, and methodology
 * frameworks that underpin every client engagement.
 */

import { AgentBase }       from './agentBase.js';
import { callAiProvider, resolveResearchProvider }  from '../aiPipeline.js';
import { synthesizer }     from './synthesizer.js';
import { runDeepResearch } from '../skills/research.js';
import { buildConsultingDoc } from '../skills/docBuilder.js';

const ATLAS_SYSTEM = `You are Atlas — the Research and Business Development intelligence agent for DigiFusion.

DigiFusion operates at the intersection of automation, business development, and digital media for ambitious organisations globally.

Your character:
You are rigorous, commercially sharp, and intellectually honest. You do not produce generic market summaries. You produce intelligence — specific, sourced, actionable findings that give the firm and its clients a genuine competitive edge. When you do not have sufficient data to make a claim, you say so and identify what is missing.

Your capabilities:
— Market research: industry trends, competitive landscapes, market sizing
— BD intelligence: prospect analysis, deal qualification, opportunity mapping
— Framework development: proprietary methodology design using best-in-class inputs
— Research reports: structured, consultant-grade papers with clear executive summaries
— Competitive benchmarking: how client capabilities stack against market leaders
— Opportunity briefs: where the market is going and what positions to take

How you work:
You always draw on the firm's knowledge base first (Synthesizer provides this context). You supplement with live research when available. You structure every output with: an executive summary, supporting evidence, implications, and recommended next steps. You cite your sources.

You write in a voice that is authoritative without being arrogant — the voice of a senior partner who has earned the right to be direct.`;


export class Atlas extends AgentBase {
  constructor() {
    super({
      id:           'atlas',
      displayName:  'Atlas',
      role:         'Research & Business Development',
      systemPrompt: ATLAS_SYSTEM,
      domains:      ['business_development', 'general'],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CORE CAPABILITIES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Produce a market research brief on a given topic.
   * Uses Tavily (discovery) + Firecrawl (full-content depth) pipeline.
   */
  async research(topic, options = {}) {
    const {
      audience         = 'senior consultant',
      includeFrameworks = true,
      researchType     = 'market',
      depth            = 2,
    } = options;

    console.log(`[Atlas] Starting deep research: "${topic}" (depth ${depth}, type: ${researchType})`);

    // ── Layer 1: Knowledge base from Synthesizer ──────────────────────────
    const knowledge = await synthesizer.answer(
      `Market research and frameworks for: ${topic}`,
      'atlas',
      ['business_development', 'general'],
    );

    // ── Layer 2: Live research (Tavily discovery + Firecrawl deep scrape) ─
    let liveResearch = null;
    try {
      liveResearch = await runDeepResearch(topic, { audience, researchType, depth });
      console.log(`[Atlas] Research complete — ${liveResearch.stats.fullyScrapped} sources read in full, ${liveResearch.stats.snippetSources} snippets`);
    } catch (e) {
      console.warn('[Atlas] Live research failed:', e.message);
    }

    const prompt = `${knowledge ? `## Intelligence from our knowledge base\n${knowledge}\n\n---\n\n` : ''}
${liveResearch?.brief ? `## Live research (Tavily + Firecrawl)\n${liveResearch.brief.slice(0, 12000)}\n\n---\n\n` : ''}
## Research brief request

Topic: ${topic}
Audience: ${audience}
${includeFrameworks ? 'Include relevant frameworks and methodologies.' : ''}
${liveResearch ? `Research stats: ${liveResearch.stats.fullyScrapped} sources read in full, ${liveResearch.stats.snippetSources} additional snippets` : ''}

Produce a structured research brief at the standard of a KPMG or BCG published report:

1. Executive Summary (3–5 sentences — lead with the single most important insight)
2. Market Context (size, growth, key dynamics — cite specific figures from the research above)
3. Key Findings (6–8 substantive points, each with direct evidence from the sources)
4. Frameworks & Models (name and explain the most relevant methodologies)
5. Competitive Landscape (who is leading, emerging, and why — specific companies/names)
6. Implications for DigiFusion (what this means for our work and our clients)
7. Recommended Actions (3–5 specific, sequenced next steps)
8. Sources (cite the key sources used)

Every claim must be supported by evidence from the research above. No invented data. No generic filler.`;

    const reportText = await this.runLLM(prompt, { skipKnowledge: true, skipMemory: false });

    // ── Layer 3: Build consulting document if requested ────────────────────
    let document = null;
    const docType  = options.docType  || (researchType === 'market' ? 'research-paper' : 'market-brief');
    const docFormat = options.docFormat || 'docx';

    if (options.buildDoc !== false) {  // build doc by default; pass buildDoc: false to skip
      try {
        document = await buildConsultingDoc({
          content:  reportText,
          title:    topic,
          subtitle: `${docType === 'market-brief' ? 'Market Intelligence' : 'Research Brief'} — ${new Date().getFullYear()}`,
          docType,
          format:   docFormat,
          author:   'Atlas — DigiFusion Intelligence Network',
          client:   options.client || '',
        });
        console.log(`[Atlas] Document built: ${document.filename} (${document.format})`);
      } catch (e) {
        console.warn('[Atlas] Document build error:', e.message);
      }
    }

    return { result: reportText, document, sources: liveResearch?.sources || [] };
  }

  /**
   * Analyse a prospect for BD qualification and deal strategy.
   */
  async analysePropect(companyName, context = '') {
    const knowledge = await synthesizer.answer(
      `BD frameworks for qualifying and engaging ${companyName} type prospects`,
      'atlas',
      ['business_development'],
    );

    const prompt = `${knowledge ? `## Relevant BD frameworks\n${knowledge}\n\n---\n\n` : ''}
## Prospect Analysis: ${companyName}

Context provided: ${context || 'None'}

Produce a structured prospect intelligence brief:
1. Company Profile (what they do, scale, market position)
2. Likely Pain Points (based on company type and context)
3. Decision-Maker Map (who would sponsor this engagement, who would use it, who might block)
4. Value Proposition Fit (which DigiFusion services are strongest match and why)
5. Engagement Strategy (how to approach: what to lead with, what insight to offer)
6. Red Flags (risks to the deal or engagement)
7. Recommended First Move (specific, actionable)

Apply the Challenger Sale approach — what insight would force them to rethink their status quo?`;

    return this.runLLM(prompt, { skipKnowledge: true, skipMemory: false });
  }

  /**
   * Build a proprietary framework by synthesising source materials.
   */
  async buildFramework(frameworkName, domain, instruction) {
    const knowledge = await synthesizer.answer(
      `Frameworks, methodologies, and models for: ${domain} — ${frameworkName}`,
      'atlas',
      ['business_development', 'general'],
    );

    const prompt = `${knowledge ? `## Source frameworks from intelligence base\n${knowledge}\n\n---\n\n` : ''}
## Framework Development Request

Framework name: ${frameworkName}
Domain: ${domain}
Instruction: ${instruction}

Produce a proprietary DigiFusion framework:
1. Framework Overview (what it is, what problem it solves, who it is for)
2. The Phases / Pillars (4–6 components with clear names and descriptions)
3. Diagnostic Questions (5–10 questions to assess a client's current state)
4. Scoring / Maturity Logic (how to grade the client's position)
5. Deliverables per Phase (what the client gets at each stage)
6. Differentiation (how this is superior to the standard approaches)
7. Visual Structure Description (how this would look as a diagram or framework card)

This should be original, proprietary IP — not a restatement of existing frameworks.
It must synthesise the source material into something distinctly DigiFusion's own.`;

    return this.runLLM(prompt, { skipKnowledge: true, skipMemory: false });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE
  // ══════════════════════════════════════════════════════════════════════════

  async execute(task) {
    const { action, topic, company, context, frameworkName, domain, instruction } = task;

    let result;
    switch (action) {
      case 'research':
        result = await this.research(topic, { depth: task.depth, audience: task.audience });
        break;
      case 'prospect_analysis':
        result = await this.analysePropect(company || topic, context);
        break;
      case 'build_framework':
        result = await this.buildFramework(frameworkName || topic, domain || 'business_development', instruction || task.description);
        break;
      default:
        result = await this.runLLM(task.description || task.title, { knowledgeQuery: task.title });
    }

    await this.rememberEpisodic({
      summary:    `Completed ${action || 'task'}: "${(task.title || '').slice(0, 80)}"`,
      content:    { action, topic, resultLength: result?.length },
      type:       'task_result',
      tags:       ['research', 'bd', action].filter(Boolean),
      importance: 3,
      taskId:     task.id,
    });

    return { result };
  }
}

export const atlas = new Atlas();
