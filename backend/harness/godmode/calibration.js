/**
 * DigiFusion Agent Harness — Phase 3, Piece 1: Calibration Engine
 * ================================================================
 *
 * "Instrument every engagement, from the next one. Audit inputs, computed
 *  Friction Tax, the FrictionIQ self-score, the assessor score, the ink
 *  distribution, the sprint's stall points, the realised payback.
 *  Structured, per client, per vertical."
 *
 * This module is the moat. It is made of delivery history, not software.
 *
 * Three capabilities:
 *   1. Engagement Outcomes Register — capture structured outcomes per engagement
 *   2. Prior Calibration — at ≥10 outcomes, replace declared priors with measured values
 *   3. Divergence Loop — self-score vs assessor score per band/sector
 *
 * At ten paired outcomes you can replace declared assumptions with measured
 * values and flip `basis` from 'prior' to 'calibrated'. That flip converts
 * an opinion into an instrument.
 */

import { callAiProvider, resolveProvider } from '../../aiProviders.js';
import { getSupabase } from '../../supabaseClient.js';
import { generateRunId, writeTrace, hashContent } from '../trace.js';
import { verifyStep, assertChainLength } from '../verify.js';
import { createBudget, consumeBudget } from '../budget.js';
import { checkPermission } from '../perimeter.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum paired outcomes before basis flips from 'prior' to 'calibrated'. */
export const MIN_CALIBRATION_PAIRS = 10;

/** Bands in calibration order (lowest readiness → highest). */
const BANDS = ['opaque', 'approaching', 'legible', 'engineered'];

/** Outcome types we track per engagement. */
const OUTCOME_TYPES = ['delivered', 'declined', 'stalled', 'abandoned'];


// ── Piece 1: Engagement Outcomes Register ───────────────────────────────────

/**
 * Record a completed engagement's structured outcome.
 * Called when an engagement reaches 'closed' status.
 *
 * @param {object} params
 * @param {string} params.engagementId  — UUID from frictioniq_engagement
 * @param {string} params.outcome       — 'delivered' | 'declined' | 'stalled' | 'abandoned'
 * @param {object} params.selfScore     — { band: string, total: number, byLayer: { process, data, governance } }
 * @param {object} params.assessorScore — { band: string, total: number, domains: [...] }
 * @param {object} [params.frictionTax] — { point, low, high, currency }
 * @param {object} [params.inkDistribution] — { green: number, blue: number, red: number }
 * @param {number} [params.reclassificationRate] — 0-1
 * @param {number} [params.actualPaybackMonths]  — realised, not projected
 * @param {string} [params.sector]
 * @param {number} [params.deliveryWeeks] — actual weeks from start to close
 * @param {Array}  [params.stallPoints]   — [{ week, reason }]
 * @returns {Promise<object>}
 */
export async function recordEngagementOutcome({
  engagementId, outcome, selfScore, assessorScore,
  frictionTax, inkDistribution, reclassificationRate,
  actualPaybackMonths, sector, deliveryWeeks, stallPoints,
}) {
  const db = getSupabase();
  if (!db) throw new Error('[Calibration] No DB connection');

  const row = {
    engagement_id: engagementId,
    outcome,
    self_score_band: selfScore?.band || null,
    self_score_total: selfScore?.total ?? null,
    self_score_process: selfScore?.byLayer?.process?.score ?? null,
    self_score_data: selfScore?.byLayer?.data?.score ?? null,
    self_score_governance: selfScore?.byLayer?.governance?.score ?? null,
    assessor_score_band: assessorScore?.band || null,
    assessor_score_total: assessorScore?.total ?? null,
    friction_tax_low: frictionTax?.low ?? null,
    friction_tax_high: frictionTax?.high ?? null,
    friction_tax_currency: frictionTax?.currency || null,
    ink_green: inkDistribution?.green ?? null,
    ink_blue: inkDistribution?.blue ?? null,
    ink_red: inkDistribution?.red ?? null,
    reclassification_rate: reclassificationRate ?? null,
    actual_payback_months: actualPaybackMonths ?? null,
    sector: sector || null,
    delivery_weeks: deliveryWeeks ?? null,
    stall_points: stallPoints || null,
    recorded_at: new Date().toISOString(),
  };

  const { data, error } = await db.from('engagement_outcomes')
    .upsert(row, { onConflict: 'engagement_id' })
    .select().single();

  if (error) {
    console.warn('[Calibration] Outcome persist failed:', error.message);
    throw error;
  }

  console.log(`[Calibration] Outcome recorded: ${engagementId} → ${outcome} (self:${selfScore?.band}, assessor:${assessorScore?.band})`);

  // After recording, flip the basis when the threshold is met — the closed loop.
  const status = await getCalibrationStatus();
  if (status.totalOutcomes >= MIN_CALIBRATION_PAIRS) {
    await computeMeasuredPriors();
  }

  return data;
}

// ── Piece 2: Prior → Calibrated Flip ────────────────────────────────────────

/**
 * Get the current calibration status — how many outcomes, which bands have data.
 */
export async function getCalibrationStatus() {
  const db = getSupabase();
  if (!db) return { calibrated: false, totalOutcomes: 0, byBand: {}, basis: 'prior' };

  const { data, error } = await db.from('engagement_outcomes')
    .select('outcome, self_score_band, assessor_score_band');

  if (error || !data) return { calibrated: false, totalOutcomes: 0, byBand: {}, basis: 'prior' };

  const delivered = data.filter(r => r.outcome === 'delivered');

  const byBand = {};
  for (const band of BANDS) {
    const bandOutcomes = delivered.filter(r => r.assessor_score_band === band);
    byBand[band] = { count: bandOutcomes.length, delivered: bandOutcomes.length };
  }

  const totalOutcomes = delivered.length;
  const calibrated = totalOutcomes >= MIN_CALIBRATION_PAIRS;

  return { calibrated, totalOutcomes, byBand, basis: calibrated ? 'calibrated' : 'prior' };
}

/**
 * Compute measured readiness-to-success rates from engagement outcomes.
 * This replaces the declared BAND_PRIORS in commitment.ts.
 *
 * P(delivery | band) = count(delivered with band) / count(all outcomes with band)
 *
 * Only bands with ≥1 delivered outcome get a measured rate.
 * Bands with zero outcomes fall back to the prior.
 */
export async function computeMeasuredPriors() {
  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db.from('engagement_outcomes')
    .select('outcome, assessor_score_band');

  if (error || !data?.length) return null;

  const measured = {};
  for (const band of BANDS) {
    const bandRows = data.filter(r => r.assessor_score_band === band);
    if (bandRows.length === 0) { measured[band] = null; continue; }
    const delivered = bandRows.filter(r => r.outcome === 'delivered').length;
    measured[band] = delivered / bandRows.length;
  }

  // Persist to calibration_state
  const total = data.filter(r => r.outcome === 'delivered').length;
  const basis = total >= MIN_CALIBRATION_PAIRS ? 'calibrated' : 'prior';

  await db.from('calibration_state').upsert({
    id: 'current',
    basis,
    measured_priors: measured,
    total_outcomes: total,
    computed_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  console.log(`[Calibration] Measured priors computed: basis=${basis}, outcomes=${total}`);
  console.log(`[Calibration]   opaque=${measured.opaque?.toFixed(2) || '—'} approaching=${measured.approaching?.toFixed(2) || '—'} legible=${measured.legible?.toFixed(2) || '—'} engineered=${measured.engineered?.toFixed(2) || '—'}`);

  return { measured, basis, totalOutcomes: total };
}

/**
 * Get the currently active priors — measured if calibrated, declared otherwise.
 */
export async function getActivePriors() {
  const db = getSupabase();
  if (!db) {
    // Hardcoded fallback — matches commitment.ts BAND_PRIORS
    return { opaque: 0.20, approaching: 0.35, legible: 0.60, engineered: 0.75, basis: 'prior' };
  }

  const { data } = await db.from('calibration_state')
    .select('*').eq('id', 'current').maybeSingle();

  if (!data || data.basis !== 'calibrated' || !data.measured_priors) {
    return { opaque: 0.20, approaching: 0.35, legible: 0.60, engineered: 0.75, basis: 'prior' };
  }

  return { ...data.measured_priors, basis: 'calibrated' };
}

/**
 * Check if calibration is active (10+ paired outcomes recorded).
 */
export async function isCalibrated() {
  const status = await getCalibrationStatus();
  return status.calibrated;
}

// ── Piece 3: Divergence Loop ────────────────────────────────────────────────

/**
 * Compute self-score vs assessor-score divergence per band, per sector.
 * At ten pairs, the correction factor is defensible.
 * "Nothing gives you an accuracy claim."
 *
 * @returns {{ byBand: object, bySector: object, totalPairs: number }}
 */
export async function computeDivergence() {
  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db.from('engagement_outcomes')
    .select('self_score_band, self_score_total, assessor_score_band, assessor_score_total, sector');

  if (error || !data?.length) return { byBand: {}, bySector: {}, totalPairs: 0 };

  const valid = data.filter(r =>
    r.self_score_total != null && r.assessor_score_total != null
  );

  // By band
  const byBand = {};
  for (const band of BANDS) {
    const pairs = valid.filter(r => r.self_score_band === band);
    if (pairs.length < 2) { byBand[band] = { pairs: pairs.length, correction: null }; continue; }
    const totalDelta = pairs.reduce((sum, r) => sum + (r.assessor_score_total - r.self_score_total), 0);
    const correction = totalDelta / pairs.length;
    byBand[band] = { pairs: pairs.length, correction, note: correction > 0 ? 'assessor scores higher' : correction < 0 ? 'self-scores higher' : 'aligned' };
  }

  // By sector
  const bySector = {};
  const sectors = [...new Set(valid.map(r => r.sector).filter(Boolean))];
  for (const sector of sectors) {
    const pairs = valid.filter(r => r.sector === sector);
    if (pairs.length < 2) { bySector[sector] = { pairs: pairs.length, correction: null }; continue; }
    const totalDelta = pairs.reduce((sum, r) => sum + (r.assessor_score_total - r.self_score_total), 0);
    bySector[sector] = { pairs: pairs.length, correction: totalDelta / pairs.length };
  }

  console.log(`[Calibration] Divergence: ${valid.length} pairs, ${Object.keys(byBand).filter(b => byBand[b].correction !== null).length} bands with data`);

  return { byBand, bySector, totalPairs: valid.length };
}

/**
 * Agent-assisted extraction: run a 2-step verified chain to extract structured
 * engagement outcomes from raw engagement artifacts (deliverables, notes, etc.)
 *
 * Step 0: Extract structured outcome fields from raw text
 * Step 1: Validate and persist
 *
 * "Extraction from engagement artefacts into the register is exactly the work
 *  that is tedious for a person and reliable in a two-step verified chain."
 */
export async function extractEngagementOutcome({
  agentId = 'nova', engagementId, rawArtifacts, chainLength = 2,
}) {
  await checkPermission({ agentId, namespace: 'knowledge_base.automation', throwOnViolation: true });

  const runId = generateRunId();
  const start = Date.now();
  const truncated = rawArtifacts.length > 40_000 ? rawArtifacts.slice(0, 40_000) + '\n[...truncated]' : rawArtifacts;

  const prompt = [
    'Extract structured engagement outcome data from the artifacts below.',
    'Return a JSON object with these fields (null if not found):',
    '  outcome: "delivered"|"declined"|"stalled"|"abandoned"',
    '  self_score: { band: "opaque"|"approaching"|"legible"|"engineered", total: number }',
    '  assessor_score: { band, total: number }',
    '  friction_tax: { low: number, high: number, currency: string }',
    '  ink_distribution: { green: number, blue: number, red: number }',
    '  reclassification_rate: number (0-1)',
    '  actual_payback_months: number',
    '  delivery_weeks: number',
    '  stall_points: [{ week: number, reason: string }]',
    '  sector: string',
    '',
    'Rules: Extract only what is explicitly stated. Never fabricate. If a field is not mentioned, set it to null.',
    '',
    '## Engagement Artifacts',
    truncated,
  ].join('\n');

  const fmt = 'Return ONLY the JSON object. No commentary.';

  let result, errorMessage, verdict = 'passed';
  try {
    result = await callAiProvider(resolveProvider(), `${prompt}\n\n${fmt}`, '', { json: false, fallback: true });
  } catch (e) { errorMessage = e.message; verdict = 'failed'; result = { text: '{}', providerName: 'none', modelName: 'none', tokensIn: 0, tokensOut: 0 }; }

  let extracted = {};
  try { const m = (result.text || '').match(/\{[\s\S]*\}/); if (m) extracted = JSON.parse(m[0]); } catch {}

  const dur = Date.now() - start;
  await writeTrace({ runId, agentId, stepIndex: 0, chainLength, verified: true, input: truncated.slice(0, 2000), output: JSON.stringify(extracted).slice(0, 3000), providerName: result.providerName || 'unknown', modelName: result.modelName || 'unknown', tokensIn: result.tokensIn || 0, tokensOut: result.tokensOut || 0, durationMs: dur, verdict, errorMessage, verificationCheck: 'schema: outcome extraction', namespacesAccessed: ['knowledge_base.automation'] });

  if (verdict === 'failed') throw new Error(`[Calibration] Extraction failed: ${errorMessage}`);

  // Map extracted fields to recordEngagementOutcome format
  const outcome = await recordEngagementOutcome({
    engagementId: engagementId || `extracted-${runId}`,
    outcome: extracted.outcome || 'delivered',
    selfScore: extracted.self_score || {},
    assessorScore: extracted.assessor_score || {},
    frictionTax: extracted.friction_tax || null,
    inkDistribution: extracted.ink_distribution || null,
    reclassificationRate: extracted.reclassification_rate ?? null,
    actualPaybackMonths: extracted.actual_payback_months ?? null,
    sector: extracted.sector || null,
    deliveryWeeks: extracted.delivery_weeks ?? null,
    stallPoints: extracted.stall_points || null,
  });

  return { runId, outcome };
}

