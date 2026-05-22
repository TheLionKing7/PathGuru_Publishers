import { runResearchAgent, fallbackResearch } from './skills/research.js';
import { buildEditorialPrompt, parseEditorialResponse } from './skills/editorial.js';
import { runDesignAgent } from './skills/design.js';
import { runFormattingAgent } from './skills/formatting.js';

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

  const research = hasTavily
    ? await runResearchAgent(input, baseProject)
    : fallbackResearch(input, baseProject);
  const manuscript = await runEditorialAgents(input, baseProject, research, provider);
  const designPackage = await runDesignAgent(input, baseProject, research, manuscript);
  const formatting = await runFormattingAgent(baseProject, manuscript, designPackage);

  return {
    source: provider.name,
    research,
    manuscript,
    design: designPackage,
    html: formatting.html,
    notes: hasTavily
      ? ["Research, copywriting, and proofreading agents completed."]
      : ["TAVILY_API_KEY is not configured, so research used an internal brief before copywriting."]
  };
}
async function runEditorialAgents(input, project, research, provider) {
  const prompt = buildEditorialPrompt(input, project, research);
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
  if (provider.name === "gemini")  return callGemini(prompt, provider.model);
  if (provider.name === "claude")  return callClaude(provider, prompt, systemHint);
  return callOpenAiCompatible(provider, prompt, systemHint);
}

async function callGemini(prompt, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.72,
        responseMimeType: "application/json"
      }
    })
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
      max_tokens: Number(process.env.AI_MAX_TOKENS || 8192),
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
      max_tokens: Number(process.env.AI_MAX_TOKENS || 5000),
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



function normalizeSection(section) {
  return {
    type: clean(section.type, "chapter"),
    title: clean(section.title, "Untitled Section"),
    body: clean(section.body, ""),
    designIntent: clean(section.designIntent, "Use clear hierarchy, generous spacing, and a practical reader takeaway.")
  };
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
