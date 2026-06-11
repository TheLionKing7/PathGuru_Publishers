/**
 * DigiFusion Intelligence Network — Researcher
 * =============================================
 * The dedicated web intelligence agent.
 *
 * Responsibilities:
 *   1. Web Discovery   — Tavily: targeted queries, ranked URLs, AI summaries
 *   2. Deep Scraping   — Firecrawl: full content extraction from priority sources
 *   3. KB Merge        — hands raw findings to Synthesizer to merge with internal KB
 *   4. Brief Delivery  — returns a single enriched research brief to the requester
 *
 * Stack: Tavily + Firecrawl only (no paid Perplexity dependency).
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
import { callAiProvider, resolveProvider } from '../aiProviders.js';

const RESEARCHER_SYSTEM = `You are Orion — the web intelligence specialist of the GuruCMS Agent Network.

Your job is to find, extract, and synthesize real-world intelligence from the web. You work with:
— Tavily: targeted search queries with AI summaries and ranked source URLs
— Firecrawl: full-content scraping of priority sources

You do not generate opinions or creative content. You find facts, frameworks, data, and expert perspectives — then synthesize them into a clean, actionable intelligence brief.

Every brief you deliver must:
1. Be grounded in real sources (cite them with URLs)
2. Include specific data points, statistics, or frameworks where found
3. Identify the most credible and relevant findings
4. Flag any conflicting perspectives or data gaps
5. Be structured for the requesting agent's specific use case

You serve Atlas (BD research), Nova (technical research), Aether (content trends), and Nexus (ad hoc intelligence).`;

const TAVILY_BASE    = 'https://api.tavily.com';
const FIRECRAWL_BASE = 'https://api.firecrawl.dev';

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
      displayName:  'Orion',
      role:         'Intelligence & Research Specialist',
      systemPrompt: RESEARCHER_SYSTEM,
      domains:      ['general', 'business_development', 'automation', 'digital_media'],
    });

    // JSON synthesis / query gen — use chat models, not Perplexity (unreliable JSON)
    this._synthesisChain = [
      resolveProvider('groq'),
      resolveProvider('claude'),
      resolveProvider('deepseek'),
      resolveProvider('cerebras'),
    ].filter(Boolean);
  }

  _logKeyStatus() {
    const tavily = !!process.env.TAVILY_API_KEY;
    const firecrawl = !!process.env.FIRECRAWL_API_KEY;
    if (!tavily) console.warn('[Researcher] TAVILY_API_KEY not set — Orion cannot search the web');
    if (!firecrawl) console.warn('[Researcher] FIRECRAWL_API_KEY not set — deep scrape disabled (snippets only)');
    return { tavily, firecrawl };
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
    console.log(`[Researcher] Starting ${depth} research: "${topic.slice(0, 120)}" for ${forAgent}`);
    this._logKeyStatus();

    const queries = await this._generateQueries(topic, context, focusAreas, depth);
    console.log(`[Researcher] Generated ${queries.length} queries`);

    // Layer 1: Tavily discovery (+ expansion pass if thin)
    let tavilyResults = [];
    if (process.env.TAVILY_API_KEY) {
      tavilyResults = await this._tavilySearch(queries);
      let tavilyHitCount = tavilyResults.reduce((n, r) => n + (r.results?.length || 0), 0);
      if (tavilyHitCount === 0) {
        const expanded = this._buildFallbackQueries(topic, focusAreas, depth);
        console.warn(`[Researcher] Tavily thin — retrying with ${expanded.length} short fallback queries`);
        const retry = await this._tavilySearch(expanded);
        tavilyResults = this._mergeTavilyResults(tavilyResults, retry);
        tavilyHitCount = tavilyResults.reduce((n, r) => n + (r.results?.length || 0), 0);
      }
      console.log(`[Researcher] Tavily: ${tavilyHitCount} results across ${tavilyResults.length} queries`);
    } else {
      console.warn('[Researcher] Tavily skipped — TAVILY_API_KEY not set');
    }

    // Layer 2: Firecrawl deep scrape — seed from Tavily URLs + answers
    let scrapedContent = [];
    const seedUrls = [
      ...tavilyResults.flatMap(r => (r.results || []).map(x => x.url)),
      ...tavilyResults.flatMap(r => this._extractUrls(r.answer)),
    ].filter(Boolean);

    if (process.env.FIRECRAWL_API_KEY && depth !== 'quick' && seedUrls.length > 0) {
      const maxUrls = depth === 'deep' ? 5 : 2;
      const priorityUrls = this._selectPriorityUrlsFromUrls(seedUrls, maxUrls);
      const scrapeTimeout = depth === 'deep' ? 60_000 : 30_000;
      scrapedContent = await Promise.race([
        this._firecrawlScrape(priorityUrls),
        new Promise(resolve => setTimeout(() => resolve([]), scrapeTimeout)),
      ]);
      console.log(`[Researcher] Firecrawl: ${scrapedContent.length} pages scraped`);
    } else if (depth !== 'quick' && !process.env.FIRECRAWL_API_KEY) {
      console.warn('[Researcher] Firecrawl skipped — FIRECRAWL_API_KEY not set');
    }

    const hasWebGrounding = this._hasWebGrounding({ tavilyResults, scrapedContent });

    // Synthesize raw findings into a structured brief
    const rawBrief = hasWebGrounding
      ? await this._synthesizeFindings({
          topic, forAgent, tavilyResults, scrapedContent, focusAreas, depth,
        })
      : {
          brief: '',
          coverStats: [],
          gaps: [
            'No web sources retrieved — Tavily returned no results for this topic.',
            'Check TAVILY_API_KEY quota on Render and redeploy with latest Orion code.',
            'Re-run with a shorter research prompt, or paste a manual brief in Nexus Console.',
          ],
        };

    // Merge with internal KB only when web research succeeded
    let finalBrief = rawBrief.brief;
    let mergedWithKB = false;
    if (mergeWithKB && hasWebGrounding && finalBrief) {
      finalBrief = await this._mergeWithKnowledgeBase(topic, rawBrief.brief, forAgent);
      mergedWithKB = true;
    }

    const sources = this._collectSources({ tavilyResults, scrapedContent, brief: finalBrief });

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

  _shortTopic(topic) {
    const t = String(topic || '').replace(/\s+/g, ' ').trim();
    const researchMatch = t.match(/research on ([^.?!]{10,120})/i);
    if (researchMatch) return researchMatch[1].trim();
    return t.slice(0, 120);
  }

  _buildFallbackQueries(topic, focusAreas, depth) {
    const short = this._shortTopic(topic);
    const year = new Date().getFullYear();
    const base = [
      `${short} statistics trends ${year}`,
      `${short} market size pain points`,
      `${short} key players companies`,
    ];
    for (const area of focusAreas.slice(0, 2)) {
      base.push(`${short} ${area} ${year}`);
    }
    if (/africa|afcfta|b2b|ecommerce|e-commerce/i.test(topic)) {
      base.push(`B2B ecommerce Africa market ${year}`, `AfCFTA intra-African trade trends ${year}`);
    }
    const count = depth === 'quick' ? 4 : depth === 'standard' ? 6 : 8;
    return [...new Set(base.map(q => q.slice(0, 120)))].slice(0, count);
  }

  _mergeTavilyResults(a, b) {
    const seen = new Set(a.map(r => r.query));
    return [...a, ...b.filter(r => !seen.has(r.query))];
  }

  async _generateQueries(topic, context, focusAreas, depth) {
    const count = depth === 'quick' ? 2 : depth === 'standard' ? 4 : 6;
    const fallbacks = this._buildFallbackQueries(topic, focusAreas, depth);
    const provider = this._synthesisChain[0] || resolveProvider();
    if (!provider) return fallbacks.slice(0, count);

    const shortTopic = this._shortTopic(topic);
    const prompt = `Generate ${count} SHORT web search queries (max 12 words each) for: "${shortTopic}"
${context ? `Context: ${context.slice(0, 200)}` : ''}
${focusAreas.length ? `Angles: ${focusAreas.join(', ')}` : ''}

Return a JSON array of strings only. No full sentences — search-engine style queries.`;

    try {
      const raw = await callAiProvider(provider, prompt, 'Return a JSON array of short search query strings only.', { json: true });
      const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
      const aiQueries = Array.isArray(parsed)
        ? parsed.map(q => String(q).slice(0, 120)).filter(Boolean)
        : [];
      const merged = [...new Set([...aiQueries, ...fallbacks])].slice(0, count + 2);
      return merged.length ? merged : fallbacks.slice(0, count);
    } catch {
      return fallbacks.slice(0, count);
    }
  }

  _extractUrls(text) {
    const urlRe = /https?:\/\/[^\s)\]"'<>]+/gi;
    const out = [];
    for (const match of String(text).match(urlRe) || []) {
      try {
        out.push(new URL(match.replace(/[.,;]+$/, '')).href);
      } catch { /* skip */ }
    }
    return out;
  }

  _hasWebGrounding({ tavilyResults = [], scrapedContent = [] }) {
    const tavilyHits = tavilyResults.some(r => (r.results?.length || 0) > 0);
    const tavilyAnswered = tavilyResults.some(r => String(r.answer || '').trim().length > 80);
    const scraped = scrapedContent.length > 0;
    return tavilyHits || tavilyAnswered || scraped;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAVILY — discovery layer
  // ══════════════════════════════════════════════════════════════════════════

  async _tavilySearch(queries) {
    const results = [];
    for (const query of queries) {
      let hit = await this._tavilySearchOne(query, 'advanced');
      if (!(hit.results?.length)) {
        hit = await this._tavilySearchOne(query, 'basic');
      }
      if (hit.results?.length || hit.answer) results.push(hit);
    }
    return results;
  }

  async _tavilySearchOne(query, searchDepth = 'advanced') {
    const safeQuery = String(query || '').slice(0, 400);
    if (!safeQuery.trim()) return { query: safeQuery, answer: null, results: [] };
    try {
      const res = await fetch(`${TAVILY_BASE}/search`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${process.env.TAVILY_API_KEY}`,
        },
        body: JSON.stringify({
          api_key:             process.env.TAVILY_API_KEY,
          query:               safeQuery,
          search_depth:        searchDepth,
          max_results:         8,
          include_answer:      true,
          include_raw_content: false,
          exclude_domains:     ['pinterest.com', 'quora.com', 'reddit.com'],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[Researcher] Tavily HTTP ${res.status} (${searchDepth}) for "${safeQuery.slice(0, 60)}": ${errText.slice(0, 180)}`);
        return { query: safeQuery, answer: null, results: [] };
      }
      const data = await res.json();
      return { query: safeQuery, answer: data.answer, results: data.results || [] };
    } catch (e) {
      console.warn(`[Researcher] Tavily query failed ("${safeQuery.slice(0, 60)}"): ${e.message}`);
      return { query: safeQuery, answer: null, results: [] };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FIRECRAWL — deep content scraping
  // ══════════════════════════════════════════════════════════════════════════

  _selectPriorityUrls(tavilyResults, maxUrls) {
    const allUrls = tavilyResults.flatMap(r => (r.results || []).map(x => x.url)).filter(Boolean);
    return this._selectPriorityUrlsFromUrls(allUrls, maxUrls);
  }

  _selectPriorityUrlsFromUrls(allUrls, maxUrls) {
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
    return [...new Set([...priority, ...rest])].slice(0, maxUrls);
  }

  _collectSources({ tavilyResults = [], scrapedContent = [], brief = '' }) {
    const seen = new Set();
    const out = [];
    const add = (entry) => {
      if (!entry?.url || seen.has(entry.url)) return;
      seen.add(entry.url);
      out.push(entry);
    };

    for (const r of tavilyResults.flatMap(tr => tr.results || [])) {
      add({ title: r.title || r.url, url: r.url, snippet: r.content?.slice(0, 200), source: 'tavily' });
    }
    for (const s of scrapedContent) {
      add({ title: s.title || s.url, url: s.url, scraped: true, source: 'firecrawl' });
    }
    const urlRe = /https?:\/\/[^\s)\]"'<>]+/gi;
    for (const match of String(brief).match(urlRe) || []) {
      const url = match.replace(/[.,;]+$/, '');
      try {
        const host = new URL(url).hostname.replace('www.', '');
        add({ title: host, url, source: 'brief' });
      } catch {}
    }
    return out.slice(0, 25);
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

  async _synthesizeFindings({ topic, forAgent, tavilyResults, scrapedContent, focusAreas, depth = 'standard' }) {
    const provider = this._synthesisChain[0] || resolveProvider();
    if (!provider) {
      return { brief: this._fallbackBrief(topic, tavilyResults, scrapedContent), coverStats: [], gaps: [] };
    }

    const tavilySummary = tavilyResults
      .map(r => `QUERY: "${r.query}"\nANSWER: ${r.answer || 'n/a'}\nTOP RESULTS:\n${(r.results || []).slice(0, 5).map(x => `  - ${x.title} (${x.url}): ${x.content?.slice(0, 400)}`).join('\n')}`)
      .join('\n\n---\n\n')
      .slice(0, 8000);

    const scrapeSummary = scrapedContent
      .map(s => `SOURCE: ${s.title} (${s.url})\n${s.content.slice(0, 2000)}`)
      .join('\n\n---\n\n')
      .slice(0, 6000);

    const wordTarget = depth === 'deep' ? '800-1200' : '500-1000';
    const synthesisPrompt = `You are Orion synthesizing web intelligence for: ${forAgent}

TOPIC: "${this._shortTopic(topic)}"
${focusAreas.length ? `FOCUS AREAS: ${focusAreas.join(', ')}` : ''}

TAVILY DISCOVERY (search answers + ranked URLs):
${tavilySummary || 'Not available'}

FIRECRAWL DEEP SCRAPED CONTENT:
${scrapeSummary || 'Not available'}

Synthesize ONLY from the findings above into a structured intelligence brief. Return JSON:
{
  "brief": "GuruCMS Intelligence Brief — ${wordTarget} words. Sections: Executive summary, Market context, Key data points, Frameworks, Implications, ## Sources (URLs from findings only).",
  "coverStats": [
    {"label": "KEY STAT — 6 words max ALL CAPS", "sub": "1-line context"},
    {"label": "SECOND STAT", "sub": ""},
    {"label": "THIRD STAT", "sub": ""}
  ],
  "gaps": ["knowledge gap 1"],
  "keyFindings": ["finding 1", "finding 2"]
}

RULES: Never invent statistics or URLs. Only cite sources present in the findings above. If data is thin, list gaps honestly.`;

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
      return { brief: this._fallbackBrief(topic, tavilyResults, scrapedContent), coverStats: [], gaps: [] };
    }
  }

  _fallbackBrief(topic, tavilyResults, scrapedContent = []) {
    const parts = [`GuruCMS Intelligence Brief: ${this._shortTopic(topic)}\n`];
    for (const r of tavilyResults) {
      if (r.answer) parts.push(`### ${r.query}\n${r.answer}`);
      for (const hit of (r.results || []).slice(0, 3)) {
        parts.push(`- [${hit.title}](${hit.url}): ${(hit.content || '').slice(0, 200)}`);
      }
    }
    for (const s of scrapedContent.slice(0, 2)) {
      parts.push(`\n### ${s.title}\n${s.content.slice(0, 800)}`);
    }
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

      const provider = this._synthesisChain[0] || resolveProvider();
      if (!provider) return webBrief;

      const mergePrompt = `You are merging external web research with internal proprietary knowledge for: "${topic}"

WEB RESEARCH (external):
${webBrief.slice(0, 3000)}

INTERNAL KNOWLEDGE BASE (GuruCMS proprietary frameworks and insights):
${kbContext.slice(0, 2000)}

Produce a single enriched brief that:
1. Leads with the most actionable insights (external + internal combined)
2. Highlights where GuruCMS proprietary frameworks validate or extend external findings
3. Flags any conflicts between external data and internal knowledge
4. Is clearly structured and citable — preserve all source URLs from the web research

Write in clear, professional language. 600–900 words. Title: "GuruCMS Intelligence Brief".`;

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
        return this.research({ topic: action || task.description || 'general research', forAgent: forAgent || 'nexus', depth: depth || 'standard', mergeWithKB: mergeWithKB ?? true });
    }
  }
}

export const researcher = new Researcher();
