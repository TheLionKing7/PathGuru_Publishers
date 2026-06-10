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
    kind:      'library_product',
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
    kind:      'library_product',
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
    kind:      'library_product',
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
    kind:      'library_product',
    access:    'purchasable',
    kbSlug:    'financial-institutions-blueprint-v3',
    r2Key:     'firm_ip/blueprints/financial-institutions-blueprint-v3.pdf',
    oneLiner:  '3-engine commercial architecture for banks, fintechs, and financial institutions.',
  },
];

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
  const map = {
    nova:        ['ave', 'engagement-model'],
    atlas:       ['deal-engine', 'engagement-model', 'sme-scale-engine', 'enterprise-velocity', 'govtech', 'fira'],
    aether:      ['digital-ads-playbook', 'stop-buying-ads', 'c2c', 'engagement-model'],
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
  return FIRM_IP_FRAMEWORKS.map(f =>
    `— ${f.name} (${f.agent}): ${f.oneLiner}`,
  ).join('\n');
}

export function buildAriaFrameworkContext() {
  return `
DIGIFUSION PROPRIETARY FRAMEWORKS — ARIA KNOWLEDGE BASE
=========================================================

NOVA — Automation Velocity Engine (AVE):
5-phase: DIAGNOSE → ARCHITECT → BUILD → DEPLOY → SCALE.

ATLAS — Deal Engine:
Dream 50 + SPIN + Challenger + Miller Heiman + Value Proposition Design.

AETHER — Author IP (James Baldwin / PathFinda) + Content-to-Capital Pipeline:
Digital Ads Playbook (capture vs creation, HSO, platform psychology) +
Stop Buying Ads (CAC/LTV, offer architecture, 100-day retention) +
C2C: STDC Audit → Pillar-Cluster → RACE Conversion → Hub-Spoke Distribution.

NEXUS — DigiFusion Engagement Model (every engagement):
Phase 01 Discovery Audit → Phase 02 Gap Analysis → Phase 03 Solution Design → Phase 04 Build, Deploy & Measure.

Segment Intelligence Library frameworks (Atlas): SME Scale Engine, Enterprise Velocity, GovTech, FIRA.

Describe OUTCOMES only in chat — never internal methodology steps or scoring logic.

BOOKING: https://calendly.com/digifusion/strategy
`.trim();
}

export function frameworkNamesLine() {
  return FIRM_IP_FRAMEWORKS.map(f => f.shortName).join(', ');
}
