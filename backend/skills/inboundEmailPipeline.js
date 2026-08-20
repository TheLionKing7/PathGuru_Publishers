/**
 * DigiFusion Intelligence Network — Inbound Email Pipeline
 * =========================================================
 * Pure helpers for the three-stage inbound-email handling pipeline:
 *   1. classify + extract
 *   2. grounded composition (capability corpus)
 *   3. fixed-shape first-touch reply (word cap, no pricing/scope/timeline)
 *
 * Kept dependency-free (except fs/path/url) so routing, the word cap and the
 * grounding check are unit-testable without an LLM or Supabase.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CLASSIFICATION_CATEGORIES = [
  'client_enquiry',
  'partner_approach',
  'vendor_pitch',
  'recruiter',
  'newsletter',
  'notification',
  'support',
  'not_a_fit',
  'other',
];

// Categories that produce a draft. not_a_fit drafts a polite decline, not silence.
export const DRAFTABLE_CATEGORIES = ['client_enquiry', 'partner_approach', 'not_a_fit'];

export const MAX_FIRST_TOUCH_WORDS = 120;

export function shouldDraft(category) {
  return DRAFTABLE_CATEGORIES.includes(category);
}

export function countWords(text) {
  const t = String(text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

// ── Grounding check ──────────────────────────────────────────────────────────
// Terms that signal a capability assertion. A draft sentence asserting one of
// these that is absent from the capability corpus is treated as an ungrounded
// claim. `exact` terms are matched on word boundaries so "ai" does not fire on
// "email" or "claim".
const CAPABILITY_SIGNALS = [
  { term: 'artificial intelligence', exact: false },
  { term: 'machine learning',       exact: false },
  { term: 'language model',         exact: false },
  { term: 'ai',                     exact: true },
  { term: 'ml',                     exact: true },
  { term: 'llm',                    exact: true },
  { term: 'nlp',                    exact: true },
  { term: 'saas',                   exact: true },
  { term: 'recommendation',         exact: false },
  { term: 'recommender',            exact: false },
  { term: 'algorithm',              exact: false },
  { term: 'predictive',             exact: false },
  { term: 'automation',             exact: false },
  { term: 'automate',               exact: false },
  { term: 'platform',               exact: false },
  { term: 'neural',                 exact: false },
  { term: 'chatbot',                exact: false },
];

function containsSignal(haystack, { term, exact }) {
  const h = String(haystack || '').toLowerCase();
  if (exact) return new RegExp(`\\b${term}\\b`, 'i').test(h);
  return h.includes(term);
}

/**
 * Return the sentences that assert a capability whose term is absent from the
 * corpus. Used as a post-generation flag rather than a silent acceptance.
 */
export function findUngroundedClaims(draftBody, corpus = '') {
  const sentences = String(draftBody || '').split(/(?<=[.!?])\s+/);
  const flags = [];
  for (const sentence of sentences) {
    const ungrounded = [];
    for (const signal of CAPABILITY_SIGNALS) {
      if (containsSignal(sentence, signal) && !containsSignal(corpus, signal)) {
        ungrounded.push(signal.term);
      }
    }
    if (ungrounded.length) flags.push({ sentence: sentence.trim(), ungrounded });
  }
  return flags;
}

// ── Word cap (stage 3) ───────────────────────────────────────────────────────

/**
 * Enforce the first-touch word ceiling. If over the cap, call `regenerate` once;
 * if still over, flag rather than silently accept.
 */
export async function enforceWordCap(draftBody, regenerate) {
  if (!draftBody) return { draftBody, regenerated: false, flagged: false };
  if (countWords(draftBody) <= MAX_FIRST_TOUCH_WORDS) {
    return { draftBody, regenerated: false, flagged: false };
  }
  const second = typeof regenerate === 'function' ? await regenerate() : null;
  if (second && countWords(second) <= MAX_FIRST_TOUCH_WORDS) {
    return { draftBody: second, regenerated: true, flagged: false };
  }
  console.log('[Draft] exceeds 120 words after one regeneration — flagged');
  return { draftBody: second || draftBody, regenerated: Boolean(second), flagged: true };
}

// ── Corpus + prompts ─────────────────────────────────────────────────────────

export function loadCapabilityCorpus() {
  try {
    return readFileSync(join(__dirname, '..', 'data', 'capability-corpus.md'), 'utf8');
  } catch {
    return '';
  }
}

export function buildClassificationPrompt(payload, corpus = '') {
  const from    = String(payload.from || '').trim();
  const subject = String(payload.subject || '').trim();
  const body    = String(payload.body || '').trim();
  return `Classify this inbound email into exactly ONE category and extract structured facts.
FIRM CONTEXT (what the firm does — use this to judge whether an enquiry is a fit):
${corpus || '(unknown — fall back to the category descriptions)'}

Return ONLY a valid JSON object with this exact schema:
{
  "category": "client_enquiry|partner_approach|vendor_pitch|recruiter|newsletter|notification|support|not_a_fit|other",
  "extracted": {
    "senderName": "full name if present, else empty string",
    "organisation": "organisation/company if present, else empty string",
    "statedNeed": "the sender's stated need, verbatim where possible, else empty string",
    "timelineSignal": "any timeline or deadline mentioned, else empty string",
    "budgetSignal": "any budget or price mentioned, else empty string",
    "referralSource": "how they heard of the firm, else empty string"
  }
}
Categories:
- client_enquiry: a prospective client asking about working with the firm.
- partner_approach: another firm or individual proposing a partnership or collaboration.
- vendor_pitch: someone selling to us (software, services, agency, etc.).
- recruiter: a recruiter or headhunting outreach.
- newsletter: a bulk newsletter or broadcast we did not solicit.
- notification: an automated system notification (delivery, platform, security).
- support: an existing client or customer asking for help.
- not_a_fit: a genuine enquiry that is not a fit for what the firm does (out of scope or unqualified). Still warrants a reply — a polite decline, not silence.
- other: anything that does not fit the above.
Choose exactly one category. Never invent facts; leave extracted fields empty when absent.

FROM: ${from}
SUBJECT: ${subject}

BODY:
${body}`;
}

export function buildDraftPrompt(payload, extracted = {}, corpus = '', category = 'client_enquiry') {
  const from    = String(payload.from || '').trim();
  const to      = String(payload.to || '').trim();
  const subject = String(payload.subject || '').trim();
  const body    = String(payload.body || '').trim();
  const e = extracted || {};
  const shapeRule = category === 'not_a_fit'
    ? `Shape rule: acknowledge the enquiry politely and decline it briefly — the sender is not a fit for what the firm does. Do not propose a next step or ask a qualifying question. Keep the whole reply under ${MAX_FIRST_TOUCH_WORDS} words. Never state pricing, scope, or timeline. Do not write any closing signature, sign-off block, name, or title — the signature is appended by the system.`
    : `Shape rule: acknowledge the specific ask, ask exactly ONE qualifying question, and propose ONE concrete next step (default: the FrictionIQ diagnostic). Keep the whole reply under ${MAX_FIRST_TOUCH_WORDS} words. Never state pricing, scope, or timeline on a first reply. Do not write any closing signature, sign-off block, name, or title — the signature is appended by the system.`;
  return `Draft a first-touch email reply to this inbound message.
Grounding rule: assert nothing about the firm that is not in the CAPABILITY CORPUS below. Where the enquiry touches something absent from the corpus, ask a question instead of making a claim.
${shapeRule}
Return ONLY a valid JSON object with this exact schema:
{
  "draftSubject": "RE: ...",
  "draftBody": "the full reply body"
}

CAPABILITY CORPUS:
${corpus || '(empty — assert nothing about the firm)'}

FROM: ${from}
TO: ${to}
SUBJECT: ${subject}

EXTRACTED FACTS:
Sender: ${e.senderName || '—'}
Organisation: ${e.organisation || '—'}
Stated need: ${e.statedNeed || '—'}
Timeline: ${e.timelineSignal || '—'}
Budget: ${e.budgetSignal || '—'}
Referral: ${e.referralSource || '—'}

BODY:
${body}`;
}
