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
import { callAiProvider }  from '../aiPipeline.js';
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
   * Build a proprietary DigiFusion playbook/framework.
   *
   * Design logic (from DigiFusion Playbook Formula):
   *   Phase 1 — Audit/Diagnostic  : BCG DAI assessment logic
   *   Phase 2 — Setup/Infrastructure: AWS CAF technical approach
   *   Phase 3 — Execution/Iteration : IBM Garage agile speed
   *
   * Output is a STRUCTURED JSON object (not free-form prose) so every field
   * is guaranteed to be present and machine-readable.  After the framework is
   * built, a second AI call generates Mermaid.js visualisation code.
   *
   * @returns {string} Markdown-formatted playbook rendered from the JSON
   */
  async buildFramework(frameworkName, domain, instruction) {
    // ── Step 1: Pull knowledge from ALL relevant domains ─────────────────
    const [bdKnowledge, dmKnowledge] = await Promise.all([
      synthesizer.answer(
        `Consulting frameworks, assessment models, and methodologies for: ${frameworkName}`,
        'atlas',
        ['business_development', 'general'],
      ),
      synthesizer.answer(
        `Digital marketing, content strategy, and automation frameworks for: ${frameworkName}`,
        'atlas',
        ['digital_media', 'automation'],
      ),
    ]);

    const knowledgeBlock = [
      bdKnowledge ? `## Business & BD Intelligence\n${bdKnowledge}` : '',
      dmKnowledge ? `## Digital Media & Automation Intelligence\n${dmKnowledge}` : '',
    ].filter(Boolean).join('\n\n---\n\n');

    // ── Step 2: Enforce structured JSON output ───────────────────────────
    const structurePrompt = `${knowledgeBlock ? `${knowledgeBlock}\n\n---\n\n` : ''}
## DigiFusion Playbook Synthesis Request

Framework name: "${frameworkName}"
Domain: ${domain}
Additional instruction: ${instruction || 'none'}

You are producing a proprietary DigiFusion consulting playbook.
Follow the DigiFusion 3-Phase Formula exactly:
  Phase 1 = The Audit      (BCG DAI diagnostic logic — assess current state)
  Phase 2 = The Setup      (AWS CAF technical infrastructure approach)
  Phase 3 = The Execution  (IBM Garage agile iteration and speed)

The secret differentiator: this is not just a playbook — it is a DIAGNOSTIC TOOL.
The scorecard turns client answers into a personalised roadmap. Design it as something DigiFusion sells, not gives away.

Return ONLY a valid JSON object matching this EXACT schema (no markdown fences, no commentary):

{
  "title": "Full playbook title",
  "tagline": "One-line value proposition — what transformation this delivers",
  "executive_summary": "3–5 sentences. Lead with the single most important insight. Who this is for, what it solves, why now.",
  "phases": [
    {
      "number": 1,
      "name": "Phase name (e.g. The Digital Audit)",
      "label": "BCG DAI — Diagnostic Logic",
      "objective": "What this phase achieves",
      "methodology": "Which source framework(s) power this phase and how",
      "activities": ["activity 1", "activity 2", "activity 3", "activity 4"],
      "checklist": ["✓ item 1", "✓ item 2", "✓ item 3", "✓ item 4", "✓ item 5"],
      "deliverable": "What the client receives at the end of this phase",
      "duration": "Typical timeframe"
    },
    { "number": 2, "name": "...", "label": "AWS CAF — Infrastructure", "objective": "...", "methodology": "...", "activities": [], "checklist": [], "deliverable": "...", "duration": "..." },
    { "number": 3, "name": "...", "label": "IBM Garage — Agile Execution", "objective": "...", "methodology": "...", "activities": [], "checklist": [], "deliverable": "...", "duration": "..." }
  ],
  "scorecard": {
    "title": "DigiFusion [Framework Name] Diagnostic Scorecard",
    "purpose": "How this scorecard is used in a client engagement",
    "dimensions": [
      {
        "name": "Dimension name (e.g. Strategic Clarity)",
        "weight": 20,
        "description": "What this dimension measures",
        "diagnostic_question": "The client-facing question that surfaces this score",
        "scoring_guide": {
          "1": "Description of score 1 (lowest — completely unprepared)",
          "2": "Description of score 2",
          "3": "Description of score 3 (average)",
          "4": "Description of score 4",
          "5": "Description of score 5 (highest — best-in-class)"
        }
      }
    ],
    "maturity_bands": [
      { "band": "Nascent",      "score_range": "0–39",  "description": "What this means for the client", "recommended_entry_point": "Which phase to start" },
      { "band": "Developing",   "score_range": "40–59", "description": "...", "recommended_entry_point": "..." },
      { "band": "Established",  "score_range": "60–74", "description": "...", "recommended_entry_point": "..." },
      { "band": "Advanced",     "score_range": "75–89", "description": "...", "recommended_entry_point": "..." },
      { "band": "Best-in-Class","score_range": "90–100","description": "...", "recommended_entry_point": "..." }
    ],
    "scoring_formula": "Explain how dimension scores are combined into a final score (e.g. weighted average × 20)"
  },
  "diagnostic_questions": [
    { "number": 1, "question": "Client-facing diagnostic question", "maps_to": "Which scorecard dimension", "insight": "What the answer reveals about the client" }
  ],
  "differentiators": ["Point 1: how this is superior to generic frameworks", "Point 2", "Point 3"],
  "recommended_charts": [
    { "name": "Chart name (e.g. Maturity Heatmap)", "type": "heatmap | bar | radar | matrix | scatter", "x_axis": "What goes on X axis", "y_axis": "What goes on Y axis", "data_points": "What data to plot", "insight": "What this chart reveals" }
  ],
  "visual_structure": "Description of how the full framework looks as a diagram — shapes, flow, colour coding"
}

Rules:
- scorecard.dimensions must have exactly 5 dimensions, each with weight 20 (sums to 100)
- diagnostic_questions must have 8–10 questions
- recommended_charts must have exactly 5 charts
- phases must have exactly 3 phases
- All arrays must be populated — no empty arrays
- Write in authoritative consultant-grade English
- This is proprietary DigiFusion IP — original synthesis, not a restatement`;

    // Call AI and parse the enforced JSON
    let playbookJson;
    try {
      const raw = await this.runLLM(structurePrompt, { skipKnowledge: true, skipMemory: true, forceJson: true });
      // Strip any accidental markdown fences
      const cleaned = raw.replace(/^```[\w]*\n?/m, '').replace(/```\s*$/m, '').trim();
      playbookJson = JSON.parse(cleaned);
    } catch (e) {
      console.warn('[Atlas] Structured JSON parse failed, falling back to prose:', e.message);
      // Fallback: return the raw text rather than crashing
      return this.runLLM(structurePrompt.replace('Return ONLY a valid JSON object', 'Return well-structured markdown'), { skipKnowledge: true });
    }

    // ── Step 3: Generate Mermaid.js flowchart ────────────────────────────
    let mermaidChart = '';
    try {
      const mermaidPrompt = `Based on this consulting framework, generate clean Mermaid.js flowchart code that visualises the 3-phase journey from diagnostic to execution.

Framework: ${playbookJson.title}
Phase 1: ${playbookJson.phases[0]?.name} — ${playbookJson.phases[0]?.objective}
Phase 2: ${playbookJson.phases[1]?.name} — ${playbookJson.phases[1]?.objective}
Phase 3: ${playbookJson.phases[2]?.name} — ${playbookJson.phases[2]?.objective}
Maturity bands: ${playbookJson.scorecard?.maturity_bands?.map(b => b.band).join(' → ')}

Return ONLY valid Mermaid.js code starting with "flowchart TD" or "flowchart LR". No explanation. No markdown fences.
The chart should show: entry (client) → diagnostic scorecard → maturity band → recommended phase entry → phase 1 → phase 2 → phase 3 → outcome/deliverable.
Use subgraphs to group the scorecard bands. Keep node labels short (max 6 words).`;

      const { resolveProvider: _rp } = await import('../aiPipeline.js');
      const provider = _rp('cerebras') || _rp('claude') || _rp('deepseek');
      if (provider) {
        mermaidChart = await callAiProvider(provider, mermaidPrompt,
          'You generate clean, valid Mermaid.js diagram code. Return only the diagram code with no explanation.');
        // Ensure it starts correctly
        if (!mermaidChart.trim().startsWith('flowchart') && !mermaidChart.trim().startsWith('graph')) {
          const match = mermaidChart.match(/(flowchart|graph)[\s\S]+/);
          mermaidChart = match ? match[0] : '';
        }
      }
    } catch (e) {
      console.warn('[Atlas] Mermaid generation failed:', e.message);
    }

    // ── Step 4: Render structured JSON → rich Markdown ──────────────────
    const p = playbookJson;
    const sc = p.scorecard || {};

    const md = [
      `# ${p.title}`,
      `> ${p.tagline}`,
      '',
      `## Executive Summary`,
      p.executive_summary,
      '',
      `---`,
      '',
      `## The DigiFusion 3-Phase Framework`,
      '',
      ...(p.phases || []).flatMap(ph => [
        `### Phase ${ph.number}: ${ph.name}`,
        `**Methodology:** ${ph.label} — ${ph.methodology}`,
        '',
        `**Objective:** ${ph.objective}`,
        '',
        `**Key Activities:**`,
        ...(ph.activities || []).map(a => `- ${a}`),
        '',
        `**Actionable Checklist:**`,
        ...(ph.checklist || []).map(c => `- ${c}`),
        '',
        `**Deliverable:** ${ph.deliverable}`,
        `**Duration:** ${ph.duration}`,
        '',
      ]),
      `---`,
      '',
      `## ${sc.title || 'Diagnostic Scorecard'}`,
      '',
      `**Purpose:** ${sc.purpose}`,
      '',
      `**Scoring Formula:** ${sc.scoring_formula}`,
      '',
      `### Scorecard Dimensions`,
      '',
      ...(sc.dimensions || []).flatMap(d => [
        `#### ${d.name} *(Weight: ${d.weight}%)*`,
        `${d.description}`,
        '',
        `**Diagnostic Question:** *"${d.diagnostic_question}"*`,
        '',
        `| Score | Meaning |`,
        `|-------|---------|`,
        ...Object.entries(d.scoring_guide || {}).map(([score, meaning]) => `| **${score}** | ${meaning} |`),
        '',
      ]),
      `### Maturity Bands`,
      '',
      `| Band | Score | Description | Entry Point |`,
      `|------|-------|-------------|-------------|`,
      ...(sc.maturity_bands || []).map(b =>
        `| **${b.band}** | ${b.score_range} | ${b.description} | ${b.recommended_entry_point} |`
      ),
      '',
      `---`,
      '',
      `## Diagnostic Questions`,
      '',
      ...(p.diagnostic_questions || []).map(q =>
        `**${q.number}. ${q.question}**\n*Maps to: ${q.maps_to} — ${q.insight}*\n`
      ),
      `---`,
      '',
      `## Why This Framework Is Different`,
      '',
      ...(p.differentiators || []).map(d => `- ${d}`),
      '',
      `---`,
      '',
      `## Recommended Diagnostic Charts`,
      '',
      ...(p.recommended_charts || []).flatMap(c => [
        `### ${c.name} *(${c.type})*`,
        `- **X-axis:** ${c.x_axis}`,
        `- **Y-axis:** ${c.y_axis}`,
        `- **Data points:** ${c.data_points}`,
        `- **Insight:** ${c.insight}`,
        '',
      ]),
      `---`,
      '',
      `## Visual Structure`,
      '',
      p.visual_structure,
      '',
      ...(mermaidChart ? [
        `---`,
        '',
        `## Framework Flowchart`,
        '',
        '```mermaid',
        mermaidChart.trim(),
        '```',
        '',
      ] : []),
      `---`,
      `*Proprietary DigiFusion IP — synthesised from BCG DAI, AWS CAF, IBM Garage and the DigiFusion intelligence base.*`,
    ].join('\n');

    return md;
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
