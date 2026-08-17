/**
 * Shared AI provider resolution — used by Command (agents, blog, CMS).
 * Book/KDP pipeline lives in TheScribe (aiPipeline.js).
 */

/** Firm default: DeepSeek primary, Groq fallback. Gemini is never auto-used. */
const DEFAULT_PROVIDER_NAME = 'deepseek';
const PROVIDER_FALLBACK_CHAIN = ['deepseek', 'groq', 'cerebras', 'claude', 'perplexity'];

function _effectiveProviderName() {
  const raw = (process.env.AI_PROVIDER || DEFAULT_PROVIDER_NAME).toLowerCase();
  if (raw === 'gemini') return DEFAULT_PROVIDER_NAME;
  return raw;
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

export function resolveProvider(overrideName) {
  const requested = (overrideName || _effectiveProviderName()).toLowerCase();
  const direct = _resolveProviderByName(requested);
  if (direct) return direct;
  for (const name of PROVIDER_FALLBACK_CHAIN) {
    const p = _resolveProviderByName(name);
    if (p) return p;
  }
  return _resolveProviderByName('gemini');
}

export function resolveResearchProvider() {
  return resolveProvider('perplexity') || resolveProvider('groq') || resolveProvider();
}

export function resolveEditorialProvider() {
  return resolveProvider();
}

export async function callAiProvider(provider, prompt, systemHint, options = {}) {
  const { json = true, fallback = options.fallback !== false } = options;
  try {
    if (provider.name === 'gemini') return await callGemini(prompt, provider.model, systemHint, json);
    if (provider.name === 'claude') return await callClaude(provider, prompt, systemHint);
    return await callOpenAiCompatible(provider, prompt, systemHint, json);
  } catch (err) {
    if (!fallback) throw err;
    const fallbackProvider = _resolveFallbackProvider(provider.name);
    if (!fallbackProvider) throw err;
    console.warn(`[AI] ${provider.name} failed (${err.message.slice(0, 80)}), falling back to ${fallbackProvider.name}`);
    return callAiProvider(fallbackProvider, prompt, systemHint, { ...options, fallback: false });
  }
}

async function callGemini(prompt, model, systemHint, json = true) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const systemInstruction = systemHint ? { parts: [{ text: systemHint }] } : undefined;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: json ? 0.72 : 0.82,
      ...(json ? { responseMimeType: 'application/json' } : { responseMimeType: 'text/plain' }),
      maxOutputTokens: json ? Number(process.env.AI_MAX_TOKENS || 65536) : 1024,
    },
  };
  if (systemInstruction) body.system_instruction = systemInstruction;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini generation failed with ${response.status}: ${errorText.slice(0, 240)}`);
  }
  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}

async function callClaude(provider, prompt, systemHint) {
  const system = systemHint || 'You are an expert content writer. Return strict, valid JSON only — no markdown fences, no commentary.';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type':      'application/json',
      'x-api-key':         provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      provider.model,
      max_tokens: Number(process.env.AI_MAX_TOKENS || 32000),
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude generation failed with ${response.status}: ${errorText.slice(0, 240)}`);
  }
  const payload = await response.json();
  const text = payload.content?.[0]?.text?.trim();
  if (!text) throw new Error('Claude returned an empty response.');
  return text;
}

async function callOpenAiCompatible(provider, prompt, systemHint, json = true) {
  const sendJsonFormat = json && provider.name !== 'deepseek';
  const defaultSystem = json
    ? 'You are a senior nonfiction editor. Return strict JSON only.'
    : 'You are a helpful, professional assistant. Respond naturally in plain text.';
  let systemMsg = systemHint || defaultSystem;

  // Groq (and other OpenAI-compatible providers) rejects json_object mode with a
  // 400 unless a message contains the literal word "json". Callers pass their own
  // persona system hints that never mention it, so guarantee it here — using the
  // lowercase word, since the provider check is on the literal string.
  if (sendJsonFormat && !systemMsg.includes('json') && !prompt.includes('json')) {
    systemMsg = `${systemMsg}\nRespond with a single valid json object — no markdown fences, no commentary.`;
  }

  const response = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type':  'application/json',
      Authorization:   `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: prompt },
      ],
      stream: false,
      temperature: json ? 0.78 : 0.82,
      max_tokens: json ? Number(process.env.AI_MAX_TOKENS || 32000) : 1024,
      ...(sendJsonFormat ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider.name} generation failed with ${response.status}: ${errorText.slice(0, 240)}`);
  }
  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${provider.name} returned an empty response.`);
  return text;
}
