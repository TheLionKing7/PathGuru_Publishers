/**
 * DigiFusion — Firm IP Framework Registry (canonical definitions)
 *
 * Consumed by firmKnowledge.js — the single integration point for agents and APIs.
 * Operating frameworks = agent DNA. Library products = paywalled Intelligence Library.
 */

/** Full operational doctrine — woven into Nexus + all agents via agentBase */
export const ENGAGEMENT_MODEL_DOCTRINE = `
THE DIGIFUSION ENGAGEMENT MODEL
================================
Proprietary 4-phase diagnostic and delivery architecture applied to every client engagement.
Phases 01–02 are delivered in the strategy session. Phases 03–04 begin after roadmap approval.

PHASE 01 — DISCOVERY & DIAGNOSTIC AUDIT (Week 1)
— Stakeholder mapping: decision-makers, process owners, contributors
— Process documentation: cycle times, error rates, manual touchpoints (Miro + screen-share)
— Bottleneck scoring: time cost × revenue impact × frequency × reversibility
— Cost-of-inaction calculation: (hourly rate × hours wasted) + downstream revenue impact
Deliverable: Diagnostic Audit Report with ranked bottleneck and validated workflow map.

PHASE 02 — GAP ANALYSIS & OPPORTUNITY MAPPING (Week 1–2)
— Current vs. future state mapping (automation, content, or pipeline interventions)
— Opportunity scoring matrix: implementation time, cost, reversibility, projected impact
— Market/competitive context for BD and digital media tracks
— Risk identification with mitigation built into roadmap
Deliverable: Gap Analysis Document with ranked opportunity matrix and risk mitigations.

PHASE 03 — SOLUTION DESIGN & ROADMAPPING (Week 2)
— Solution architecture: integrations, tools, workflows, content structures
— Phased delivery roadmap: 2-week sprints with acceptance criteria
— ROI projection and payback timeline (typically 90 days post go-live)
— Success criteria and KPI definition locked before build
Deliverable: Prioritised Roadmap with ROI projection and go/no-go decision point.

PHASE 04 — BUILD, DEPLOY & MEASURE (Weeks 3–6+)
— Sprint-based delivery with working outputs every 2 weeks
— Live performance monitoring (dashboards from day one)
— Post-launch optimisation window and handover documentation
Deliverable: Deployed solution + performance report vs. agreed KPIs.

Core principles: Diagnosis before prescription. ROI calculated, not assumed.
Strategy and execution inseparable. Measurement built in from day one.
`.trim();

export const FIRM_IP_FRAMEWORKS = [
  {
    id:        'ave',
    name:      'Automation Velocity Engine (AVE)',
    shortName: 'AVE',
    agent:     'nova',
    domain:    'automation',
    track:     'AI & SaaS Automation',
    kind:      'operating_framework',
    access:    'internal',
    kbSlug:    'automation-velocity-engine',
    r2Key:     'firm_ip/frameworks/automation-velocity-engine.pdf',
    oneLiner:  '5-phase system: Diagnose → Architect → Build → Deploy → Scale.',
  },
  {
    id:        'deal-engine',
    name:      'Deal Engine',
    shortName: 'Deal Engine',
    agent:     'atlas',
    domain:    'business_development',
    track:     'Business Development',
    kind:      'operating_framework',
    access:    'internal',
    kbSlug:    'deal-engine',
    r2Key:     'firm_ip/frameworks/deal-engine.pdf',
    oneLiner:  '4-phase BD orchestration fusing ABM, SPIN, Challenger, Miller Heiman, and Value Proposition Design.',
  },
  {
    id:        'c2c',
    name:      'Content-to-Capital Pipeline (C2C)',
    shortName: 'C2C Pipeline',
    agent:     'aether',
    domain:    'digital_media',
    track:     'Digital Media',
    kind:      'operating_framework',
    access:    'internal',
    kbSlug:    'content-to-capital-pipeline',
    r2Key:     'firm_ip/frameworks/content-to-capital-pipeline.pdf',
    oneLiner:  '4-phase system: Intelligence Audit → Authority Engine → Conversion Funnel → Distribution Flywheel.',
  },
  {
    id:        'engagement-model',
    name:      'DigiFusion Engagement Model',
    shortName: 'Engagement Model',
    agent:     'nexus',
    domain:    'general',
    track:     'How every engagement runs',
    kind:      'operating_framework',
    access:    'internal',
    kbSlug:    'digifusion-engagement-model',
    r2Key:     'firm_ip/frameworks/digifusion-engagement-model',
    source:    'digifusion/app/agency/methodology/page.tsx',
    oneLiner:  '4-phase delivery: Discovery Audit → Gap Analysis → Solution Design → Build, Deploy & Measure.',
  },
  {
    id:        'sme-scale-engine',
    name:      'SME Scale Engine (5-Pillar Framework)',
    shortName: 'SME Scale Engine',
    agent:     'atlas',
    domain:    'business_development',
    track:     'SME growth architecture',
    kind:      'sector_architecture',
    segments:  ['SME', 'Startup'],
    access:    'purchasable',
    kbSlug:    'sme-scale-up-blueprint-v3',
    r2Key:     'firm_ip/blueprints/sme-scale-up-blueprint-v3.pdf',
    oneLiner:  'Integrated SME revenue architecture weaving AVE, Deal Engine, and C2C into a 90-day activation plan.',
  },
  {
    id:        'enterprise-velocity',
    name:      'Enterprise Velocity Architecture',
    shortName: 'Enterprise Velocity',
    agent:     'atlas',
    domain:    'business_development',
    track:     'Enterprise segment',
    kind:      'sector_architecture',
    segments:  ['Enterprise', 'Large corporate'],
    access:    'purchasable',
    kbSlug:    'large-enterprise-blueprint-v3',
    r2Key:     'firm_ip/blueprints/large-enterprise-blueprint-v3.pdf',
    oneLiner:  '6 Velocity Drivers, KAM Engine, and C-suite engagement architecture for large corporations.',
  },
  {
    id:        'govtech',
    name:      'Public Sector Digital Transformation (GovTech 4-Layer)',
    shortName: 'GovTech',
    agent:     'atlas',
    domain:    'business_development',
    track:     'Government & public sector',
    kind:      'sector_architecture',
    segments:  ['Public sector / NGO'],
    access:    'purchasable',
    kbSlug:    'government-ministry-blueprint-v3',
    r2Key:     'firm_ip/blueprints/government-ministry-blueprint-v3.pdf',
    oneLiner:  '4-layer GovTech framework for MDA digital modernisation and procurement intelligence.',
  },
  {
    id:        'fira',
    name:      'Financial Intelligence & Revenue Architecture (FIRA)',
    shortName: 'FIRA',
    agent:     'atlas',
    domain:    'business_development',
    track:     'Financial services',
    kind:      'sector_architecture',
    access:    'purchasable',
    segments:  ['Financial services'],
    kbSlug:    'financial-institutions-blueprint-v3',
    r2Key:     'firm_ip/blueprints/financial-institutions-blueprint-v3.pdf',
    oneLiner:  '3-engine commercial architecture for banks, fintechs, and financial institutions.',
  },
  {
    /* ── KAM Engine ──────────────────────────────────────────────────────
     *
     * Registered as a framework in its own right, on instruction, and the
     * reasoning is worth recording because the entry was assembled from what
     * the estate already holds rather than invented.
     *
     * WHAT ESTABLISHES IT. It is named inside Enterprise Velocity
     * Architecture's description, and digitafusion/naming-unification-map.md
     * files it under "Digitafusion-native — no series equivalent", with the
     * explicit ruling that key-account management is scheduled for Book Three
     * Chapter 6 (The Expansion Engine) and that *the firm's version should
     * inform the book rather than the other way round*. So it precedes the
     * series and belongs to the firm.
     *
     * WHAT IT IS. The retention counterpart to Deal Engine. Deal Engine fuses
     * ABM, SPIN, Challenger, Miller Heiman and Value Proposition Design for
     * ACQUISITION; KAM Engine curates the same class of research for
     * EXPANSION — onboarding, success and account growth run as one governed
     * flow, with net revenue retention as the measure. Source methodologies
     * sit in reference-library/: the ABM guide, Challenger Sales, Core
     * Competence, the Market-Product Matrix, JTBD and McKinsey's Consumer
     * Decision Journey.
     *
     * WHAT IS NOT YET HERE. The full phase articulation lives in the
     * large-enterprise blueprint PDF in R2 and has never been extracted into
     * the knowledge base. `articulation: 'partial'` says so out loud, and the
     * agent context block below will not claim phases it cannot name. A
     * framework that describes itself as more complete than it is teaches an
     * agent to bluff in front of a client. */
    id:        'kam-engine',
    name:      'KAM Engine',
    shortName: 'KAM Engine',
    agent:     'atlas',
    domain:    'business_development',
    track:     'Account retention & expansion',
    kind:      'operating_framework',
    access:    'internal',
    articulation: 'partial',
    curatedFrom: [
      'Account-Based Marketing (complete guide)',
      'Challenger Sales Model',
      'Core Competence Framework',
      'Market-Product Matrix',
      'Jobs-To-Be-Done (JTBD)',
      "McKinsey Consumer Decision Journey",
    ],
    kbSlug:    'kam-engine',
    r2Key:     'firm_ip/blueprints/large-enterprise-blueprint-v3.pdf',
    oneLiner:  'Account retention and expansion as one governed flow — the Deal Engine counterpart, measured on net revenue retention.',
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   THE RESEARCH LIBRARY — NOT FRAMEWORKS
   ══════════════════════════════════════════════════════════════════════════

   These are published books. The agency may adopt their strategies when a
   situation calls for it, exactly as it would adopt Porter or Christensen —
   but they are research the firm can draw on, not method the firm runs on,
   and they must never be listed when someone asks what our frameworks are.

   They previously sat inside FIRM_IP_FRAMEWORKS, which meant frameworkNamesLine()
   told clients the firm had ten frameworks, two of which were somebody's paid
   media books. Separating them is the fix; the agents keep full access through
   getResearchForAgent() below.
   ══════════════════════════════════════════════════════════════════════════ */

export const FIRM_RESEARCH_LIBRARY = [
  {
    id:        'digital-ads-playbook',
    name:      'The Digital Ads Playbook',
    shortName: 'Digital Ads Playbook',
    agent:     'aether',
    domain:    'digital_media',
    track:     'Paid media & platform psychology',
    kind:      'author_ip',
    access:    'published',
    kbSlug:    'digital-ads-playbook',
    author:    'James Baldwin · PathFinda Publishers',
    oneLiner:  'Demand capture vs creation, Schwartz awareness on Google/Meta/TikTok, HSO, mechanism-first platform doctrine.',
  },
  {
    id:        'stop-buying-ads',
    name:      'Stop Buying Ads. Start Buying Customers.',
    shortName: 'Stop Buying Ads',
    agent:     'aether',
    domain:    'digital_media',
    track:     'Marketing economics & offer architecture',
    kind:      'author_ip',
    access:    'published',
    kbSlug:    'stop-buying-ads-start-buying-customers',
    author:    'James Baldwin · PathFinda Publishers',
    oneLiner:  'Unit economics (CAC/LTV/AOV), front-end cash recovery, 100-day post-purchase, Grand Slam Offer, Sovereign Database.',
  },
];

export const RESEARCH_IDS = FIRM_RESEARCH_LIBRARY.map(r => r.id);

export function getResearchForAgent(agentId) {
  if (['nexus', 'assistant', 'researcher', 'synthesizer'].includes(agentId)) {
    return FIRM_RESEARCH_LIBRARY;
  }
  return FIRM_RESEARCH_LIBRARY.filter(r => r.agent === agentId);
}

/** Additional Intelligence Library products (vertical blueprints) */
export const FIRM_IP_BLUEPRINTS = [
  {
    id: 'pce-v3', name: 'Pharma Commercial Excellence (PCE)', shortName: 'PCE',
    kbSlug: 'pharmaceutical-blueprint-v3',
    r2Key:  'firm_ip/blueprints/pharmaceutical-blueprint-v3.pdf',
    oneLiner: 'AI-augmented revenue strategy for pharma and life sciences in Africa.',
  },
  {
    id: 'hris-v3', name: 'Hospitality Revenue Intelligence (HRIS)', shortName: 'HRIS',
    kbSlug: 'hotel-hospitality-blueprint-v3',
    r2Key:  'firm_ip/blueprints/hotel-hospitality-blueprint-v3.pdf',
    oneLiner: 'AI-driven revenue optimisation for hotels and hospitality groups.',
  },
  {
    id: 'cimef-v3', name: 'Commodity Intelligence & Market Edge (CIMEF)', shortName: 'CIMEF',
    kbSlug: 'commodity-exchange-blueprint-v3',
    r2Key:  'firm_ip/blueprints/commodity-exchange-blueprint-v3.pdf',
    oneLiner: 'AI-driven trade intelligence for commodity traders and exchanges.',
  },
];

export const FRAMEWORK_IDS = FIRM_IP_FRAMEWORKS.map(f => f.id);

export function getFrameworkById(id) {
  return FIRM_IP_FRAMEWORKS.find(f => f.id === id) || null;
}

/* ── Reading the registry by kind ───────────────────────────────────────────
 *
 * Two accessors, because the two classes answer different questions and
 * conflating them is what produced the original mess.
 *
 * OPERATING FRAMEWORKS are the method the firm runs on — every engagement uses
 * them regardless of who the client is.
 *
 * SECTOR ARCHITECTURES are segment-specific and purchasable. They are the four
 * assets with the highest price tags and, until now, zero presence on
 * digitafusion.com.
 */

export const OPERATING_FRAMEWORKS =
  FIRM_IP_FRAMEWORKS.filter(f => f.kind === 'operating_framework');

export const SECTOR_ARCHITECTURES =
  FIRM_IP_FRAMEWORKS.filter(f => f.kind === 'sector_architecture');

/**
 * The architecture that fits a segment, or null. Matching is exact against the
 * `segments` list rather than fuzzy: recommending a bank the GovTech blueprint
 * because both strings contain "public" would be worse than recommending
 * nothing at all.
 */
export function architectureForSegment(segment) {
  if (!segment) return null;
  const s = String(segment).trim().toLowerCase();
  return SECTOR_ARCHITECTURES.find(a =>
    (a.segments || []).some(x => x.toLowerCase() === s)
  ) || null;
}

/**
 * The shape digitafusion.com consumes. Deliberately a projection, not the raw
 * row: r2Key and kbSlug are internal storage paths and have no business
 * leaving this process, gated endpoint or not.
 */
export function publicFrameworkRegistry() {
  const strip = f => ({
    id: f.id,
    name: f.name,
    shortName: f.shortName,
    kind: f.kind,
    track: f.track,
    oneLiner: f.oneLiner,
    segments: f.segments || null,
    articulation: f.articulation || 'full',
  });
  return {
    operating: OPERATING_FRAMEWORKS.map(strip),
    sector: SECTOR_ARCHITECTURES.map(strip),
    blueprints: FIRM_IP_BLUEPRINTS.map(b => ({
      id: b.id, name: b.name, shortName: b.shortName, oneLiner: b.oneLiner, kind: 'vertical_blueprint',
    })),
    research: FIRM_RESEARCH_LIBRARY.map(r => ({
      id: r.id, name: r.name, shortName: r.shortName, author: r.author, oneLiner: r.oneLiner, kind: 'author_ip',
    })),
    counts: {
      frameworks: FIRM_IP_FRAMEWORKS.length,
      operating: OPERATING_FRAMEWORKS.length,
      sector: SECTOR_ARCHITECTURES.length,
      blueprints: FIRM_IP_BLUEPRINTS.length,
      research: FIRM_RESEARCH_LIBRARY.length,
    },
  };
}

/** Runtime-promoted frameworks (loaded async from R2 — see ipFactory.js). */
let _promotedCache = [];
let _promotedLoadedAt = 0;
const PROMOTED_TTL_MS = 5 * 60 * 1000;

export function setPromotedFrameworks(list = []) {
  _promotedCache = Array.isArray(list) ? list : [];
  _promotedLoadedAt = Date.now();
}

export async function refreshPromotedFrameworks() {
  try {
    const { loadPromotedFrameworks } = await import('./ipFactory.js');
    setPromotedFrameworks(await loadPromotedFrameworks());
  } catch {
    setPromotedFrameworks([]);
  }
  return _promotedCache;
}

function getPromotedForAgent(agentId) {
  if (Date.now() - _promotedLoadedAt > PROMOTED_TTL_MS) {
    refreshPromotedFrameworks().catch(() => {});
  }
  return _promotedCache.filter(f => f.agent === agentId || agentId === 'nexus' || agentId === 'assistant');
}

export function getFrameworksForAgent(agentId) {
  /* The books are gone from here. Aether still reaches them — through
     getResearchForAgent() — but they arrive labelled as research the firm may
     draw on, not as firm method. An agent that cannot tell the difference will
     eventually present a PathFinda paperback as DigiFusion's proprietary
     framework in front of a client. */
  const map = {
    nova:        ['ave', 'engagement-model'],
    atlas:       ['deal-engine', 'kam-engine', 'engagement-model', 'sme-scale-engine', 'enterprise-velocity', 'govtech', 'fira'],
    aether:      ['c2c', 'engagement-model'],
    nexus:       FRAMEWORK_IDS,
    assistant:   FRAMEWORK_IDS,
    researcher:  FRAMEWORK_IDS,
    synthesizer: FRAMEWORK_IDS,
  };
  const ids = map[agentId] || FRAMEWORK_IDS;
  const base = FIRM_IP_FRAMEWORKS.filter(f => ids.includes(f.id));
  const promoted = getPromotedForAgent(agentId).map(p => ({
    id:       p.id,
    name:     p.name,
    oneLiner: p.oneLiner,
    agent:    p.agent,
    kind:     p.kind || 'synthesized',
  }));
  const seen = new Set(base.map(f => f.id));
  for (const p of promoted) {
    if (!seen.has(p.id)) base.push(p);
  }
  return base;
}

export function buildFrameworksListBlock() {
  const line = f => `— ${f.name} (${f.agent}): ${f.oneLiner}`;
  return [
    'OPERATING FRAMEWORKS — the method every engagement runs on:',
    ...OPERATING_FRAMEWORKS.map(line),
    '',
    'SECTOR ARCHITECTURES — segment-specific, purchasable:',
    ...SECTOR_ARCHITECTURES.map(line),
    '',
    'RESEARCH LIBRARY — published books the firm may draw strategy from.',
    'These are NOT DigiFusion frameworks and must never be listed as such:',
    ...FIRM_RESEARCH_LIBRARY.map(r => `— ${r.name} (${r.author}): ${r.oneLiner}`),
  ].join('\n');
}

export function buildAriaFrameworkContext() {
  return `
DIGIFUSION PROPRIETARY FRAMEWORKS — ARIA KNOWLEDGE BASE
=========================================================

NOVA — Automation Velocity Engine (AVE):
5-phase: DIAGNOSE → ARCHITECT → BUILD → DEPLOY → SCALE.

ATLAS — Deal Engine:
Dream 50 + SPIN + Challenger + Miller Heiman + Value Proposition Design.

ATLAS — KAM Engine (retention and expansion):
The Deal Engine counterpart. Account retention and expansion run as one
governed flow, measured on net revenue retention. Curated from ABM, Challenger,
Core Competence, the Market-Product Matrix, JTBD and the Consumer Decision
Journey. Its full phase articulation lives in the large-enterprise blueprint and
has not yet been extracted here — so name the framework and its purpose, and do
NOT invent phases for it. Saying "the detail is in the blueprint" is correct;
improvising a five-step model is not.

AETHER — Content-to-Capital Pipeline (C2C):
STDC Audit → Pillar-Cluster → RACE Conversion → Hub-Spoke Distribution.

NEXUS — DigiFusion Engagement Model (every engagement):
Phase 01 Discovery Audit → Phase 02 Gap Analysis → Phase 03 Solution Design → Phase 04 Build, Deploy & Measure.

SECTOR ARCHITECTURES (Atlas, segment-specific, purchasable):
SME Scale Engine, Enterprise Velocity Architecture, GovTech 4-Layer, FIRA.

RESEARCH LIBRARY — NOT OUR FRAMEWORKS:
The Digital Ads Playbook and Stop Buying Ads. Start Buying Customers. are
published books by James Baldwin (PathFinda Publishers). The agency may adopt
their strategies when a situation calls for it, the same way it would adopt any
external research. Never present them as DigiFusion proprietary frameworks, and
never count them when asked how many frameworks the firm has.

Describe OUTCOMES only in chat — never internal methodology steps or scoring logic.

BOOKING: https://calendly.com/digifusion/strategy
`.trim();
}

/**
 * The line an agent says when asked what our frameworks are. Frameworks only —
 * this is the function that used to name two paperbacks.
 */
export function frameworkNamesLine() {
  return FIRM_IP_FRAMEWORKS.map(f => f.shortName).join(', ');
}

/** Separate, and separately named, so the two can never be said as one list. */
export function researchNamesLine() {
  return FIRM_RESEARCH_LIBRARY.map(r => `${r.shortName} (${r.author})`).join('; ');
}
