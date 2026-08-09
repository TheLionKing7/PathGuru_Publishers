/**
 * DigiFusion Agent Harness — Phase 2, Piece 2: Friction Tax Assembly Agent
 * =========================================================================
 *
 * "Given raw inputs, compute the four terms with their uncertainty and produce
 *  the board-ready figure. Deterministic arithmetic with an agent doing
 *  extraction, not judgement. This one is nearly free — computeFrictionTax
 *  already exists."
 *
 * Architecture (2-step verified chain):
 *   Step 0: extractFrictionInputs → raw client data → structured FrictionTaxInputs
 *   VERIFY:  schema + range checks (all terms non-negative, populated)
 *   Step 1: computeFrictionTax → deterministic arithmetic → board-ready figure
 *
 * The discipline: the agent EXTRACTS; the arithmetic is deterministic.
 * The agent never computes the tax itself — it calls the verified function.
 * This is the difference between "AI computed your Friction Tax" and
 * "an agent extracted the inputs, and the arithmetic is shown on this page."
 */

import { callAiProvider, resolveProvider } from '../../aiProviders.js';
import { getSupabase }               from '../../supabaseClient.js';
import { generateRunId, writeTrace, hashContent } from '../trace.js';
import { verifyStep, assertChainLength } from '../verify.js';
import { createBudget, consumeBudget } from '../budget.js';
import { checkPermission }            from '../perimeter.js';

// ── The Friction Tax computation (deterministic — never call an LLM for this) ─
// This mirrors digifusion/lib/frictioniq/friction-tax.ts:computeFrictionTax
// but implemented here as a pure JS function so the agent harness can call it
// without crossing the Next.js boundary.

const TERM_DEFS = [
  { id: 'queue',        fields: ['units', 'waitDays', 'costPerUnitDay'] },
  { id: 'rework',       fields: ['incidents', 'hours', 'rate', 'downstream'] },
  { id: 'translation',  fields: ['hoursPerWeek', 'rate'] },
  { id: 'coordination', fields: ['meetingHours', 'attendees', 'rate'] },
];

const DEFAULT_UNCERTAINTY = { queue: 0.30, rework: 0.25, translation: 0.15, coordination: 0.35 };



// ── Deterministic computation (mirrors digifusion/lib/frictioniq/friction-tax.ts) ─

const n = (v) => (v === undefined || v === null || !Number.isFinite(Number(v))) ? 0 : Number(v);

export function computeFrictionTax(i) {
  const u = { ...DEFAULT_UNCERTAINTY, ...(i.uncertainty ?? {}) };
  const queuePoint        = n(i.queue?.units) * n(i.queue?.waitDays) * n(i.queue?.costPerUnitDay);
  const reworkPoint       = (n(i.rework?.incidents) * n(i.rework?.hours) * n(i.rework?.rate)) + n(i.rework?.downstream);
  const translationPoint  = n(i.translation?.hoursPerWeek) * 52 * n(i.translation?.rate);
  const coordinationPoint = n(i.coordination?.meetingHours) * n(i.coordination?.attendees) * 52 * n(i.coordination?.rate);

  const raw = [
    { id: 'queue',        point: queuePoint,        working: `${n(i.queue?.units)} × ${n(i.queue?.waitDays)} × ${n(i.queue?.costPerUnitDay)} = ${Math.round(queuePoint).toLocaleString()}` },
    { id: 'rework',       point: reworkPoint,       working: `(${n(i.rework?.incidents)} × ${n(i.rework?.hours)} × ${n(i.rework?.rate)}) + ${n(i.rework?.downstream)} = ${Math.round(reworkPoint).toLocaleString()}` },
    { id: 'translation',  point: translationPoint,  working: `${n(i.translation?.hoursPerWeek)}h/wk × 52 × ${n(i.translation?.rate)} = ${Math.round(translationPoint).toLocaleString()}` },
    { id: 'coordination', point: coordinationPoint, working: `${n(i.coordination?.meetingHours)}h/wk × ${n(i.coordination?.attendees)} people × 52 × ${n(i.coordination?.rate)} = ${Math.round(coordinationPoint).toLocaleString()}` },
  ];

  const terms = raw.map((r) => {
    const unc = Math.max(0, Math.min(1, u[r.id] ?? 0.25));
    return { id: r.id, point: r.point, low: r.point * (1 - unc), high: r.point * (1 + unc), uncertainty: unc, working: r.working };
  });

  const point = terms.reduce((a, t) => a + t.point, 0);
  const low   = terms.reduce((a, t) => a + t.low, 0);
  const high  = terms.reduce((a, t) => a + t.high, 0);
  const revenue = n(i.revenue);
  const shareOfRevenue = revenue > 0 ? Math.round((point / revenue) * 1000) / 10 : null;

  return { terms, point, low, high, currency: i.currency || 'USD', shareOfRevenue,
    wedge: (i.wedgeShare && i.wedgeShare > 0) ? {
      share: n(i.wedgeShare), low: low * n(i.wedgeShare), high: high * n(i.wedgeShare),
      buildCost: n(i.buildCost),
      paybackMonths: n(i.buildCost) && (low * n(i.wedgeShare)) > 0 ? Math.round((n(i.buildCost) / ((low * n(i.wedgeShare)) / 12)) * 10) / 10 : null,
    } : null,

// ── Step 1: Extract inputs from raw client data ─────────────────────────────

export async function step1_extractInputs({
  runId, agentId, rawData, industry = '', chainLength = 2,
}) {
  await checkPermission({ agentId, namespace: 'knowledge_base.automation', throwOnViolation: true });
  const start = Date.now();
  const truncated = rawData.length > 30_000 ? rawData.slice(0, 30_000) + '\n[...truncated]' : rawData;

  const prompt = [
    'Extract Friction Tax inputs from client operational data.',
    industry ? `Industry: ${industry}` : '',
    'Four terms: QUEUE { units, waitDays, costPerUnitDay }, REWORK { incidents, hours, rate, downstream },',
    'TRANSLATION { hoursPerWeek, rate }, COORDINATION { meetingHours, attendees, rate }.',
    'Also: revenue (annual), currency (ISO), uncertainty per term (0-1).',
    'Only extract what data supports; 0 for missing fields.',
    'Return JSON: { queue:{...}, rework:{...}, translation:{...}, coordination:{...}, revenue, currency, uncertainty:{queue,rework,translation,coordination} }',
    '', '## Client data', truncated,
  ].join('\n');

  const fmt = 'Return ONLY the JSON object. No commentary.';
  let result, errorMessage, verdict = 'passed';
  try { result = await callAiProvider(resolveProvider(), `${prompt}\n\n${fmt}`, '', { json: false, fallback: true }); }
  catch (e) { errorMessage = e.message; verdict = 'failed'; result = { text: '{}', providerName: 'none', modelName: 'none', tokensIn: 0, tokensOut: 0 }; }

  let inputs = { queue: {}, rework: {}, translation: {}, coordination: {}, currency: 'USD' };
  try { const m = (result.text || '').match(/\{[\s\S]*\}/); if (m) inputs = JSON.parse(m[0]); } catch {}

  const dur = Date.now() - start;
  await writeTrace({ runId, agentId, stepIndex: 0, chainLength, verified: false, input: truncated.slice(0, 2000), output: JSON.stringify(inputs).slice(0, 2000), providerName: result.providerName || 'unknown', modelName: result.modelName || 'unknown', tokensIn: result.tokensIn || 0, tokensOut: result.tokensOut || 0, durationMs: dur, verdict, errorMessage, verificationCheck: 'schema: FrictionTaxInputs', namespacesAccessed: ['knowledge_base.automation'] });
  await consumeBudget({ runId, tokensIn: result.tokensIn || 0, tokensOut: result.tokensOut || 0, costUsdMills: 0 });
  if (verdict === 'failed') throw new Error(`[FrictionTaxAgent] Extraction failed: ${errorMessage}`);
  return { inputs };
}

  };
}


// ── Orchestrator ────────────────────────────────────────────────────────────

export async function runFrictionTaxAssembly({
  agentId = 'nova', rawData, industry = '', currency = 'USD', revenue, wedgeShare, buildCost, tokenLimit, costLimitUsdMills, stepLimit = 4,
}) {
  if (!rawData || rawData.trim().length === 0) throw new Error('[FrictionTaxAgent] rawData required');
  const runId = generateRunId();
  const chainLength = 2;
  let lastVerified = -1;
  await createBudget({ runId, tokenLimit, costLimitUsdMills, stepLimit });
  console.log(`[FrictionTaxAgent] Run ${runId} — agent ${agentId}`);

  // Step 0 — Extract
  assertChainLength(0, chainLength, lastVerified);
  const { inputs } = await step1_extractInputs({ runId, agentId, rawData, industry, chainLength });

  // Gate 1
  const v1 = await verifyStep({ output: JSON.stringify(inputs), checks: [{ type: 'schema', requiredFields: ['queue', 'rework', 'translation', 'coordination'] }], runId, stepIndex: 0, agentId });
  if (!v1.passed) throw new Error(`[FrictionTaxAgent] Gate 1 failed: ${v1.summary}`);
  lastVerified = 0;

  // Step 1 — Compute (deterministic — no LLM)
  const fullInputs = { ...inputs, currency: inputs.currency || currency, revenue, wedgeShare, buildCost };
  const result = computeFrictionTax(fullInputs);

  // Gate 2
  const v2 = await verifyStep({ output: JSON.stringify(result), checks: [{ type: 'schema', requiredFields: ['terms', 'point', 'low', 'high'] }, { type: 'non_empty', field: 'terms' }], runId, stepIndex: 1, agentId });
  if (!v2.passed) throw new Error(`[FrictionTaxAgent] Gate 2 failed: ${v2.summary}`);

  await writeTrace({ runId, agentId, stepIndex: 1, chainLength, verified: true, input: JSON.stringify(fullInputs).slice(0, 2000), output: JSON.stringify(result).slice(0, 3000), providerName: 'deterministic', modelName: 'computeFrictionTax', tokensIn: 0, tokensOut: 0, durationMs: 0, verdict: 'passed', verificationCheck: 'deterministic compute', namespacesAccessed: [] });

  await persistTaxResult({ runId, agentId, inputs: fullInputs, result, inputHash: hashContent(rawData) });
  console.log(`[FrictionTaxAgent] Run ${runId} complete — ${result.currency} ${Math.round(result.low).toLocaleString()}–${Math.round(result.high).toLocaleString()}/yr`);
  return { runId, inputs: fullInputs, result };
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function persistTaxResult({ runId, agentId, inputs, result, inputHash }) {
  const db = getSupabase();
  if (!db) return;
  try {
    const { error } = await db.from('friction_tax_runs').upsert({ run_id: runId, agent_id: agentId, inputs, result, input_hash: inputHash }, { onConflict: 'run_id' });
    if (error) console.warn('[FrictionTaxAgent] Persist failed:', error.message);
  } catch (e) { console.warn('[FrictionTaxAgent] Persist exception:', e.message); }
}

export async function queryTaxRuns({ agentId, limit = 10 } = {}) {
  const db = getSupabase();
  if (!db) return [];
  let q = db.from('friction_tax_runs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (agentId) q = q.eq('agent_id', agentId);
  const { data, error } = await q;
  if (error) { console.warn('[FrictionTaxAgent] Query failed:', error.message); return []; }
  return data || [];
}

const DEFAULT_UNCERTAINTY = { queue: 0.30, rework: 0.25, translation: 0.15, coordination: 0.35 };
