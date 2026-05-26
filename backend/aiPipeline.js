import { runResearchAgent, fallbackResearch } from './skills/research.js';
import { buildEditorialPrompt, parseEditorialResponse, normalizeSection } from './skills/editorial.js';
import { runDesignAgent } from './skills/design.js';
import { runFormattingAgent } from './skills/formatting.js';
import { getLibraryContext } from './referenceLibrary.js';

export async function createAiPublishingPackage(input, baseProject) {
  const provider = resolveProvider();
  const hasTavily = Boolean(process.env.TAVILY_API_KEY);

  if (!provider) {
    return {
      source: "fallback",
      research: fallbackResearch(input, baseProject),
      manuscript: null,
      notes: ["No AI provider key is configured, so PathGuru used the deterministic fallback draft."]
    };
  }

  // ── Phase 1: Research ─────────────────────────────────────────────────
  console.log('[PathGuru AI] Phase 1: Running research agent...');
  const rawResearch = hasTavily
    ? await runResearchAgent(input, baseProject)
    : fallbackResearch(input, baseProject);

  // ── Phase 2: Editorial Quality Gate — assess & approve research ───────
  console.log('[PathGuru AI] Phase 2: Editorial quality gate — assessing research depth...');
  const approvedResearch = await assessAndApproveResearch(rawResearch, input, baseProject, provider);

  // ── Phase 3: Editorial writing ────────────────────────────────────────
  console.log('[PathGuru AI] Phase 3: Writing manuscript from approved research brief...');
  const manuscript = await runEditorialAgents(input, baseProject, approvedResearch, provider);

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
    notes: hasTavily
      ? ["Research → Quality Gate → Editorial → Design pipeline completed."]
      : ["TAVILY_API_KEY is not configured. Research used an internal brief — add TAVILY_API_KEY for live data."]
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
async function runEditorialAgents(input, project, research, provider) {
  // Inject reference library context for the publisher's style
  const style = project.publisherProfile?.resolvedStyle || input.style || 'modern';
  const libraryContext = await getLibraryContext(style).catch(() => '');
  const prompt = buildEditorialPrompt(input, project, research, undefined, libraryContext);
  const text = await callAiProvider(provider, prompt);
  const parsed = parseEditorialResponse(text);

  if (!parsed.sections || !Array.isArray(parsed.sections)) {
    throw new Error(`${provider.name} returned an invalid publishing package.`);
  }

  return {
    title: clean(parsed.title, project.title),
    subtitle: clean(parsed.subtitle, project.subtitle),
    positioning: clean(parsed.positioning, ""),
    writingPersonality: clean(parsed.writingPersonality, input.writingPersonality || "expert guide"),
    proofreaderNotes: Array.isArray(parsed.proofreaderNotes) ? parsed.proofreaderNotes : [],
    sections: parsed.sections.map(normalizeSection),
    citations: Array.isArray(parsed.citations) ? parsed.citations : research.sources
  };
}

export async function callAiProvider(provider, prompt, systemHint) {
  if (provider.name === "gemini")  return callGemini(prompt, provider.model, systemHint);
  if (provider.name === "claude")  return callClaude(provider, prompt, systemHint);
  return callOpenAiCompatible(provider, prompt, systemHint);
}

async function callGemini(prompt, model, systemHint) {
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
      temperature: 0.72,
      responseMimeType: "application/json",
      // Gemini 2.5 Flash supports up to 65K output tokens.
      // A full 10-chapter book at 1,800–2,500 words/chapter in JSON needs
      // ~40,000–60,000 tokens. Without this, Gemini defaults to ~8K and
      // silently truncates the response mid-JSON, causing parse failures.
      maxOutputTokens: Number(process.env.AI_MAX_TOKENS || 65536),
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

async function callOpenAiCompatible(provider, prompt, systemHint) {
  const systemMsg = systemHint || "You are a senior nonfiction editor. Return strict JSON only.";
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
      temperature: 0.78,
      // 5,000 tokens is less than two full chapters. Raise to allow full book output.
      max_tokens: Number(process.env.AI_MAX_TOKENS || 32000),
      response_format: { type: "json_object" },
      ...(provider.name === "deepseek" ? {
        thinking: { type: process.env.DEEPSEEK_THINKING || "disabled" },
        reasoning_effort: process.env.DEEPSEEK_REASONING_EFFORT || "high"
      } : {})
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



export function resolveProvider(overrideName) {
  const requested = (overrideName || process.env.AI_PROVIDER || "").toLowerCase();
  const providers = {
    gemini: process.env.GEMINI_API_KEY ? {
      name:   "gemini",
      apiKey: process.env.GEMINI_API_KEY,
      model:  process.env.GEMINI_MODEL || "gemini-2.5-flash",
    } : null,
    claude: process.env.CLAUDE_API_KEY ? {
      name:   "claude",
      apiKey: process.env.CLAUDE_API_KEY,
      model:  process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
    } : null,
    deepseek: process.env.DEEPSEEK_API_KEY ? {
      name:    "deepseek",
      apiKey:  process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      model:   process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    } : null,
    cerebras: process.env.CEREBRAS_API_KEY ? {
      name:    "cerebras",
      apiKey:  process.env.CEREBRAS_API_KEY,
      baseUrl: process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1",
      model:   process.env.CEREBRAS_MODEL || "gpt-oss-120b",
    } : null,
  };

  if (requested && providers[requested]) return providers[requested];
  // Priority: Gemini → Claude → DeepSeek → Cerebras
  return providers.gemini || providers.claude || providers.deepseek || providers.cerebras || null;
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
