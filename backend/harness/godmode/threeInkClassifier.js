/**
 * DigiFusion Agent Harness — Phase 2, Piece 3: Three-Ink First Pass
 * ===================================================================
 *
 * "Green rule, blue bounded-agent, red judgement. The agent proposes;
 *  the consultant reclassifies. Track the reclassification rate.
 *  That number is the honest measure of whether the agent is helping,
 *  and it belongs in the trace table from day one."
 *
 * Ink classification:
 *   GREEN  — Deterministic rule. No judgement needed. A computer should run this.
 *   BLUE   — Bounded agent. An agent can propose under a governor; human reviews.
 *   RED    — Irreducible judgement. Stays human — genuine expertise or exposure
 *            that no model should touch unattended.
 *
 * Architecture (3-step verified chain):
 *   Step 0: analyzeFlows → raw process descriptions → structured flow register
 *   VERIFY:  schema check (flow name, description, frequency required)
 *   Step 1: classifyInks → flow register → proposed ink classification
 *   VERIFY:  non_empty + all flows classified
 *   Step 2: (human reclassification — outside agent scope)
 *   Record: reclassification rate written to trace + ink_classification table
 *
 * The discipline: agents draft, humans dispose.
 * The metric:     reclassification_rate = (changed inks / total flows).
 */

import { callAiProvider, resolveProvider } from '../../aiProviders.js';
import { getSupabase }               from '../../supabaseClient.js';
import { generateRunId, writeTrace, hashContent } from '../trace.js';
import { verifyStep, assertChainLength } from '../verify.js';
import { createBudget, consumeBudget } from '../budget.js';
import { checkPermission }            from '../perimeter.js';

const FLOW_SCHEMA = { requiredFields: ['name', 'description', 'frequency'] };
const INK_VALID   = ['green', 'blue', 'red'];


// ── Step 0: Analyze flows from process descriptions ─────────────────────────

export async function step0_analyzeFlows({
  runId, agentId, processDescription, chainLength = 3,
}) {
  await checkPermission({ agentId, namespace: 'knowledge_base.automation', throwOnViolation: true });
  const start = Date.now();
  const truncated = processDescription.length > 40_000 ? processDescription.slice(0, 40_000) + '\n[...truncated]' : processDescription;

  const prompt = [
    'You are extracting a flow register from a business process description.',
    'Identify EVERY distinct operational flow: a repeatable sequence of steps that produces an output.',
    'For each flow return: name (short label), description (what it does, one sentence),',
    'frequency (how often: hourly|daily|weekly|monthly|quarterly),',
    'inputs (what triggers it), outputs (what it produces),',
    'current_owner (who does it today), tools (systems involved).',
    'Output valid JSON array of flow objects.',
    '', '## Process description', truncated,
  ].join('\n');

  const fmt = 'Return ONLY a JSON array of flow objects. No commentary.';
  let result, errorMessage, verdict = 'passed';
  try { result = await callAiProvider(resolveProvider(), `${prompt}\n\n${fmt}`, '', { json: false, fallback: true }); }
  catch (e) { errorMessage = e.message; verdict = 'failed'; result = { text: '[]', providerName: 'none', modelName: 'none', tokensIn: 0, tokensOut: 0 }; }

  let flows = [];
  try { const m = (result.text || '').match(/\[[\s\S]*\]/); if (m) flows = JSON.parse(m[0]); if (!Array.isArray(flows)) flows = []; } catch { flows = []; }

  const dur = Date.now() - start;
  await writeTrace({ runId, agentId, stepIndex: 0, chainLength, verified: false, input: truncated.slice(0, 2000), output: JSON.stringify(flows).slice(0, 2000), providerName: result.providerName || 'unknown', modelName: result.modelName || 'unknown', tokensIn: result.tokensIn || 0, tokensOut: result.tokensOut || 0, durationMs: dur, verdict, errorMessage, verificationCheck: 'schema: flow array', namespacesAccessed: ['knowledge_base.automation'] });
  await consumeBudget({ runId, tokensIn: result.tokensIn || 0, tokensOut: result.tokensOut || 0, costUsdMills: 0 });
  if (verdict === 'failed') throw new Error(`[ThreeInk] Flow analysis failed: ${errorMessage}`);
  return { flows };
}

// ── Step 1: Classify each flow green / blue / red ───────────────────────────

export async function step1_classifyInks({
  runId, agentId, flows, chainLength = 3,
}) {
  const start = Date.now();
  const flowText = JSON.stringify(flows);

  const prompt = [
    `Classify ${flows.length} operational flows using the three-ink system:`,
    '',
    'GREEN — Deterministic rule. No human judgement needed. A computer should run this.',
    '         Criteria: inputs are structured data, logic is purely rule-based,',
    '         output is a single unambiguous result, no exceptions path.',
    '',
    'BLUE  — Bounded agent. An agent can propose under a governor; human reviews.',
    '         Criteria: pattern-matching on semi-structured data, a good-enough',
    '         answer is useful even if imperfect, failure mode is recoverable.',
    '',
    'RED   — Irreducible judgement. Stays human. Genuine expertise, high exposure,',
    '         or regulatory consequence that no model should touch unattended.',
    '         Criteria: requires contextual judgement, legal/regulatory liability,',
    '         wrong answer causes material harm, or expertise is the product itself.',
    '',
    'For each flow, return: { name, ink: "green"|"blue"|"red", rationale (one sentence), confidence (0-1) }.',
    'Be conservative: when uncertain between blue and red, choose red.',
    'Output JSON array.',
    '', '## Flows', flowText,
  ].join('\n');

  const fmt = 'Return ONLY a JSON array of { name, ink, rationale, confidence }.';
  let result, errorMessage, verdict = 'passed';
  try { result = await callAiProvider(resolveProvider(), `${prompt}\n\n${fmt}`, '', { json: false, fallback: true }); }
  catch (e) { errorMessage = e.message; verdict = 'failed'; result = { text: '[]', providerName: 'none', modelName: 'none', tokensIn: 0, tokensOut: 0 }; }

  let classifications = [];
  try { const m = (result.text || '').match(/\[[\s\S]*\]/); if (m) classifications = JSON.parse(m[0]); if (!Array.isArray(classifications)) classifications = []; } catch { classifications = []; }

  // Validate inks
  classifications = classifications.map(c => ({ ...c, ink: INK_VALID.includes(c.ink) ? c.ink : 'red' }));

  const dur = Date.now() - start;
  await writeTrace({ runId, agentId, stepIndex: 1, chainLength, verified: false, input: `[${flows.length} flows]`, output: JSON.stringify(classifications).slice(0, 3000), providerName: result.providerName || 'unknown', modelName: result.modelName || 'unknown', tokensIn: result.tokensIn || 0, tokensOut: result.tokensOut || 0, durationMs: dur, verdict, errorMessage, verificationCheck: 'schema: ink classifications', namespacesAccessed: ['knowledge_base.automation'] });
  await consumeBudget({ runId, tokensIn: result.tokensIn || 0, tokensOut: result.tokensOut || 0, costUsdMills: 0 });
  if (verdict === 'failed') throw new Error(`[ThreeInk] Classification failed: ${errorMessage}`);
  return { classifications };
}


// ── Orchestrator ────────────────────────────────────────────────────────────

export async function runThreeInkFirstPass({
  agentId = 'nova', processDescription, tokenLimit, costLimitUsdMills, stepLimit = 6,
}) {
  if (!processDescription || processDescription.trim().length === 0) throw new Error('[ThreeInk] processDescription required');
  const runId = generateRunId();
  const chainLength = 3;
  let lastVerified = -1;
  await createBudget({ runId, tokenLimit, costLimitUsdMills, stepLimit });
  console.log(`[ThreeInk] Run ${runId} — agent ${agentId}`);

  assertChainLength(0, chainLength, lastVerified);
  const { flows } = await step0_analyzeFlows({ runId, agentId, processDescription, chainLength });
  console.log(`[ThreeInk] Step 0: ${flows.length} flows`);

  const v1 = await verifyStep({ output: JSON.stringify(flows), checks: [{ type: 'schema', requiredFields: FLOW_SCHEMA.requiredFields }, { type: 'non_empty' }], runId, stepIndex: 0, agentId });
  if (!v1.passed) throw new Error(`[ThreeInk] Gate 1 failed: ${v1.summary}`);
  lastVerified = 0;

  assertChainLength(1, chainLength, lastVerified);
  const { classifications } = await step1_classifyInks({ runId, agentId, flows, chainLength });
  const greens = classifications.filter(c => c.ink === 'green').length;
  const blues  = classifications.filter(c => c.ink === 'blue').length;
  const reds   = classifications.filter(c => c.ink === 'red').length;
  console.log(`[ThreeInk] Step 1: ${classifications.length} — G:${greens} B:${blues} R:${reds}`);

  const v2 = await verifyStep({ output: JSON.stringify(classifications), checks: [{ type: 'schema', requiredFields: ['name', 'ink', 'rationale'] }, { type: 'non_empty' }], runId, stepIndex: 1, agentId });
  if (!v2.passed) throw new Error(`[ThreeInk] Gate 2 failed: ${v2.summary}`);

  await persistProposedClassifications({ runId, agentId, classifications, flowInputHash: hashContent(processDescription) });
  console.log(`[ThreeInk] Run ${runId} complete — awaiting human reclassification`);

// ── Reclassification Tracking (THE honest metric) ───────────────────────────

/** Record human reclassification. Returns the reclassification rate. */
export async function recordReclassification({ runId, agentId = 'nova', reclassified = [] }) {
  const db = getSupabase();
  const changed = reclassified.filter(r => r.original_ink !== r.final_ink);

  if (db) {
    const rows = reclassified.map(r => ({
      run_id: runId, agent_id: agentId, flow_name: r.name,
      original_ink: r.original_ink, final_ink: r.final_ink,
      reason: r.reason || '', was_changed: r.original_ink !== r.final_ink,
    }));
    const { error } = await db.from('ink_classifications').upsert(rows, { onConflict: 'run_id, flow_name' });
    if (error) console.warn('[ThreeInk] Persist reclassification failed:', error.message);
  }

  const rate = reclassified.length > 0 ? changed.length / reclassified.length : 0;

  // "That number belongs in the trace table from day one."
  await writeTrace({ runId, agentId, stepIndex: 999, chainLength: 3, verified: true, input: `${reclassified.length} flows reviewed`, output: `reclassification_rate: ${(rate*100).toFixed(1)}% (${changed.length}/${reclassified.length})`, providerName: 'human', modelName: 'consultant-review', tokensIn: 0, tokensOut: 0, durationMs: 0, verdict: 'passed', verificationCheck: `reclassification_rate=${rate.toFixed(3)}`, namespacesAccessed: [] });

  console.log(`[ThreeInk] Reclassification: ${(rate*100).toFixed(1)}% (${changed.length}/${reclassified.length})`);
  return { reclassificationRate: rate, changed: changed.length, total: reclassified.length };
}

/** Aggregate reclassification rate across all runs — the honest measure. */
export async function getAggregateReclassificationRate() {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.from('ink_classifications').select('was_changed');
  if (error || !data) return null;
  const changed = data.filter(r => r.was_changed).length;
  return data.length > 0 ? { rate: changed / data.length, changed, total: data.length } : null;
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function persistProposedClassifications({ runId, agentId, classifications, flowInputHash }) {
  const db = getSupabase();
  if (!db) return;
  const rows = classifications.map(c => ({ run_id: runId, agent_id: agentId, flow_name: c.name, proposed_ink: c.ink, rationale: String(c.rationale || '').slice(0, 1000), confidence: Number(c.confidence) || 0, input_hash: flowInputHash }));
  const { error } = await db.from('ink_classifications').upsert(rows, { onConflict: 'run_id, flow_name' });
  if (error) console.warn('[ThreeInk] Persist proposed failed:', error.message);
  else console.log(`[ThreeInk] Persisted ${rows.length} proposed`);
}

export async function queryInkClassifications({ runId, limit = 50 } = {}) {
  const db = getSupabase();
  if (!db) return [];
  let q = db.from('ink_classifications').select('*').order('created_at', { ascending: false }).limit(limit);
  if (runId) q = q.eq('run_id', runId);
  const { data, error } = await q;
  if (error) { console.warn('[ThreeInk] Query failed:', error.message); return []; }
  return data || [];
}

  return { runId, flows, classifications, inkDistribution: { green: greens, blue: blues, red: reds } };
}
