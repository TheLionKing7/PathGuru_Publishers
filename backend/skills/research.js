/**
 * PathGuru Publishers — Research Agent
 * =====================================
 * Runs multiple targeted Tavily searches to build a deep research brief
 * that the editorial agent can draw on for real data, statistics, and
 * expert insights — not just internal knowledge.
 *
 * Query strategy:
 *   1. Overview query      — broad landscape of the topic
 *   2. Statistics query    — data, numbers, market size, trends
 *   3. Objections query    — common mistakes, myths, reader doubts
 *   4. Tactics query       — practical how-to, frameworks, techniques
 *
 * Falls back cleanly if TAVILY_API_KEY is not set.
 */

export async function runResearchAgent(input, project) {
  if (!process.env.TAVILY_API_KEY) {
    return fallbackResearch(input, project);
  }

  const topic    = project.title || input.topic || '';
  const audience = project.audience || '';
  const outcome  = project.outcome  || '';

  // Four targeted queries to build a multi-angle research brief
  const queries = [
    `${topic} guide overview trends statistics ${new Date().getFullYear()}`,
    `${topic} data statistics facts numbers market research`,
    `${topic} common mistakes myths misconceptions ${audience}`,
    `${topic} practical steps framework how to ${outcome}`,
  ];

  let allSources = [];
  let summaries  = [];

  for (const query of queries) {
    try {
      const result = await tavilySearch(query, 'advanced', 6);
      if (result.answer) summaries.push(result.answer);
      if (result.sources?.length) allSources.push(...result.sources);
    } catch (e) {
      console.warn(`[PathGuru Research] Query failed: "${query}" — ${e.message}`);
    }
  }

  // Deduplicate sources by URL
  const seen = new Set();
  const sources = allSources.filter(s => {
    if (!s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  }).slice(0, 16);

  const summary = summaries.length
    ? buildResearchSummary(topic, audience, outcome, summaries, sources)
    : fallbackResearch(input, project).summary;

  return { summary, sources };
}

async function tavilySearch(query, depth = 'advanced', maxResults = 8) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth:        depth,
      max_results:         maxResults,
      include_answer:      true,
      include_raw_content: false,
      include_domains:     [],
      exclude_domains:     ['pinterest.com', 'quora.com'],
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed: ${response.status}`);
  }

  const payload = await response.json();
  return {
    answer:  payload.answer || '',
    sources: (payload.results || []).map(r => ({
      title:   r.title   || 'Source',
      url:     r.url     || '',
      content: r.content || '',
    })),
  };
}

function buildResearchSummary(topic, audience, outcome, summaries, sources) {
  const topStats = sources
    .filter(s => /\d+%|\$[\d,]+|billion|million|study|survey|report/i.test(s.content))
    .slice(0, 5)
    .map(s => `• ${s.title}: ${s.content.slice(0, 200)}`)
    .join('\n');

  return `RESEARCH BRIEF — ${topic.toUpperCase()}
Target audience: ${audience}
Desired outcome: ${outcome}

KEY FINDINGS FROM ${summaries.length} RESEARCH ANGLES:
${summaries.map((s, i) => `[${i + 1}] ${s}`).join('\n\n')}

SUPPORTING DATA POINTS:
${topStats || '• Use authoritative expert knowledge from your training data.'}

INSTRUCTION FOR EDITORIAL AGENT:
Use the above research findings, data points, and source material to write
chapters with real specificity. Every chapter should reference at least one
concrete statistic, case study, or expert-backed principle drawn from this
research. Do not write in vague generalities — the reader wants proof points.`;
}

export function fallbackResearch(input, project) {
  const topic    = project.title || input.topic || 'this subject';
  const audience = project.audience || 'your target reader';
  const outcome  = project.outcome  || 'master this topic';

  return {
    summary: `RESEARCH BRIEF — ${topic.toUpperCase()}
Target audience: ${audience}
Desired outcome: ${outcome}

NOTE: No live research API key configured. Draw on your expert training knowledge.

INSTRUCTION FOR EDITORIAL AGENT:
Write with the authority of a practitioner who has deep first-hand experience.
Include real statistics, named frameworks, case studies, and specific data points
from your training knowledge. Be concrete — not vague. Cite real studies or
widely-known findings where possible. Every chapter must contain at least two
specific data points or evidence-based insights that a reader could fact-check.`,
    sources: [],
  };
}
