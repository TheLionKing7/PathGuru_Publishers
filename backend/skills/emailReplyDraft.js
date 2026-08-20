/**
 * DigiFusion Intelligence Network — Email Reply Draft
 * ===================================================
 * Deterministic guards for outbound email drafts. The signature is a single
 * exported constant so it is changed in one place and never invented by the
 * model; the internal-name strip is enforced in code because a rule that only
 * lives in a prompt is a rule the model will eventually ignore.
 */

export const REPLY_SIGNATURE = `Boroji Adebayo-Hopewell
Lead Architect - Digital Fusion Labs`;

// Internal agent + system names that must never appear in an outbound email.
export const INTERNAL_NAMES = [
  'Nexus',
  'Aria',
  'PathGuru',
  'Pulse',
  'Synthesizer',
  'Aether',
  'DigiFusion Intelligence Network',
];

/**
 * Strip any line that leaks an internal agent or system name. Runs on every
 * generated draft before it is stored.
 */
export function stripInternalNames(draftBody) {
  if (!draftBody) return draftBody;
  const kept = [];
  for (const line of String(draftBody).split('\n')) {
    const lower = line.toLowerCase();
    const hit = INTERNAL_NAMES.find((name) => lower.includes(name.toLowerCase()));
    if (hit) {
      console.log(`[Draft] internal name stripped: ${hit}`);
    } else {
      kept.push(line);
    }
  }
  return kept.join('\n');
}

/**
 * Finalise a generated draft for storage: strip internal names, then append the
 * human signature (the model is instructed never to write a signature itself).
 */
export function finalizeEmailDraft(draftBody) {
  if (!draftBody) return draftBody;
  const stripped = stripInternalNames(draftBody).trim();
  if (!stripped) return null;
  return `${stripped}\n\n${REPLY_SIGNATURE}`;
}
