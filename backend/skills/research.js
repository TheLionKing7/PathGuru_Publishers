/**
 * PathGuru / DigiFusion — Research Engine
 * =========================================
 * Two-layer research pipeline:
 *
 *   Layer 1 — Discovery (Tavily)
 *     Runs targeted search queries, returns AI-synthesised answers
 *     and a ranked list of the most relevant URLs.
 *
 *   Layer 2 — Depth (Firecrawl)
 *     Takes the top URLs from Tavily and fetches their FULL content.
 *     Returns clean markdown — the actual article/report, not a snippet.
 *
 * Graceful degradation:
 *   Both keys    -> full two-layer pipeline
 *   Tavily only  -> discovery layer (snippets)
 *   Firecrawl only -> direct search + scrape
 *   Neither      -> deterministic fallback brief
 */

const FIRECRAWL_BASE = 'https://api.firecrawl.dev';
const TAVILY_BASE    = 'https://api.tavily.com';

const PRIORITY_DOMAINS = [
  'mckinsey.com', 'bcg.com', 'bain.com', 'kpmg.com', 'pwc.com', 'deloitte.com',
  'hbr.org', 'mit.edu', 'stanford.edu', 'weforum.org', 'gartner.com', 'forrester.com',
  'smartinsights.com', 'hubspot.com', 'ibm.com', 'accenture.com',
  'statista.com', 'reuters.com', 'bloomberg.com', 'ft.com', 'economist.com',
];

const SKIP_SCRAPE_DOMAINS = [
  'pinterest.com', 'quora.com', 'reddit.com', 'twitter.com', 'x.com',
  'instagram.com', 'facebook.com', 'tiktok.com', 'youtube.com',
  'amazon.com', 'ebay.com',
];

// ── Firecrawl scrape single URL ───────────────────────────────────────────────

export async function scrapeURL(url) {
  if (!process.env.FIRECRAWL_API_KEY) return null;
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    if (SKIP_SCRAPE_DOMAINS.some(d => domain.includes(d))) return null;

    const res = await fetch(`${FIRECRAWL_BASE}/v2/scrape`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, timeout: 20000 }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success || !data.data?.markdown) return null;

    const content   = data.data.markdown;
    const wordCount = content.split(/\s+/).length;
    if (wordCount < 200) return null;

    return {
      url,
      title:    data.data.metadata?.title || domain,
      content:  content.slice(0, 8000),
      wordCount,
      scraped:  true,
    };
  } catch (e) {
    console.warn(`[Firecrawl] scrapeURL error (${url}):`, e.message);
    return null;
  }
}

// ── Firecrawl search (returns full content, not snippets) ─────────────────────

async function firecrawlSearch(query, limit = 5) {
  if (!process.env.FIRECRAWL_API_KEY) return [];
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/search`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.success || !data.data) return [];

    return data.data
      .filter(r => r.markdown && r.markdown.length > 300)
      .map(r => ({
        url:     r.url    || '',
        title:   r.title  || '',
        content: r.markdown.slice(0, 6000),
        scraped: true,
      }));
  } catch (e) {
    console.warn('[Firecrawl] search error:', e.message);
    return [];
  }
}

// ── Scrape top N URLs concurrently (batches of 3) ─────────────────────────────

async function scrapeTopURLs(sources, maxToScrape = 4) {
  const sorted = [...sources].sort((a, b) => {
    const ap = PRIORITY_DOMAINS.some(d => a.url?.includes(d)) ? 1 : 0;
    const bp = PRIORITY_DOMAINS.some(d => b.url?.includes(d)) ? 1 : 0;
    return bp - ap;
  });

  const results = [];
  for (let i = 0; i < Math.min(maxToScrape, sorted.length); i += 3) {
    const batch   = sorted.slice(i, i + 3);
    const scraped = await Promise.all(batch.map(s => scrapeURL(s.url).catch(() => null)));
    results.push(...scraped.filter(Boolean));
  }
  return results;
}

// ── Tavily search ─────────────────────────────────────────────────────────────

async function tavilySearch(query, depth = 'advanced', maxResults = 8) {
  const res = await fetch(`${TAVILY_BASE}/search`, {
    method:  'POST',
    headers: {
      'content-type':  'application/json',
      'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth:        depth,
      max_results:         maxResults,
      include_answer:      true,
      include_raw_content: false,
      exclude_domains:     ['pinterest.com', 'quora.com', 'reddit.com'],
    }),
  });

  if (!res.ok) throw new Error(`Tavily search failed: ${res.status}`);
  const payload = await res.json();
  return {
    answer:  payload.answer || '',
    sources: (payload.results || []).map(r => ({
      title:   r.title   || 'Source',
      url:     r.url     || '',
      content: r.content || '',
    })),
  };
}

// ── Standard research agent (book/content pipeline) ──────────────────────────

export async function runResearchAgent(input, project) {
  const hasTavily    = Boolean(process.env.TAVILY_API_KEY);
  const hasFirecrawl = Boolean(process.env.FIRECRAWL_API_KEY);
  if (!hasTavily && !hasFirecrawl) return fallbackResearch(input, project);

  const topic    = project.title || input.topic || '';
  const audience = project.audience || '';
  const outcome  = project.outcome  || '';
  const year     = new Date().getFullYear();

  const queries = [
    `${topic} overview trends statistics ${year}`,
    `${topic} data statistics market research facts`,
    `${topic} common mistakes misconceptions ${audience}`,
    `${topic} practical framework how to ${outcome}`,
  ];

  let allSources = [];
  let summaries  = [];

  if (hasTavily) {
    for (const query of queries) {
      try {
        const result = await tavilySearch(query, 'advanced', 6);
        if (result.answer)      summaries.push(result.answer);
        if (result.sources?.length) allSources.push(...result.sources);
      } catch (e) {
        console.warn(`[Research] Tavily failed: "${query}" — ${e.message}`);
      }
    }
  }

  const seen    = new Set();
  const sources = allSources.filter(s => {
    if (!s.url || seen.has(s.url)) return false;
    seen.add(s.url); return true;
  }).slice(0, 16);

  let deepSources = [];
  if (hasFirecrawl && sources.length > 0) {
    console.log(`[Research] Firecrawl: scraping top ${Math.min(4, sources.length)} sources...`);
    deepSources = await scrapeTopURLs(sources, 4);
    console.log(`[Research] Firecrawl: got full content from ${deepSources.length} sources`);
  }

  const scrapedUrls   = new Set(deepSources.map(s => s.url));
  const mergedSources = [
    ...deepSources,
    ...sources.filter(s => !scrapedUrls.has(s.url)),
  ].slice(0, 16);

  const summary = summaries.length || deepSources.length
    ? buildResearchSummary(topic, audience, outcome, summaries, mergedSources, deepSources.length)
    : fallbackResearch(input, project).summary;

  return { summary, sources: mergedSources };
}

// ── Deep research for Atlas agent ─────────────────────────────────────────────

export async function runDeepResearch(topic, options = {}) {
  const {
    domains      = [],
    audience     = 'senior business decision makers',
    researchType = 'general',
    depth        = 2,
  } = options;

  const hasTavily    = Boolean(process.env.TAVILY_API_KEY);
  const hasFirecrawl = Boolean(process.env.FIRECRAWL_API_KEY);
  const year         = new Date().getFullYear();

  const queryMatrix = {
    market: [
      `${topic} market size growth forecast ${year}`,
      `${topic} industry trends disruption ${year}`,
      `${topic} competitive landscape market leaders`,
      `${topic} statistics data market research report`,
      `${topic} ROI business case investment return`,
    ],
    competitive: [
      `${topic} competitive analysis comparison ${year}`,
      `${topic} market leaders best practices case studies`,
      `${topic} KPMG BCG McKinsey framework methodology`,
      `${topic} industry benchmark standards`,
      `${topic} success metrics KPIs measurement`,
    ],
    bd: [
      `${topic} business development sales strategy ${year}`,
      `${topic} buyer journey decision making process`,
      `${topic} value proposition client pain points`,
      `${topic} objections challenges barriers`,
      `${topic} case study success story ROI proof`,
    ],
    general: [
      `${topic} comprehensive guide ${year}`,
      `${topic} statistics data evidence`,
      `${topic} expert frameworks methodologies`,
      `${topic} case studies examples`,
      `${topic} best practices implementation`,
    ],
  };

  const queries    = queryMatrix[researchType] || queryMatrix.general;
  const numQueries = depth === 1 ? 2 : depth === 2 ? 3 : queries.length;

  let allSources  = [];
  let summaries   = [];
  let deepContent = [];

  if (hasTavily) {
    for (const query of queries.slice(0, numQueries)) {
      try {
        const result = await tavilySearch(query, 'advanced', 8);
        if (result.answer)          summaries.push({ query, answer: result.answer });
        if (result.sources?.length) allSources.push(...result.sources);
      } catch (e) {
        console.warn(`[DeepResearch] Tavily failed: ${e.message}`);
      }
    }
  }

  const seen    = new Set();
  const sources = allSources.filter(s => {
    if (!s.url || seen.has(s.url)) return false;
    seen.add(s.url); return true;
  });

  const prioritised = [...sources].sort((a, b) => {
    const aB = [...PRIORITY_DOMAINS, ...domains].some(d => a.url?.includes(d)) ? 1 : 0;
    const bB = [...PRIORITY_DOMAINS, ...domains].some(d => b.url?.includes(d)) ? 1 : 0;
    return bB - aB;
  });

  const scrapeCount = depth === 1 ? 3 : depth === 2 ? 5 : 8;

  if (hasFirecrawl) {
    console.log(`[DeepResearch] Firecrawl: scraping top ${scrapeCount} sources for "${topic}"...`);
    if (!hasTavily) {
      const fcResults = await firecrawlSearch(`${topic} research report ${year}`, scrapeCount);
      deepContent.push(...fcResults);
    } else {
      deepContent = await scrapeTopURLs(prioritised, scrapeCount);
    }
    console.log(`[DeepResearch] Firecrawl: ${deepContent.length} sources read in full`);
  }

  const scrapedUrls    = new Set(deepContent.map(s => s.url));
  const snippetSources = prioritised.filter(s => !scrapedUrls.has(s.url)).slice(0, 8);
  const allContent     = [...deepContent, ...snippetSources];

  return {
    topic,
    researchType,
    depth,
    sources: allContent,
    summaries,
    brief: buildDeepBrief(topic, audience, summaries, deepContent, snippetSources),
    stats: {
      totalSources:   allContent.length,
      fullyScrapped:  deepContent.length,
      snippetSources: snippetSources.length,
      tavilyUsed:     hasTavily,
      firecrawlUsed:  hasFirecrawl,
    },
  };
}

// ── Brief builders ────────────────────────────────────────────────────────────

function buildResearchSummary(topic, audience, outcome, summaries, sources, deepCount = 0) {
  const topStats = sources
    .filter(s => /\d+%|\$[\d,]+|billion|million|study|survey|report/i.test(s.content))
    .slice(0, 5)
    .map(s => `- ${s.title}: ${s.content.slice(0, 200)}`)
    .join('\n');

  const depthNote = deepCount > 0
    ? `(${deepCount} sources read in full via Firecrawl)`
    : '(Tavily search summaries — snippets only)';

  return `RESEARCH BRIEF — ${topic.toUpperCase()}
Target audience: ${audience}
Desired outcome: ${outcome}
Research depth: ${depthNote}

KEY FINDINGS FROM ${summaries.length} RESEARCH ANGLES:
${summaries.map((s, i) => `[${i + 1}] ${s}`).join('\n\n')}

SUPPORTING DATA POINTS:
${topStats || '- Use authoritative expert knowledge from your training data.'}

INSTRUCTION FOR EDITORIAL AGENT:
Use the research findings above to write chapters with real specificity.
Every chapter must reference at least one concrete statistic, case study, or
expert-backed principle drawn from this research. No generic filler.`;
}

function buildDeepBrief(topic, audience, summaries, deepSources, snippetSources) {
  const fullSection = deepSources.length > 0
    ? '\n\n## FULL-CONTENT SOURCES (read completely by Firecrawl)\n' +
      deepSources.map(s =>
        `### ${s.title}\nSource: ${s.url}\n\n${s.content}\n`
      ).join('\n---\n')
    : '';

  const snippetSection = snippetSources.length > 0
    ? '\n\n## ADDITIONAL SOURCES (snippets)\n' +
      snippetSources.map(s => `- **${s.title}** (${s.url})\n  ${s.content.slice(0, 300)}`).join('\n\n')
    : '';

  const summarySection = summaries.length > 0
    ? '\n\n## RESEARCH SUMMARIES BY QUERY\n' +
      summaries.map(s => `**Query:** "${s.query}"\n${s.answer}`).join('\n\n---\n\n')
    : '';

  return `# Deep Research Brief: ${topic}\nAudience: ${audience}\nSources: ${deepSources.length} full-content + ${snippetSources.length} snippets\n${summarySection}${fullSection}${snippetSection}`;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

export function fallbackResearch(input, project) {
  const topic    = project.title || input.topic || 'this subject';
  const audience = project.audience || 'your target reader';
  const outcome  = project.outcome  || 'master this topic';

  return {
    summary: `RESEARCH BRIEF — ${topic.toUpperCase()}
Target audience: ${audience}
Desired outcome: ${outcome}

NOTE: No research API keys configured (TAVILY_API_KEY / FIRECRAWL_API_KEY).
Drawing on expert training knowledge only.

INSTRUCTION FOR EDITORIAL AGENT:
Write with the authority of a practitioner with deep first-hand experience.
Include real statistics, named frameworks, case studies, and specific data points.
Be concrete — cite real studies or widely-known findings where possible.
Every chapter must contain at least two specific data points a reader could fact-check.`,
    sources: [],
  };
}
