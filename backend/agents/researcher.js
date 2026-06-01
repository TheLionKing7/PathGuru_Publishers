/**
 * DigiFusion Intelligence Network — Researcher
 * =============================================
 * The dedicated web intelligence agent.
 *
 * Responsibilities:
 *   1. Web Discovery   — Tavily: targeted queries, ranked URLs, AI summaries
 *   2. Deep Scraping   — Firecrawl: full content extraction from priority sources
 *   3. Perplexity      — real-time grounded answers when Tavily isn't available
 *   4. KB Merge        — hands raw findings to Synthesizer to merge with internal KB
 *   5. Brief Delivery  — returns a single enriched research brief to the requester
 *
 * The Researcher never stores to the knowledge base directly — that is
 * Synthesizer's job. Researcher crawls, Synthesizer absorbs and enriches.
 *
 * Called by:
 *   — Nexus (orchestration dispatch for knowledge-gap tasks)
 *   — Atlas (market + competitive research)
 *   — Nova  (technical landscape scanning)
 *   — Aether (content trend research)
 *   — Publisher pipeline (book/playbook research phase)
 */

import { AgentBase }    from './agentBase.js';
import { callAiProvider, resolveProvider } from '../aiPipeline.js';

const RESEARCHER_SYSTEM = `You are Researcher — the web intelligence specialist of the DigiFusion Intelligence Network.

Your job is to find, extract, and synthesize real-world intelligence from the web. You work with:
— Tavily: targeted search queries with AI summaries and ranked source URLs
— Firecrawl: full-content scraping of priority sources (McKinsey, HBR, Gartner, etc.)
— Perplexity: real-time grounded answers with citations

You do not generate opinions or creative content. You find facts, frameworks, data, and expert perspectives — then synthesize them into a clean, actionable intelligence brief.

Every brief you deliver must:
1. Be grounded in real sources (cite them)
2. Include specific data points, statistics, or frameworks where found
3. Identify the most credible and relevant findings
4. Flag any conflicting perspectives or data gaps
5. Be structured for the requesting agent's specific use case

You serve Atlas (BD research), Nova (technical research), Aether (content trends), the Publisher pipeline (book research), and Nexus (any ad hoc intelligence request).`;

const TAVILY_BASE    = 'https://api.tavily.com';
const FIRECRAWL_BASE = 'https://api.firecrawl.dev';
const PERPLEXITY_BASE = 'https://api.perplexity.ai';

// High-value domains to prioritise for deep scraping
const PRIORITY_DOMAINS = [
  'mckinsey.com', 'bcg.com', 'bain.com', 'kpmg.com', 'pwc.com', 'deloitte.com',
  'hbr.org', 'mit.edu', 'stanford.edu', 'weforum.org', 'gartner.com', 'forrester.com',
  'smartinsights.com', 'hubspot.com', 'ibm.com', 'accenture.com',
  'statista.com', 'reuters.com', 'bloomberg.com', 'ft.com', 'economist.com',
];

const SKIP_SCRAPE_DOMAINS = [
  'pinterest.com', 'quora.com', 'reddit.com', 'twitter.com', 'x.com',
  'instagram.com', 'facebook.com', 'tiktok.com', 'youtube.com', 'amazon.com',
];

export class Researcher extends AgentBase {
  constructor() {
    super({
      id:           'researcher',
      displayName:  'Researcher',
      role:         'Web Intelligence & Research Specialist',
      systemPrompt: RESEARCHER_SYSTEM,
      domains:      ['general', 'business_development', 'automation', 'digital_media'],
    });

    // Research provider chain: Perplexity first (real-time web), then fallbacks
    this._researchChain = [
      resolveProvider('perplexity'),
      resolveProvider('groq'),
      resolveProvider('claude'),
      resolveProvider('deepseek'),
    ].filter(Boolean);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIMARY ENTRY POINT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Run a full research mission for a requesting agent.
   * @param {object} options
   * @param {string} options.topic           — research topic / question
   * @param {string} [options.forAgent]      — agent ID requesting the research
   * @param {string} [options.context]       — additional context to guide queries
   * @param {string[]} [options.focusAreas]  — specific angles to research
   * @param {'quick'|'standard'|'deep'} [options.depth] — research depth
   * @param {boolean} [options.mergeWithKB]  — merge with internal knowledge base (default true)
   * @returns {object} { brief, sources, coverStats, gaps, mergedWithKB }
   */
  async research({ topic, forAgent = 'nexus', context = '', focusAreas = [], depth = 'standard', mergeWithKB = true }) {
    console.log(`[Researcher] Starting ${depth} research: "${topic}" for ${forAgent}`);

    const queries = await this._generateQueries(topic, context, focusAreas, depth);
    console.log(`[Researcher] Generated ${queries.length} queries`);

    // Layer 1: Tavily discovery
    let tavilyResults = [];
    if (process.env.TAVILY_API_KEY) {
      tavilyResults = await this._tavilySearch(queries);
      console.log(`[Researcher] Tavily: ${tavilyResults.length} results`);
    }

    // Layer 2: Perplexity grounded answers (parallel to Tavily or as fallback)
    let perplexityFindings = '';
    if (process.env.PERPLEXITY_API_KEY) {
      perplexityFindings = await this._perplexityResearch(topic, context, focusAreas);
      console.log(`[Researcher] Perplexity: ${perplexityFindings.length} chars`);
    }

    // Layer 3: Firecrawl deep scrape of priority URLs (standard/deep only)
    let scrapedContent = [];
    if (process.env.FIRECRAWL_API_KEY && depth !== 'quick' && tavilyResults.length > 0) {
      const priorityUrls = this._selectPriorityUrls(tavilyResults, depth === 'deep' ? 6 : 3);
      scrapedContent = await this._firecrawlScrape(priorityUrls);
      console.log(`[Researcher] Firecrawl: ${scrapedContent.length} pages scraped`);
    }

    // Synthesize raw findings into a structured brief
    const rawBrief = await this._synthesizeFindings({
      topic, forAgent, tavilyResults, perplexityFindings, scrapedContent, focusAreas,
    });

    // Merge with internal knowledge base via Synthesizer
    let finalBrief = rawBrief.brief;
    let mergedWithKB = false;
    if (mergeWithKB) {
      finalBrief = await this._mergeWithKnowledgeBase(topic, rawBrief.brief, forAgent);
      mergedWithKB = true;
    }

    // Collect all sources
    const sources = [
      ...tavilyResults.flatMap(r => r.results || []).map(r => ({ title: r.title, url: r.url, snippet: r.content?.slice(0, 200) })),
      ...scrapedContent.map(s => ({ title: s.title, url: s.url, scraped: true })),
    ].filter(s => s.url).slice(0, 20);

    console.log(`[Researcher] Research complete. Sources: ${sources.length}, KB merge: ${mergedWithKB}`);

    return {
      brief:       finalBrief,
      sources,
      coverStats:  rawBrief.coverStats || [],
      gaps:        rawBrief.gaps || [],
      mergedWithKB,
      depth,
      forAgent,
      topic,
      researchedAt: new Date().toISOString(),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // QUERY GENERATION
  // ══════════════════════════════════════════════════════════════════════════

  async _generateQueries(topic, context, focusAreas, depth) {
    const count = depth === 'quick' ? 2 : depth === 'standard' ? 4 : 6;
    const provider = this._researchChain[0] || resolveProvider();
    if (!provider) {
      // Fallback: simple derived queries
      return [topic, ...focusAreas.slice(0, count - 1)];
    }

    const prompt = `Generate ${count} targeted search queries for researching: "${topic}"
${context ? `Context: ${context}` : ''}
${focusAreas.length ? `Focus areas: ${focusAreas.join(', ')}` : ''}

Return a JSON array of strings — search queries only. Each should target a different angle (data/stats, frameworks, case studies, expert opinion, market context). No commentary.`;

    try {
      const raw = await callAiProvider(provider, prompt, 'Return a JSON array of search query strings only. No commentary.', { json: true });
      const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
      return Array.isArray(parsed) ? parsed.slice(0, count) : [topic];
    } catch {
      return [topic, ...focusAreas.slice(0, count - 1)];
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAVILY — discovery layer
  // ══════════════════════════════════════════════════════════════════════════

  async _tavilySearch(queries) {
    const results = [];
    for (const query of queries) {
      try {
        const res = await fetch(`${TAVILY_BASE}/search`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            api_key:         process.env.TAVILY_API_KEY,
            query,
            search_depth:    'advanced',
            max_results:     6,
            include_answer:  true,
            include_domains: [],
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        results.push({ query, answer: data.answer, results: data.results || [] });
      } catch (e) {
        console.warn(`[Researcher] Tavily query failed ("${query}"): ${e.message}`);
      }
    }
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PERPLEXITY — real-time grounded answers
  // ══════════════════════════════════════════════════════════════════════════

  async _perplexityResearch(topic, context, focusAreas) {
    if (!process.env.PERPLEXITY_API_KEY) return '';
    try {
      const question = focusAreas.length
        ? `Research "${topic}" covering: ${focusAreas.join(', ')}. ${context || ''}`.trim()
        : `Provide a comprehensive research brief on: "${topic}". ${context || ''}`.trim();

      const res = await fetch(`${PERPLEXITY_BASE}/chat/completions`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:       process.env.PERPLEXITY_MODEL || 'sonar-pro',
          messages:    [
            { role: 'system', content: 'You are a research analyst. Provide specific data, statistics, frameworks and real-world examples. Cite sources.' },
            { role: 'user',   content: question },
          ],
          max_tokens:  2000,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (e) {
      console.warn(`[Researcher] Perplexity failed: ${e.message}`);
      return '';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FIRECRAWL — deep content scraping
  // ══════════════════════════════════════════════════════════════════════════

  _selectPriorityUrls(tavilyResults, maxUrls) {
    const allUrls = tavilyResults.flatMap(r => (r.results || []).map(x => x.url)).filter(Boolean);
    const priority = [];
    const rest = [];
    for (const url of allUrls) {
      try {
        const domain = new URL(url).hostname.replace('www.', '');
        if (SKIP_SCRAPE_DOMAINS.some(d => domain.includes(d))) continue;
        if (PRIORITY_DOMAINS.some(d => domain.includes(d))) priority.push(url);
        else rest.push(url);
      } catch {}
    }
    return [...priority, ...rest].slice(0, maxUrls);
  }

  async _firecrawlScrape(urls) {
    const results = [];
    for (const url of urls) {
      try {
        const res = await fetch(`${FIRECRAWL_BASE}/v2/scrape`, {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, timeout: 20000 }),
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (!data.success || !data.data?.markdown) continue;
        const wordCount = data.data.markdown.split(/\s+/).length;
        if (wordCount < 200) continue;
        results.push({
          url,
          title:    data.data.metadata?.title || url,
          content:  data.data.markdown.slice(0, 8000),
          wordCount,
        });
      } catch (e) {
        console.warn(`[Researcher] Firecrawl scrape failed (${url}): ${e.message}`);
      }
    }
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SYNTHESIS — combine all raw findings into a structured brief
  // ══════════════════════════════════════════════════════════════════════════

  async _synthesizeFindings({ topic, forAgent, tavilyResults, perplexityFindings, scrapedContent, focusAreas }) {
    const provider = this._researchChain.find(p => p) || resolveProvider();
    if (!provider) {
      return { brief: this._fallbackBrief(topic, tavilyResults, perplexityFindings), coverStats: [], gaps: [] };
    }

    const tavilySummary = tavilyResults
      .map(r => `QUERY: "${r.query}"\nANSWER: ${r.answer || 'n/a'}\nTOP RESULTS:\n${(r.results || []).slice(0, 3).map(x => `  - ${x.title}: ${x.content?.slice(0, 300)}`).join('\n')}`)
      .join('\n\n---\n\n')
      .slice(0, 6000);

    const scrapeSummary = scrapedContent
      .map(s => `SOURCE: ${s.title} (${s.url})\n${s.content.slice(0, 2000)}`)
      .join('\n\n---\n\n')
      .slice(0, 6000);

    const synthesisPrompt = `You are the Researcher agent synthesizing web intelligence for: ${forAgent}

TOPIC: "${topic}"
${focusAreas.length ? `FOCUS AREAS: ${focusAreas.join(', ')}` : ''}

TAVILY DISCOVERY FINDINGS:
${tavilySummary || 'Not available'}

PERPLEXITY REAL-TIME FINDINGS:
${perplexityFindings?.slice(0, 3000) || 'Not available'}

DEEP SCRAPED CONTENT:
${scrapeSummary || 'Not available'}

Synthesize all of the above into a structured intelligence brief. Return JSON:
{
  "brief": "Full intelligence brief — 500-1000 words. Structured with clear sections. Include specific data points, statistics, frameworks, and real examples found in the research. Cite source names inline.",
  "coverStats": [
    {"label": "KEY STAT — 6 words max ALL CAPS", "sub": "1-line context"},
    {"label": "SECOND STAT", "sub": ""},
    {"label": "THIRD STAT", "sub": ""}
  ],
  "gaps": ["knowledge gap 1", "knowledge gap 2"],
  "keyFindings": ["finding 1", "finding 2", "finding 3"]
}`;

    try {
      const raw = await callAiProvider(provider, synthesisPrompt, RESEARCHER_SYSTEM, { json: true });
      const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
      return {
        brief:       parsed.brief || raw,
        coverStats:  parsed.coverStats || [],
        gaps:        parsed.gaps || [],
        keyFindings: parsed.keyFindings || [],
      };
    } catch (e) {
      console.warn('[Researcher] Synthesis parse failed:', e.message);
      return { brief: this._fallbackBrief(topic, tavilyResults, perplexityFindings), coverStats: [], gaps: [] };
    }
  }

  _fallbackBrief(topic, tavilyResults, perplexityFindings) {
    const parts = [`Research brief: ${topic}\n`];
    for (const r of tavilyResults) {
      if (r.answer) parts.push(`• ${r.query}: ${r.answer}`);
    }
    if (perplexityFindings) parts.push(`\nPerplexity findings:\n${perplexityFindings.slice(0, 1000)}`);
    return parts.join('\n');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // KB MERGE — hand raw web research to Synthesizer to enrich with internal KB
  // ══════════════════════════════════════════════════════════════════════════

  async _mergeWithKnowledgeBase(topic, webBrief, forAgent) {
    try {
      // Lazy import to avoid circular dependency (Synthesizer ← AgentBase ← Researcher)
      const { synthesizer } = await import('./synthesizer.js');
      const kbContext = await synthesizer.answer(
        `Provide internal knowledge relevant to: "${topic}"`,
        forAgent,
        [],
        6
      );

      if (!kbContext || kbContext.includes('No relevant knowledge')) {
        return webBrief; // nothing in KB to add
      }

      const provider = this._researchChain.find(p => p) || resolveProvider();
      if (!provider) return webBrief;

      const mergePrompt = `You are merging external web research with internal proprietary knowledge for: "${topic}"

WEB RESEARCH (external):
${webBrief.slice(0, 3000)}

INTERNAL KNOWLEDGE BASE (DigiFusion proprietary frameworks and insights):
${kbContext.slice(0, 2000)}

Produce a single enriched brief that:
1. Leads with the most actionable insights (external + internal combined)
2. Highlights where DigiFusion's proprietary frameworks validate or extend external findings
3. Flags any conflicts between external data and internal knowledge
4. Is clearly structured and citable

Write in clear, professional language. 600–900 words.`;

      return await callAiProvider(provider, mergePrompt, RESEARCHER_SYSTEM, { json: false });
    } catch (e) {
      console.warn('[Researcher] KB merge failed, returning web-only brief:', e.message);
      return webBrief;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE — standard task interface
  // ══════════════════════════════════════════════════════════════════════════

  async execute(task) {
    const { action, topic, forAgent, context, focusAreas, depth, mergeWithKB, message, history } = task;

    switch (action) {
      case 'research':
        return this.research({ topic: topic || task.description, forAgent, context, focusAreas, depth, mergeWithKB });

      case 'quick_research':
        return this.research({ topic: topic || task.description, forAgent, depth: 'quick', mergeWithKB: mergeWithKB ?? true });

      case 'deep_research':
        return this.research({ topic: topic || task.description, forAgent, depth: 'deep', mergeWithKB: mergeWithKB ?? true });

      case 'chat':
        return { reply: await this.chat(message || task.description, history || []) };

      default:
        if (task.description || topic) {
          return this.research({ topic: task.description || topic, forAgent: forAgent || 'nexus', depth: depth || 'standard' });
        }
        return { error: 'No topic or action specified' };
    }
  }
}

export const researcher = new Researcher();
