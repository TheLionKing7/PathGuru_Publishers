/**
 * assistantGuard — a deterministic last line between Aria and the public web.
 *
 * WHY THIS EXISTS, GIVEN THE SYSTEM PROMPT ALREADY FORBIDS ALL OF THIS
 *
 * Aria's system prompt has a thorough trade-secret section. It is a good prompt.
 * It is also a *request*, and the published evidence on making a model obey one
 * under adversarial pressure is bleak: a October 2025 paper from OpenAI, Anthropic
 * and Google DeepMind jointly broke twelve published prompt-injection defences at
 * over 90% attack success, most of which had originally reported near-zero. NIST
 * measured the same defence at 11% attack success under a baseline attack and 81%
 * under a real red team.
 *
 * The conclusion the field has reached is not "write a better prompt". It is:
 * assume the model will be talked into something eventually, and make sure the
 * damage is bounded by something that does not reason. This file is that thing.
 *
 * It cannot be argued with, flattered, role-played around, or told it is in
 * developer mode, because it is a string match. That is the entire design.
 *
 * SCOPE — deliberately narrow. This blocks the disclosures that are (a) concrete
 * enough to match reliably and (b) genuinely costly if they leak. It is not a
 * general safety filter and must not be sold as one. Judgement still lives in the
 * prompt; this only catches the specific nouns.
 */

/** Vendors and infrastructure. Naming any of these tells a competitor how we are built. */
const VENDORS = [
  'claude', 'anthropic', 'openai', 'chatgpt', 'gpt-4', 'gpt-5', 'groq', 'perplexity',
  'gemini', 'llama', 'mistral', 'deepseek', 'supabase', 'postgres', 'postgresql',
  'vercel', 'railway', 'cloudflare', 'upstash', 'redis', 'notion', 'onesignal',
  'twilio', 'resend', 'stripe', 'paystack', 'flutterwave', 'n8n', 'next.js', 'nextjs',
];

/** Internal agent names. These reveal the whole operating architecture in one word. */
const AGENTS = [
  'nexus', 'atlas', 'nova', 'aether', 'pulse', 'synthesizer', 'orion', 'researcher',
  'pathguru', 'gurucms',
];

/**
 * Money. Any currency figure at all — Aria is instructed never to quote pricing, and
 * a number with a currency symbol in front of it is the failure we care about.
 * Deliberately broad: a false positive costs one redirected sentence, a false
 * negative costs a negotiating position.
 */
const MONEY = /(?:[$£€₦]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|ngn|gbp|eur|naira|dollars?|pounds?)\b)/i;

const REDIRECT =
  "That's proprietary to how we operate — what I can tell you is the impact it creates. " +
  "What are you actually trying to fix in your business?";

function wordRe(term) {
  // Escape regex metacharacters (next.js has a dot) and require word boundaries so
  // "atlas" does not fire on "atlassian" and "nova" does not fire on "innovation".
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i');
}

const VENDOR_RES = VENDORS.map(wordRe);
const AGENT_RES = AGENTS.map(wordRe);

/**
 * Inspect a drafted reply before it is sent.
 * @returns {{ safe: boolean, reply: string, violations: string[] }}
 */
export function guardAssistantReply(draft) {
  const text = String(draft ?? '');
  const violations = [];

  VENDORS.forEach((term, i) => {
    if (VENDOR_RES[i].test(text)) violations.push(`vendor:${term}`);
  });
  AGENTS.forEach((term, i) => {
    if (AGENT_RES[i].test(text)) violations.push(`agent:${term}`);
  });
  if (MONEY.test(text)) violations.push('pricing');

  if (violations.length === 0) return { safe: true, reply: text, violations: [] };

  // Replace wholesale rather than redact in place. A reply with holes in it advertises
  // that something was removed, which is an invitation to keep probing — and a partial
  // redaction still leaks the shape of the answer.
  return { safe: false, reply: REDIRECT, violations };
}

/**
 * Cheap pre-screen on the *inbound* message. This does not block — a visitor asking
 * "what AI do you use?" is a normal question and deserves Aria's normal redirect, not
 * a refusal. It exists so the caller can log probing and watch for a pattern.
 */
export function looksLikeProbing(message) {
  const m = String(message ?? '').toLowerCase();
  return [
    /ignore (all )?(previous|prior|above) instructions?/,
    /system prompt/, /your (instructions|prompt|rules)/,
    /developer mode/, /jailbreak/, /pretend you are/, /you are now/,
    /repeat (everything|the text) above/, /what (model|llm|ai) (are|do) you/,
    /who (built|made|created) you/, /reveal|disclose|leak/,
  ].some((re) => re.test(m));
}

export const _internals = { VENDORS, AGENTS, MONEY, REDIRECT };
