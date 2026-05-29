/**
 * DigiFusion Intelligence Network — Aether
 * ==========================================
 * Content Strategy & Digital Media Agent
 *
 * Aether builds the content architectures, media strategies, and
 * publishing systems that give DigiFusion and its clients a dominant
 * voice in their markets.
 */

import { AgentBase }      from './agentBase.js';
import { callAiProvider } from '../aiPipeline.js';
import { synthesizer }    from './synthesizer.js';

const AETHER_SYSTEM = `You are Aether — the Content Strategy and Digital Media agent for DigiFusion.

Your character:
You are a content architect and media strategist with the sensibility of an editor and the commercial instincts of a growth marketer. You understand that great content is not produced by accident — it is the output of a system: a clear audience, a defined voice, a distribution strategy, and a measurement framework.

You do not produce content for its own sake. Every piece you design or produce is in service of a business objective — building authority, generating demand, nurturing prospects, or converting attention into revenue.

Your capabilities:
— Content strategy: full-funnel content architecture, topic authority mapping, editorial calendars
— Brand voice: defining and maintaining a consistent, distinctive voice across all channels
— Digital media production: blog posts, social content, newsletters, video scripts, podcast outlines
— SEO strategy: keyword architecture, pillar-cluster model, on-page optimisation briefs
— Distribution strategy: how content reaches the right audience on the right channels
— Content-to-capital: turning content assets into revenue-generating IP (playbooks, courses, reports)
— Analytics interpretation: what the content data is saying and what to do about it

How you work:
You think in systems, not in single pieces. When asked to produce content, you always consider: who is this for, what stage of the journey are they at, what should they do next? You write with precision and authority — never padded, never generic, never AI-sounding.

You are the guardian of DigiFusion's voice and the architect of its content authority.`;


export class Aether extends AgentBase {
  constructor() {
    super({
      id:           'aether',
      displayName:  'Aether',
      role:         'Content Strategy & Digital Media',
      systemPrompt: AETHER_SYSTEM,
      domains:      ['digital_media', 'general'],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CORE CAPABILITIES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build a content strategy for a brand or campaign.
   */
  async buildContentStrategy(brand, options = {}) {
    const { audience, goals, channels = [], timeframe = '90 days' } = options;

    const knowledge = await synthesizer.answer(
      `Content strategy frameworks and digital media methodologies for ${brand}`,
      'aether',
      ['digital_media', 'general'],
    );

    const prompt = `${knowledge ? `## Relevant content frameworks from intelligence base\n${knowledge}\n\n---\n\n` : ''}
## Content Strategy Request

Brand: ${brand}
Target audience: ${audience || 'not specified — infer from context'}
Business goals: ${goals || 'not specified — recommend based on typical consulting firm objectives'}
Primary channels: ${channels.length ? channels.join(', ') : 'to be recommended'}
Timeframe: ${timeframe}

Produce a comprehensive content strategy:

1. Audience Intelligence
   — Primary persona (who they are, what they care about, where they spend time)
   — Content consumption habits and preferred formats

2. Content Architecture
   — Topic pillars (3–5 core themes that define authority)
   — Pillar → cluster structure for SEO and depth
   — Content types per stage (awareness, consideration, decision)

3. Brand Voice Guide
   — Tone descriptors (5 words that define the voice)
   — What the brand always does / never does in content
   — Example sentence pairs (generic vs. on-brand)

4. Channel Strategy
   — Primary and secondary channels with rationale
   — Content formats per channel
   — Posting cadence and timing

5. Editorial Calendar Framework
   — Monthly themes tied to business objectives
   — Content mix percentages (educational / promotional / social proof)
   — Repurposing logic (one idea → multiple formats)

6. Distribution & Amplification
   — Organic distribution plan
   — Paid amplification triggers (when to boost and what)
   — Partnership and co-creation opportunities

7. Measurement Framework
   — 3–5 KPIs with targets
   — Review cadence

Write at the level of a senior content strategist's onboarding deliverable for a new client.`;

    return this.runLLM(prompt, { skipKnowledge: true });
  }

  /**
   * Produce a piece of content (blog post, social, newsletter, etc.)
   */
  async produceContent(contentType, topic, options = {}) {
    const { audience, voiceNotes = '', callToAction = '', wordCount } = options;

    // Pull context from the publishing pipeline's existing persona system
    let personaContext = '';
    try {
      const { selectPersonaForNiche } = await import('../skills/personas.js');
      const { describePersona }       = await import('../skills/personaPrompt.js');
      const persona = selectPersonaForNiche(topic);
      if (persona) personaContext = describePersona(persona);
    } catch {}

    const knowledge = await synthesizer.answer(
      `${contentType} on: ${topic}`,
      'aether',
      ['digital_media', 'general'],
    );

    const prompt = `${personaContext ? `${personaContext}\n\n---\n\n` : ''}
${knowledge ? `## Relevant knowledge and context\n${knowledge}\n\n---\n\n` : ''}
## Content Production Request

Type: ${contentType}
Topic: ${topic}
Audience: ${audience || 'business professionals interested in automation, BD, and digital media'}
${voiceNotes ? `Voice notes: ${voiceNotes}` : ''}
${callToAction ? `Call to action: ${callToAction}` : ''}
${wordCount ? `Target word count: ${wordCount}` : ''}

Produce high-quality ${contentType} content. Requirements:
— Specific, not generic — cite real frameworks, real data, real examples
— Authoritative voice — do not explain obvious things
— Every paragraph earns its place — no padding
— Opens with a compelling hook, not a definition or history lesson
— Ends with a clear, specific call to action or takeaway`;

    return this.runLLM(prompt, { skipKnowledge: true });
  }

  /**
   * Design a content repurposing plan for a pillar piece.
   */
  async repurposingPlan(pillarContent, channels = []) {
    const prompt = `## Content Repurposing Plan

Original pillar content:
"""
${pillarContent.slice(0, 1500)}...
"""

Target channels: ${channels.length ? channels.join(', ') : 'LinkedIn, Twitter/X, Newsletter, YouTube, Podcast'}

Design a full repurposing plan:
1. Extract 5–7 key insights from the pillar content
2. For each insight, specify:
   — LinkedIn post (hook + body + CTA, max 300 words)
   — Twitter/X thread (5–8 tweets)
   — Newsletter paragraph
   — Short-form video script (60–90 seconds)
3. Produce the actual content for the top 2 insights across all formats
4. Suggest a publishing sequence and timing`;

    return this.runLLM(prompt, { skipKnowledge: true, skipMemory: true });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE
  // ══════════════════════════════════════════════════════════════════════════

  async execute(task) {
    const { action, brand, topic, contentType, pillarContent } = task;

    let result;
    switch (action) {
      case 'content_strategy':
        result = await this.buildContentStrategy(brand || task.title, {
          audience:  task.audience,
          goals:     task.goals,
          channels:  task.channels,
          timeframe: task.timeframe,
        });
        break;
      case 'produce_content':
        result = await this.produceContent(contentType || 'blog post', topic || task.title, {
          audience:    task.audience,
          voiceNotes:  task.voiceNotes,
          callToAction: task.callToAction,
          wordCount:   task.wordCount,
        });
        break;
      case 'repurposing_plan':
        result = await this.repurposingPlan(pillarContent || task.description, task.channels || []);
        break;
      default:
        result = await this.runLLM(task.description || task.title, { knowledgeQuery: task.title });
    }

    await this.rememberEpisodic({
      summary:    `Completed ${action || 'task'}: "${(task.title || '').slice(0, 80)}"`,
      content:    { action, topic, brand, resultLength: result?.length },
      type:       'task_result',
      tags:       ['content', 'media', action].filter(Boolean),
      importance: 3,
      taskId:     task.id,
    });

    return { result };
  }
}

export const aether = new Aether();
