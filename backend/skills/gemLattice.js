/**
 * GEM Lattice — Gem Extraction & MECE-encoding Lattice
 * Mathematical scoring for Synthesizer IP crystallization (firm moat).
 */

export const GEM_WEIGHTS = {
  alpha: 0.15,  // R relevance
  beta:  0.20,  // C_cross
  gamma: 0.20,  // A actionability
  delta: 0.25,  // N novelty
  epsilon: 0.10, // E evidence
  zeta:  0.15,  // P platitude penalty
  eta:   0.10,  // T tension
};

export const THRESHOLDS = {
  gemUnit:       parseFloat(process.env.GEM_THRESHOLD || '0.62'),
  patternCluster: parseFloat(process.env.PATTERN_THRESHOLD || '0.55'),
  ipmsLibrary:   parseFloat(process.env.IPMS_LIBRARY || '0.70'),
  ipmsOperating: parseFloat(process.env.IPMS_OPERATING || '0.85'),
  ipmsReject:    parseFloat(process.env.IPMS_REJECT || '0.55'),
};

const PLATITUDE_PATTERNS = [
  /\bsynerg(y|ies|ize)\b/i,
  /\bleverage\b/i,
  /\bdigital transformation\b(?!\s+phase)/i,
  /\bholistic\b/i,
  /\bbest[- ]?in[- ]?class\b/i,
  /\bworld[- ]?class\b/i,
  /\boptimize\b/i,
  /\bstreamline\b/i,
  /\bempower\b/i,
  /\bunlock\b/i,
  /\bgame[- ]?chang/i,
];

const ACTIONABILITY_PATTERNS = [
  /\bchecklist\b/i, /✓|☑/, /\bstep\s+\d/i, /\bphase\s+\d/i,
  /\bscorecard\b/i, /\bdiagnostic\b/i, /\bmetric\b/i, /\bKPI\b/i,
  /\bdeliverable\b/i, /\bROI\b/i, /\b\d+%\b/, /\$\d/,
];

function tokenSet(text = '') {
  return new Set(String(text).toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3));
}

/** Jaccard similarity 0–1 */
export function textSimilarity(a = '', b = '') {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function scoreRelevance(unit) {
  return Math.min(1, (unit.relevance_score || 3) / 5);
}

export function scoreCrossSource(unit, allUnits = []) {
  const concepts = new Set([...(unit.concepts || []), ...(unit.frameworks || [])].map(c => String(c).toLowerCase()));
  if (!concepts.size) return 0.2;
  const sources = new Set();
  for (const other of allUnits) {
    if (other.source_key === unit.source_key) continue;
    const oc = new Set([...(other.concepts || []), ...(other.frameworks || [])].map(c => String(c).toLowerCase()));
    for (const c of concepts) if (oc.has(c)) { sources.add(other.source_key); break; }
  }
  const distinctSources = new Set(allUnits.map(u => u.source_key).filter(Boolean)).size || 1;
  return Math.min(1, sources.size / Math.max(1, distinctSources - 1));
}

export function scoreActionability(content = '') {
  const hits = ACTIONABILITY_PATTERNS.filter(p => p.test(content)).length;
  return Math.min(1, hits / 4);
}

export function scorePlatitudePenalty(content = '') {
  const hits = PLATITUDE_PATTERNS.filter(p => p.test(content)).length;
  return Math.min(1, hits / 5);
}

export function scoreEvidence(unit) {
  const stats = Array.isArray(unit.statistics) ? unit.statistics.length : 0;
  const len = (unit.content || '').length || 1;
  return Math.min(1, (stats * 200 + (unit.content?.match(/\d+%|\$\d/g) || []).length * 50) / len);
}

export function scoreNovelty(unit, firmCorpus = []) {
  if (!firmCorpus.length) return 0.7;
  const sims = firmCorpus.map(f => textSimilarity(unit.content || '', f.content || f.oneLiner || ''));
  return 1 - Math.max(...sims, 0);
}

export function scoreTension(unit, allUnits = []) {
  const concepts = (unit.concepts || []).map(c => String(c).toLowerCase());
  if (!concepts.length) return 0;
  let contradictions = 0;
  for (const other of allUnits) {
    if (other.source_key === unit.source_key) continue;
    const sim = textSimilarity(unit.content || '', other.content || '');
    if (sim > 0.35 && sim < 0.65) contradictions++;
  }
  return Math.min(0.3, contradictions * 0.08);
}

/** Gem Score G(u) */
export function computeGemScore(unit, allUnits = [], firmCorpus = []) {
  const content = unit.content || '';
  const R = scoreRelevance(unit);
  const C = scoreCrossSource(unit, allUnits);
  const A = scoreActionability(content);
  const N = scoreNovelty(unit, firmCorpus);
  const P = scorePlatitudePenalty(content);
  const E = scoreEvidence(unit);
  const T = scoreTension(unit, allUnits);
  const w = GEM_WEIGHTS;

  const G = w.alpha * R + w.beta * C + w.gamma * A + w.delta * N + w.epsilon * E
    - w.zeta * P + w.eta * Math.min(T, 0.3);

  return {
    gemScore: Math.round(G * 1000) / 1000,
    components: { R, C_cross: C, A, N, P, E, T },
    isGem: G >= THRESHOLDS.gemUnit,
  };
}

/** MECE partial score for phase mapping */
export function scoreMece(phases = []) {
  if (!Array.isArray(phases) || phases.length < 2) return 0.4;
  const names = phases.map(p => (p.name || p.title || '').toLowerCase());
  const hasDiagnostic = names.some(n => /audit|diagnos|discover|assess/.test(n));
  const hasDesign = names.some(n => /design|architect|roadmap|plan/.test(n));
  const hasExecute = names.some(n => /build|deploy|execut|implement|scale/.test(n));
  const filled = [hasDiagnostic, hasDesign, hasExecute].filter(Boolean).length;
  return filled / 3;
}

/** Pattern cluster score Φ(C) */
export function computePatternScore(gems = []) {
  if (!gems.length) return 0;
  const avgG = gems.reduce((s, g) => s + (g.gemScore || 0), 0) / gems.length;
  const size = gems.length;
  return avgG * Math.log(1 + size);
}

/** IP Moat Score for crystallized framework */
export function computeIpms({
  gemScores = [],
  firmFit = 0.8,
  executableDepth = 0.7,
  tensionResolved = 0.1,
  genericEcho = 0.15,
}) {
  const avgGems = gemScores.length
    ? gemScores.reduce((a, b) => a + b, 0) / gemScores.length
    : 0.5;
  const numerator = avgGems * firmFit * executableDepth * (1 + Math.min(tensionResolved, 0.3));
  const ipms = numerator / (1 + genericEcho);
  return Math.round(ipms * 1000) / 1000;
}

export function resolveOutputTier(ipms) {
  if (ipms >= THRESHOLDS.ipmsOperating) return 'operating_framework';
  if (ipms >= THRESHOLDS.ipmsLibrary) return 'library_product';
  if (ipms >= THRESHOLDS.ipmsReject) return 'knowledge_brief';
  return 'reject';
}

export function scoreExecutableDepth(framework = {}) {
  let score = 0;
  if (framework.phases?.length >= 3) score += 0.3;
  if (framework.scorecard?.dimensions?.length >= 4) score += 0.25;
  if (framework.diagnostic_questions?.length >= 5) score += 0.2;
  if (framework.differentiators?.length >= 2) score += 0.15;
  if (framework.executive_summary?.length > 80) score += 0.1;
  return Math.min(1, score);
}

export function scoreGenericEcho(content = '', firmCorpus = []) {
  const genericSeeds = [
    'seven s framework mckinsey',
    'porters five forces',
    'bcg matrix',
    'digital transformation journey',
  ];
  const sims = genericSeeds.map(s => textSimilarity(content, s));
  const corpusSims = firmCorpus.map(f => textSimilarity(content, f.content || ''));
  return Math.min(1, Math.max(...sims, ...corpusSims, 0) * 1.2);
}

/** Rank knowledge units as gems */
export function rankGems(units = [], firmCorpus = []) {
  return units
    .map(u => {
      const scored = computeGemScore(u, units, firmCorpus);
      return { unit: u, ...scored };
    })
    .filter(g => g.isGem)
    .sort((a, b) => b.gemScore - a.gemScore);
}
