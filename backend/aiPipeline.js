import { runResearchAgent, runDeepResearch, fallbackResearch } from './skills/research.js';
import { runDesignAgent } from './skills/design.js';
import { runFormattingAgent } from './skills/formatting.js';
import { resolvePageBudget } from './skills/kdp/pageBudget.js';
import { runChunkedEditorial } from './skills/kdp/chunkedEditorial.js';
import { runManuscriptRefinement } from './skills/kdp/manuscriptRefinement.js';
import { resolveBundledLogo } from './skills/kdp/imprintPack.js';

export async function createAiPublishingPackage(input, baseProject) {
  // Editorial pipeline uses Claude-first provider for maximum prose quality.
  // Fast agents (Groq, Cerebras) are reserved for chat; PDFs deserve Claude.
  const provider = resolveEditorialProvider();
  const hasTavily = Boolean(process.env.TAVILY_API_KEY);
  const hasFirecrawl = Boolean(process.env.FIRECRAWL_API_KEY);
  const assetBaseUrl = input.assetBaseUrl
    || process.env.PATHGURU_PUBLIC_URL
    || `http://localhost:${process.env.PORT || 8787}`;

  baseProject.publisherProfile = resolveBundledLogo(
    baseProject.publisherProfile || {},
    assetBaseUrl,
  );
  if (!baseProject.publisherProfile.logoUrl && input.brandLogoUrl) {
    baseProject.publisherProfile = {
      ...baseProject.publisherProfile,
      logoUrl: input.brandLogoUrl,
    };
  }

  const budget = resolvePageBudget(input, baseProject);
  baseProject.pageBudget = budget;
  baseProject.publishingIntent = input.publishingIntent || baseProject.publishingIntent;
  baseProject.ebookGenre = input.ebookGenre || baseProject.ebookGenre || 'non-fiction';
  baseProject.jobMode = input.jobMode || baseProject.jobMode || 'generate';

  const isRefineMode = baseProject.jobMode === 'refine'
    || Boolean(input.sourceManuscript?.text || input.manuscriptText || input.importedText);

  if (!provider) {
    return {
      source: "fallback",
      research: fallbackResearch(input, baseProject),
      manuscript: null,
      notes: ["No AI provider key is configured, so PathGuru used the deterministic fallback draft."]
    };
  }

  let approvedResearch;
  let manuscript;

  if (isRefineMode) {
    console.log('[PathGuru AI] Refine mode — skipping research, polishing imported manuscript...');
    approvedResearch = {
      summary: `Imported manuscript refinement for "${baseProject.title}".`,
      sources: [],
      refine:  true,
    };
    manuscript = await runManuscriptRefinement(
      { ...input, assetBaseUrl },
      baseProject,
      provider,
      (p, prompt) => callAiProvider(p, prompt),
    );
  } else {
    // ── Phase 1: Research ─────────────────────────────────────────────────
    console.log('[PathGuru AI] Phase 1: Running research agent...');
    const useDeepResearch = hasFirecrawl && (
      budget.lengthKey === 'deep'
      || ['playbook', 'research'].includes(baseProject.publishingIntent)
    );
    let rawResearch;
    if (useDeepResearch) {
      console.log('[PathGuru AI] Deep research (Tavily + Firecrawl)...');
      const deep = await runDeepResearch(baseProject.title || input.topic, {
        audience: baseProject.audience,
        depth:    budget.lengthKey === 'deep' ? 3 : 2,
      });
      rawResearch = {
        summary: deep.brief || '',
        sources: deep.sources || [],
        deep:    true,
      };
    } else if (hasTavily || hasFirecrawl) {
      rawResearch = await runResearchAgent(input, baseProject);
    } else {
      rawResearch = fallbackResearch(input, baseProject);
    }

    // ── Phase 2: Editorial Quality Gate ─────────────────────────────────
    console.log('[PathGuru AI] Phase 2: Editorial quality gate — assessing research depth...');
    approvedResearch = await assessAndApproveResearch(rawResearch, input, baseProject, provider);

    // ── Phase 3: Chunked editorial writing ──────────────────────────────
    console.log('[PathGuru AI] Phase 3: Chunked manuscript generation...');
    manuscript = await runChunkedEditorial(
      { ...input, assetBaseUrl },
      baseProject,
      approvedResearch,
      provider,
      (p, prompt) => callAiProvider(p, prompt),
    );
  }

  // ── Phase 4: Design + cover ───────────────────────────────────────────
  console.log('[PathGuru AI] Phase 4: Running design agent with research-driven cover...');
  const designPackage = await runDesignAgent(input, baseProject, approvedResearch, manuscript);
  const formatting = await runFormattingAgent(baseProject, manuscript, designPackage);

  return {
    source: provider.name,
    research: approvedResearch,
    manuscript,
    design: designPackage,
    html: formatting.html,
    notes: [
      isRefineMode
        ? 'Imported manuscript — structural analysis, proofreading, and imprint applied.'
        : `Page budget: ${budget.targetPagesMin}–${budget.targetPagesMax} pages · ${budget.targetChapterCount} chapters.`,
      isRefineMode ? 'Research skipped (refine mode).' : (
        hasFirecrawl && (budget.lengthKey === 'deep' || ['playbook', 'research'].includes(baseProject.publishingIntent))
          ? 'Deep research (Tavily + Firecrawl) used.'
          : (hasTavily || hasFirecrawl ? 'Standard research pipeline completed.' : 'No research API keys — internal brief only.')
      ),
      isRefineMode ? 'Section-by-section proofreading pass completed.' : 'Chunked chapter writing + imprint front matter applied.',
    ],
    pageBudget: budget,
  };
}

/* ── Research Quality Gate ─────────────────────────────────────────────────
 * Grades the research brief on depth and specificity.
 * If score < 3, uses AI to identify gaps and runs supplementary Tavily queries.
 * Returns an enriched "approved" research brief with cover stats extracted.
 * ───────────────────────────────────────────────────────────────────────── */
async function assessAndApproveResearch(research, input, project, provider) {
  const topic    = project.title || input.topic || '';
  const audience = project.audience || '';

  // Quick scoring prompt — lightweight, fast
  const assessPrompt = `You are a senior research editor at a premium publishing house.

Assess this research brief for a book on: "${topic}"
Target audience: "${audience}"

RESEARCH BRIEF:
"""
${(research.summary || '').slice(0, 4000)}
"""

Return JSON only:
{
  "score": <1-5 integer, where 5=excellent depth, 1=shallow/generic>,
  "hasStats": <true/false — contains specific numbers, percentages, or market data>,
  "hasExamples": <true/false — contains real-world examples or case studies>,
  "gaps": ["list up to 3 specific knowledge gaps that would strengthen the book"],
  "coverStats": [
    {"label": "STAT OR CLAIM — 6 words max, ALL CAPS", "sub": "optional 1-line source context"},
    {"label": "ANOTHER KEY STAT", "sub": ""},
    {"label": "THIRD DATA POINT", "sub": ""}
  ],
  "verdict": "approved" | "needs_enrichment"
}

scoring guide:
5 = multiple concrete stats + case studies + expert frameworks
4 = good stats, 1+ case study, some frameworks
3 = some stats but mostly general advice
2 = very generic, few numbers, no real examples
1 = completely generic, no data, no examples`;

  let assessment;
  try {
    const raw = await callAiProvider(provider, assessPrompt);
    assessment = parseJson(raw);
  } catch (e) {
    console.warn('[PathGuru QGate] Assessment parse failed, approving as-is:', e.message);
    return research;
  }

  console.log(`[PathGuru QGate] Research score: ${assessment.score}/5 — ${assessment.verdict}`);

  // Store cover stats for the design agent
  if (assessment.coverStats?.length) {
    research.coverStats = assessment.coverStats;
  }

  // If research is deep enough, approve it
  if (assessment.score >= 3 || assessment.verdict === 'approved') {
    research.qualityGate = { score: assessment.score, verdict: 'approved', gaps: [] };
    return research;
  }

  // Research is shallow — run gap-filling queries if Tavily is available
  console.log(`[PathGuru QGate] Research score ${assessment.score}/5 — running gap-fill queries...`);
  const gaps = assessment.gaps || [];

  if (process.env.TAVILY_API_KEY && gaps.length > 0) {
    const { runResearchAgent } = await import('./skills/research.js');
    // Run targeted searches for each gap
    for (const gap of gaps.slice(0, 2)) {
      try {
        const gapResearch = await runResearchAgent({ topic: `${topic} ${gap}` }, project);
        if (gapResearch.summary && gapResearch.summary.length > 200) {
          research.summary += `\n\nGAP-FILL RESEARCH — ${gap.toUpperCase()}:\n${gapResearch.summary.slice(0, 1500)}`;
          if (gapResearch.sources?.length) {
            research.sources = [...(research.sources || []), ...gapResearch.sources].slice(0, 20);
          }
        }
      } catch (e) {
        console.warn(`[PathGuru QGate] Gap-fill query failed for "${gap}":`, e.message);
      }
    }
  }

  research.qualityGate = {
    score: assessment.score,
    verdict: 'enriched',
    gaps,
    enriched: gaps.length > 0,
  };
  return research;
}
/**
 * Call the AI provider with automatic fallback.
 *
 * @param {object} provider   — resolved provider config
 * @param {string} prompt     — user/task prompt
 * @param {string} [systemHint] — system prompt / personality
 * @param {object} [options]
 * @param {boolean} [options.json=true]     — force JSON output (false = conversational text)
 * @param {boolean} [options.fallback=true] — try next provider if this one fails
 */
export async function callAiProvider(provider, prompt, systemHint, options = {}) {
  // Default: DeepSeek → Groq fallback chain (see PROVIDER_FALLBACK_CHAIN)
  const { json = true, fallback = options.fallback !== false } = options;
  try {
    if (provider.name === "gemini") return await callGemini(prompt, provider.model, systemHint, json);
    if (provider.name === "claude") return await callClaude(provider, prompt, systemHint);
    return await callOpenAiCompatible(provider, prompt, systemHint, json);
  } catch (err) {
    if (!fallback) throw err;
    const fallbackProvider = _resolveFallbackProvider(provider.name);
    if (!fallbackProvider) throw err;
    console.warn(`[AI] ${provider.name} failed (${err.message.slice(0, 80)}), falling back to ${fallbackProvider.name}`);
    return callAiProvider(fallbackProvider, prompt, systemHint, { ...options, fallback: false });
  }
}

/** Firm default: DeepSeek primary, Groq fallback. Gemini is never auto-used. */
const DEFAULT_PROVIDER_NAME = 'deepseek';
const PROVIDER_FALLBACK_CHAIN = ['deepseek', 'groq', 'cerebras', 'claude', 'perplexity'];

function _effectiveProviderName() {
  const raw = (process.env.AI_PROVIDER || DEFAULT_PROVIDER_NAME).toLowerCase();
  if (raw === 'gemini') return DEFAULT_PROVIDER_NAME;
  return raw;
}

/** Select the next available provider, skipping the one that just failed. */
function _resolveFallbackProvider(excludeName) {
  const explicit = _effectiveProviderName();
  const chain = explicit && explicit !== excludeName
    ? [explicit, ...PROVIDER_FALLBACK_CHAIN]
    : PROVIDER_FALLBACK_CHAIN;
  for (const name of chain) {
    if (name === excludeName) continue;
    const p = _resolveProviderByName(name);
    if (p) return p;
  }
  return null;
}

async function callGemini(prompt, model, systemHint, json = true) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // Gemini uses a dedicated "system_instruction" field (equivalent to Claude's system prompt).
  // Without this the blogSystemHint was silently dropped, causing JSON format failures.
  const systemInstruction = systemHint
    ? { parts: [{ text: systemHint }] }
    : undefined;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: json ? 0.72 : 0.82,
      // Only force JSON MIME for structured tasks (publishing pipeline, extraction).
      // Conversational chat MUST use text/plain — otherwise Gemini wraps every
      // response in a JSON string which the VA sends verbatim to the user.
      ...(json ? { responseMimeType: "application/json" } : { responseMimeType: "text/plain" }),
      // Gemini 2.5 Flash supports up to 65K output tokens.
      // A full 10-chapter book at 1,800–2,500 words/chapter in JSON needs
      // ~40,000–60,000 tokens. Without this, Gemini defaults to ~8K and
      // silently truncates the response mid-JSON, causing parse failures.
      maxOutputTokens: json ? Number(process.env.AI_MAX_TOKENS || 65536) : 1024,
    }
  };
  if (systemInstruction) body.system_instruction = systemInstruction;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini generation failed with ${response.status}: ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }
  return text;
}

async function callClaude(provider, prompt, systemHint) {
  const system = systemHint || "You are an expert content writer. Return strict, valid JSON only — no markdown fences, no commentary.";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type":      "application/json",
      "x-api-key":         provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      provider.model,
      // claude-sonnet-4-5 supports 64K output tokens.
      // A 10-chapter book in JSON needs ~40-60K tokens. 8K truncates silently.
      max_tokens: Number(process.env.AI_MAX_TOKENS || 32000),
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude generation failed with ${response.status}: ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const text = payload.content?.[0]?.text?.trim();
  if (!text) throw new Error("Claude returned an empty response.");
  return text;
}

async function callOpenAiCompatible(provider, prompt, systemHint, json = true) {
  const defaultSystem = json
    ? "You are a senior nonfiction editor. Return strict JSON only."
    : "You are a helpful, professional assistant. Respond naturally in plain text.";
  const systemMsg = systemHint || defaultSystem;
  const response = await fetch(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Authorization": `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user",   content: prompt    },
      ],
      stream: false,
      temperature: json ? 0.78 : 0.82,
      // 5,000 tokens is less than two full chapters. Raise to allow full book output.
      max_tokens: json ? Number(process.env.AI_MAX_TOKENS || 32000) : 1024,
      // Only include response_format for structured JSON tasks.
      // Cerebras/DeepSeek with json_object on a chat prompt forces a JSON wrapper
      // around conversational text, breaking the VA widget.
      // deepseek-chat does not support thinking/reasoning_effort — only deepseek-reasoner does
      ...(json && provider.name !== "deepseek" ? { response_format: { type: "json_object" } } : {}),
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider.name} generation failed with ${response.status}: ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error(`${provider.name} returned an empty response.`);
  }
  return text;
}



function _buildProviderRegistry() {
  return {
    deepseek: process.env.DEEPSEEK_API_KEY ? {
      name:    'deepseek',
      apiKey:  process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      model:   process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    } : null,
    groq: process.env.GROQ_API_KEY ? {
      name:    'groq',
      apiKey:  process.env.GROQ_API_KEY,
      baseUrl: 'https://api.groq.com/openai/v1',
      model:   process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    } : null,
    cerebras: process.env.CEREBRAS_API_KEY ? {
      name:    'cerebras',
      apiKey:  process.env.CEREBRAS_API_KEY,
      baseUrl: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
      model:   process.env.CEREBRAS_MODEL || 'llama-4-scout-17b-16e-instruct',
    } : null,
    claude: process.env.CLAUDE_API_KEY ? {
      name:   'claude',
      apiKey: (process.env.CLAUDE_API_KEY || '').trim(),
      model:  (process.env.CLAUDE_MODEL || 'claude-sonnet-4-5').trim(),
    } : null,
    perplexity: process.env.PERPLEXITY_API_KEY ? {
      name:    'perplexity',
      apiKey:  process.env.PERPLEXITY_API_KEY,
      baseUrl: 'https://api.perplexity.ai',
      model:   process.env.PERPLEXITY_MODEL || 'sonar-pro',
    } : null,
    // Opt-in only — set AI_PROVIDER=gemini explicitly; never auto-selected
    gemini: process.env.GEMINI_API_KEY ? {
      name:   'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      model:  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    } : null,
  };
}

function _resolveProviderByName(name) {
  const providers = _buildProviderRegistry();
  return providers[name?.toLowerCase()] || null;
}

export function resolveProvider(overrideName) {
  const requested = (overrideName || _effectiveProviderName()).toLowerCase();

  // Explicit request (including default deepseek)
  const direct = _resolveProviderByName(requested);
  if (direct) return direct;

  // Requested provider has no key — walk firm chain (never auto-pick gemini)
  for (const name of PROVIDER_FALLBACK_CHAIN) {
    const p = _resolveProviderByName(name);
    if (p) return p;
  }
  return _resolveProviderByName('gemini');
}

/**
 * Resolve a provider specifically for research tasks.
 * Prefers Perplexity (built-in web search) → Groq → Claude → others.
 * Falls back to the default provider if none are research-optimised.
 */
export function resolveResearchProvider() {
  return resolveProvider('perplexity') || resolveProvider('groq') || resolveProvider();
}

/** Long-form editorial — DeepSeek primary, Groq fallback (same firm chain). */
export function resolveEditorialProvider() {
  return resolveProvider();
}



function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Gemini did not return parseable JSON.");
    return JSON.parse(match[0]);
  }
}

function clean(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
