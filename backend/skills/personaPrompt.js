/**
 * Persona prompt injection — composes the persona descriptor + few-shot
 * samples into reusable prompt fragments. Called by blog/social/email/sales
 * builders so the persona system is the single source of voice truth.
 *
 * The fragments are split because different models handle few-shot best in
 * different positions (system message vs. user message). We expose both.
 */

import { getPersonaById, selectPersonaForNiche } from './personas.js';

/**
 * @typedef {object} PersonaProfile
 * @property {string} id
 * @property {string} displayName
 * @property {string} title
 * @property {string} bio
 * @property {string[]} expertise
 * @property {string} voice
 * @property {string} rhythm
 * @property {string[]} vocabulary
 * @property {string[]} banList
 * @property {{ context: string, text: string }[]} samples
 */

/**
 * Returns a single text block describing the persona's voice constraints.
 * Suitable for the system message OR the user message prefix.
 *
 * @param {PersonaProfile} persona
 * @returns {string}
 */
export function describePersona(persona) {
  if (!persona) return '';
  const vocab = (persona.vocabulary || []).slice(0, 12).join(', ');
  const bans  = (persona.banList    || []).slice(0, 12).join(', ');

  return [
    `## Author voice`,
    `You are writing as: ${persona.displayName} (${persona.title}).`,
    `Bio (background context, do not restate verbatim): ${persona.bio}`,
    ``,
    `Voice:   ${persona.voice}`,
    `Rhythm:  ${persona.rhythm}`,
    vocab ? `Phrases this author uses naturally: ${vocab}` : '',
    bans  ? `Phrases and clichés to NEVER use: ${bans}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Returns a few-shot block with 2-3 sample paragraphs of this persona's
 * actual writing, framed as "here's how this author writes". Intended to
 * sit in the user message, just before the task instructions.
 */
export function fewShotPersonaSamples(persona) {
  if (!persona?.samples?.length) return '';

  const blocks = persona.samples.slice(0, 3).map((s, i) => {
    return `### Sample ${i + 1} — ${s.context}\n${s.text}`;
  });

  return [
    `## How this author writes (study these — match the cadence, sentence length, and discipline of specificity)`,
    blocks.join('\n\n'),
  ].join('\n\n');
}

/**
 * Compact "byline metadata" suitable for attaching to the generated post
 * as author info (e.g. inserted into the published HTML or returned in
 * the API response).
 */
export function personaBylineMeta(persona) {
  if (!persona) return null;
  return {
    id:          persona.id,
    displayName: persona.displayName,
    title:       persona.title,
    bio:         persona.bio,
    avatar:      persona.avatar || null,
  };
}

/**
 * Helper for endpoints that want to validate a request's persona override.
 * Resolves `personaId` to a profile, falling back to a default selector.
 *
 * @param {string|null} personaId
 * @param {() => PersonaProfile|null} fallback   producer for the default if no id was supplied
 * @returns {PersonaProfile}
 */
export function resolvePersona(personaId, fallback) {
  if (personaId) {
    const found = getPersonaById(personaId);
    if (found) return found;
  }
  return fallback?.() || null;
}

/**
 * Compose persona context with the caller's task prompts into the final
 * payload sent to the model. This is the shared injection point used by
 * the editorial pipeline AND the new endpoints (/api/social, /api/email,
 * /api/sales-copy) so persona behaviour stays consistent.
 *
 * Strategy:
 *   - Persona voice descriptor (voice / rhythm / vocabulary / banList) goes
 *     into the SYSTEM message, after any caller-supplied system text.
 *   - Persona few-shot samples go at the TOP of the USER message, before
 *     the task instructions, framed as "study how this author writes".
 *
 * Returns both `{ system, user }` (for OpenAI-compatible chat APIs that
 * take a messages array) and a collapsed `prompt` string (for Gemini-style
 * single-prompt providers). Callers pick whichever shape they need.
 *
 * @param {object} input
 * @param {PersonaProfile|null} input.persona
 * @param {string} [input.system]   base system prompt (task framing). Optional.
 * @param {string} input.user       task instructions / user message
 * @returns {{
 *   system:   string,
 *   user:     string,
 *   messages: Array<{role:'system'|'user', content:string}>,
 *   prompt:   string,
 *   persona:  ReturnType<typeof personaBylineMeta>
 * }}
 */
export function injectPersonaIntoPrompt({ persona, system = '', user = '' }) {
  const voiceBlock = persona ? describePersona(persona) : '';
  const fewShot    = persona ? fewShotPersonaSamples(persona) : '';

  const composedSystem = [system, voiceBlock].filter(Boolean).join('\n\n');
  const composedUser   = [fewShot, user].filter(Boolean).join('\n\n');

  const messages = [];
  if (composedSystem) messages.push({ role: 'system', content: composedSystem });
  if (composedUser)   messages.push({ role: 'user',   content: composedUser });

  // Flat-prompt collapse for providers that take a single string (Gemini).
  const prompt = [composedSystem, composedUser].filter(Boolean).join('\n\n');

  return {
    system:  composedSystem,
    user:    composedUser,
    messages,
    prompt,
    persona: personaBylineMeta(persona),
  };
}

/**
 * One-shot convenience for endpoints that just want "give me a persona-
 * injected prompt for this niche / post type / explicit override". Resolves
 * the persona, then calls injectPersonaIntoPrompt.
 *
 * Resolution order:
 *   1. explicit personaId (if provided and valid)
 *   2. niche + postType via selectPersonaForNiche()
 *   3. null (returned shape will have no persona context — caller decides)
 *
 * @param {object} input
 * @param {string} [input.personaId]   explicit override, e.g. from request body
 * @param {string} [input.niche]       editorial niche key (marketing, wellness, etc.)
 * @param {string} [input.postType]    listicle / review / how-to / etc.
 * @param {string} [input.system]      base system prompt
 * @param {string}  input.user         task instructions
 */
export function buildPersonaPrompt({ personaId, niche, postType, system, user }) {
  const persona =
    (personaId ? getPersonaById(personaId) : null) ||
    (niche     ? selectPersonaForNiche(niche, postType) : null) ||
    null;
  return injectPersonaIntoPrompt({ persona, system, user });
}
