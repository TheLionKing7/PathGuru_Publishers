/**
 * Engagement routing — which service-line agent owns an engagement, and which
 * framework they run.
 *
 * THREE SERVICE LINES, THREE SPECIALIST AGENTS:
 *   · ai-automation        → Nova   — Automation Engineering & AI Systems Director
 *   · business-development → Atlas  — Business Developer & Strategist
 *   · digital-media        → Aether — Copywriter & Marketing Specialist
 *
 * Orion (id `researcher`) is the Intelligence & Research Specialist and serves
 * every line — it is not a service-line owner.
 *
 * Nexus is the Digital CEO & Operational Commander: it oversees every agent and
 * can override an auto-routed assignment. Routing here is automatic and
 * deterministic; Nexus is the governance layer on top of it.
 *
 * Pure and deterministic: the answer is a function of track, segment, sector and
 * headcount, never of a human's guess. This is the "assigned to the appropriate
 * agent, who runs the firm's appropriate framework" step that the operating
 * envelope (migration 0027) exists to record.
 *
 * The agent roster and framework registry are owned by firmFrameworks.js; this
 * module holds only the ROUTING between an engagement's facts and that registry.
 * Adding or renaming a framework in the registry does not change anything here
 * unless the routing rule itself should change.
 *
 * ── NEVER GUESSES ─────────────────────────────────────────────────────────────
 * An unknown track returns nulls, not a default agent. Assigning a prospect to
 * the wrong lane is worse than leaving the lane unset, because a wrong lane is
 * invisible until the work is already in the wrong hands.
 */

import { architectureForSegment } from './firmFrameworks.js';

/** Practice-area track → service-line agent. The three practice areas are the
 *  only tracks that carry a service line, so they are the only tracks that
 *  route to a specialist — one agent per line, never cross-assigned. */
const TRACK_AGENT = {
  'ai-automation': 'nova',         // Nova   — Automation Engineering & AI Systems Director
  'business-development': 'atlas', // Atlas  — Business Developer & Strategist
  'digital-media': 'aether',       // Aether — Copywriter & Marketing Specialist
};

/** The operating framework each lane runs when no segment architecture applies.
 *  These are `access: 'internal'` — agent DNA, never handed to the client. */
const TRACK_OPERATING = {
  'ai-automation': 'ave',
  'business-development': 'deal-engine',
  'digital-media': 'c2c',
};

/** Aliases the two estates already use for the same three lanes. */
const TRACK_ALIASES = {
  automation: 'ai-automation',
  bd: 'business-development',
  business_development: 'business-development',
  digital_media: 'digital-media',
  media: 'digital-media',
};

/* Headcount bands the diagnostic captures as enterprise — EN-DASHES INCLUDED,
 * copied from digifusion/lib/frictioniq/architectures.ts. The 250 threshold is
 * a judgement that lives in one place there; it is mirrored here so the
 * operations layer and the storefront cannot route the same firm differently. */
const ENTERPRISE_BANDS = new Set([
  '250–999', '1,000+',            // as captured today
  '250-999', '1000+', '1,000-+',  // tolerated variants
]);

function normalizeTrack(track) {
  if (!track) return null;
  const t = String(track).trim().toLowerCase();
  if (TRACK_AGENT[t]) return t;
  return TRACK_ALIASES[t] || null;
}

/**
 * The framework for a business-development engagement.
 *
 * Regulation first, then segment, then size. A thirty-person fintech is a
 * fintech before it is an SME; a four-hundred-person manufacturer is an
 * enterprise before it is a manufacturer. Only when none of those resolves is
 * the operating framework (Deal Engine) the answer — which means we know the
 * lane but not yet the shape of the client.
 */
function frameworkForBd({ segment, sector, headcountBand }) {
  const bySector = architectureForSegment(sector);
  if (bySector) return bySector.id;

  const bySegment = architectureForSegment(segment);
  if (bySegment) return bySegment.id;

  /* client_accounts.segment uses a short id the registry does not carry. */
  if (String(segment || '').trim().toLowerCase() === 'gov') return 'govtech';

  const hc = String(headcountBand || '').trim();
  if (ENTERPRISE_BANDS.has(hc)) return 'enterprise-velocity';
  if (hc) return 'sme-scale-engine';   // a known size that is not an enterprise band

  return 'deal-engine';                 // cannot size them — the operating default
}

/**
 * Route an engagement to its delivery owner and framework.
 *
 * @param {object} [input]
 * @param {string} [input.track]        practice area, or a segment route ('small-business' | 'enterprise')
 * @param {string} [input.segment]      'sme' | 'enterprise' | 'gov' | 'startup' (client_accounts.segment)
 * @param {string} [input.sector]       industry, e.g. 'Financial services'
 * @param {string} [input.headcountBand] e.g. '250–999'
 * @returns {{ assigned_agent: string|null, framework_id: string|null, reason?: string }}
 */
export function routeEngagement({ track, segment, sector, headcountBand } = {}) {
  const t = normalizeTrack(track);
  if (!t) {
    return { assigned_agent: null, framework_id: null, reason: 'unknown track' };
  }

  const assigned_agent = TRACK_AGENT[t];
  const framework_id = t === 'business-development'
    ? frameworkForBd({ segment, sector, headcountBand })
    : TRACK_OPERATING[t];

  return { assigned_agent, framework_id };
}
