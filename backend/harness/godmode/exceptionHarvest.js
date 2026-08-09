/**
 * DigiFusion Agent Harness — Phase 2, Piece 1: Exception Harvest
 * ================================================================
 *
 * "The mapping sprint's day three is the longest day and the one you said
 *  must not be compressed. An agent cannot replace it, but it can do the
 *  legwork: ingest ninety days of tickets and correction logs, cluster
 *  deviations, and produce a *candidate* four-field catalogue — trigger,
 *  frequency, cost, reason. Two steps, verified."
 *
 * The four-field catalog:
 *   trigger   — what event or condition caused the exception
 *   frequency — how often (per month, per quarter)
 *   cost      — estimated cost per incident (time × rate + downstream)
 *   reason    — root cause classification (process_gap, tool_gap, etc.)
 *
 * Architecture (2-step verified chain):
 *   Step 0: extractDeviations → raw tickets → structured deviation records
 *   VERIFY:  schema check (event, date, resolution_time, category required)
 *   Step 1: clusterDeviations → structured records → 4-field catalog
 *   VERIFY:  non_empty check on clusters
 */

import { callAiProvider, resolveProvider } from '../../aiProviders.js';
import { getSupabase }               from '../../supabaseClient.js';
import { generateRunId, writeTrace, hashContent } from '../trace.js';
import { verifyStep, assertChainLength } from '../verify.js';
import { createBudget, consumeBudget } from '../budget.js';
import { checkPermission }            from '../perimeter.js';

const DEVIATION_SCHEMA = { requiredFields: ['event', 'date', 'resolution_time', 'category'] };
const MAX_TICKETS = 500;


// ── Step 1: Extraction ──────────────────────────────────────────────────────

export async function step1_extractDeviations({
  runId, agentId, rawInput, industry = '', chainLength = 2,
}) {
  await checkPermission({ agentId, namespace: 'knowledge_base.automation', throwOnViolation: true });
  const start = Date.now();

  const truncated = rawInput.length > 50_000
    ? rawInput.slice(0, 50_000) + `\n\n[...truncated ${rawInput.length - 50_000} chars]`
    : rawInput;

  const prompt = [
    'You are an operations analyst extracting structured deviation records from raw logs.',
    industry ? `Industry: ${industry}` : '',
    '',
    'Rules: Extract EVERY exception/rework incident. For each: event, date (ISO),',
    'resolution_time (minutes|null), category (process_gap|tool_gap|training|communication|data_error|handoff|other),',
    'cost_hint (resolution_time × ~loaded_rate, null if unknown). Never fabricate. Return valid JSON array.',
    '',
    '## Raw logs',
    truncated,
  ].filter(Boolean).join('\n');

  const devPrompt = 'Return ONLY a JSON array. Each object: { event, date, resolution_time, category, cost_hint }.';

  let result, errorMessage, verdict = 'passed';
  try {
    result = await callAiProvider(resolveProvider(), `${prompt}\n\n${devPrompt}`, '', { json: false, fallback: true });
  } catch (e) { errorMessage = e.message; verdict = 'failed'; result = { text: '[]', providerName: 'none', modelName: 'none', tokensIn: 0, tokensOut: 0 }; }

  let deviations = [];
  try { const m = (result.text || '').match(/\[[\s\S]*\]/); if (m) deviations = JSON.parse(m[0]); if (!Array.isArray(deviations)) deviations = []; } catch { deviations = []; }

  const dur = Date.now() - start;
  await writeTrace({ runId, agentId, stepIndex: 0, chainLength, verified: false, input: truncated.slice(0, 2000), output: JSON.stringify(deviations).slice(0, 2000), providerName: result.providerName || 'unknown', modelName: result.modelName || 'unknown', tokensIn: result.tokensIn || 0, tokensOut: result.tokensOut || 0, durationMs: dur, verdict, errorMessage, verificationCheck: 'schema: deviation array', namespacesAccessed: ['knowledge_base.automation'] });
  await consumeBudget({ runId, tokensIn: result.tokensIn || 0, tokensOut: result.tokensOut || 0, costUsdMills: 0 });

  if (verdict === 'failed') throw new Error(`[ExceptionHarvest] Step 1 failed: ${errorMessage}`);
  return { deviations, raw: result.text || '' };
}

// ── Step 2: Clustering → 4-Field Catalog ────────────────────────────────────

export async function step2_clusterDeviations({
  runId, agentId, deviations, chainLength = 2,
}) {
  const start = Date.now();
  const devText = JSON.stringify(deviations.slice(0, MAX_TICKETS));
  const devCount = deviations.length;

  const prompt = [
    `Cluster ${devCount} deviations from 90 days of tickets into a 4-field catalog.`,
    'Group by ROOT CAUSE PATTERN. For each cluster: trigger (specific event/condition),',
    'frequency_per_month (best estimate), annual_cost_estimate (sum cost_hint × monthly frequency × 12),',
    'cost_working (show arithmetic), reason (process_gap|tool_gap|training|communication|data_error|handoff|other),',
    'recommendation (one concrete elimination step), deviation_count.',
    'Clusters with <3 deviations: merge into nearest larger cluster unless cost > 20% of total.',
    'Output JSON: { clusters: [...], summary: { total_annual_cost, total_clusters, top_cluster, consultant_note } }',
    '',
    '## Deviations',
    devText,
  ].join('\n');

  const fmt = 'Return ONLY the JSON object. No commentary, no markdown.';

  let result, errorMessage, verdict = 'passed';
  try {
    result = await callAiProvider(resolveProvider(), `${prompt}\n\n${fmt}`, '', { json: false, fallback: true });
  } catch (e) { errorMessage = e.message; verdict = 'failed'; result = { text: '{}', providerName: 'none', modelName: 'none', tokensIn: 0, tokensOut: 0 }; }

  let catalog = { clusters: [], summary: {} };
  try { const m = (result.text || '').match(/\{[\s\S]*\}/); if (m) catalog = JSON.parse(m[0]); } catch {}

  const dur = Date.now() - start;
  await writeTrace({ runId, agentId, stepIndex: 1, chainLength, verified: true, input: `[${devCount} deviations]`, output: JSON.stringify(catalog).slice(0, 3000), providerName: result.providerName || 'unknown', modelName: result.modelName || 'unknown', tokensIn: result.tokensIn || 0, tokensOut: result.tokensOut || 0, durationMs: dur, verdict, errorMessage, verificationCheck: 'non_empty: clusters', namespacesAccessed: ['knowledge_base.automation'] });
  await consumeBudget({ runId, tokensIn: result.tokensIn || 0, tokensOut: result.tokensOut || 0, costUsdMills: 0 });

  if (verdict === 'failed') throw new Error(`[ExceptionHarvest] Step 2 failed: ${errorMessage}`);
  return { clusters: catalog.clusters || [], summary: catalog.summary || {} };
}


// ── Orchestrator: Run the full 2-step verified harvest ──────────────────────

export async function runExceptionHarvest({
  agentId = 'nova', rawInput, industry = '', tokenLimit, costLimitUsdMills, stepLimit = 4,
}) {
  if (!rawInput || rawInput.trim().length === 0) throw new Error('[ExceptionHarvest] rawInput required');

  const runId = generateRunId();
  const chainLength = 2;
  let lastVerified = -1;

  await createBudget({ runId, tokenLimit, costLimitUsdMills, stepLimit });
  console.log(`[ExceptionHarvest] Run ${runId} started — agent ${agentId}`);

  // Step 0 — Extract
  assertChainLength(0, chainLength, lastVerified);
  console.log(`[ExceptionHarvest] Step 0: Extracting deviations from ${rawInput.length} chars...`);
  const { deviations } = await step1_extractDeviations({ runId, agentId, rawInput, industry, chainLength });
  console.log(`[ExceptionHarvest] Step 0 complete — ${deviations.length} deviations`);

  // Gate 1
  const v1 = await verifyStep({ output: JSON.stringify(deviations), checks: [{ type: 'schema', requiredFields: DEVIATION_SCHEMA.requiredFields }, { type: 'non_empty' }], runId, stepIndex: 0, agentId });
  if (!v1.passed) throw new Error(`[ExceptionHarvest] Gate 1 failed: ${v1.summary}`);
  lastVerified = 0;
  console.log(`[ExceptionHarvest] Gate 1: ${v1.summary}`);

  // Step 1 — Cluster
  assertChainLength(1, chainLength, lastVerified);
  console.log(`[ExceptionHarvest] Step 1: Clustering ${deviations.length} deviations...`);
  const { clusters, summary } = await step2_clusterDeviations({ runId, agentId, deviations, chainLength });
  console.log(`[ExceptionHarvest] Step 1 complete — ${clusters.length} clusters`);

  // Gate 2
  const v2 = await verifyStep({ output: JSON.stringify({ clusters, summary }), checks: [{ type: 'schema', requiredFields: ['clusters', 'summary'] }, { type: 'non_empty', field: 'clusters' }], runId, stepIndex: 1, agentId });
  if (!v2.passed) throw new Error(`[ExceptionHarvest] Gate 2 failed: ${v2.summary}`);
  console.log(`[ExceptionHarvest] Gate 2: ${v2.summary}`);

  // Persist
  await persistHarvestResult({ runId, agentId, clusters, summary, inputHash: hashContent(rawInput) });
  console.log(`[ExceptionHarvest] Run ${runId} complete — ${clusters.length} clusters`);

  return { runId, catalog: clusters, summary, deviations };
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function persistHarvestResult({ runId, agentId, clusters, summary, inputHash }) {
  const db = getSupabase();
  if (!db) return;
  try {
    const rows = clusters.map((c, i) => ({
      run_id: runId, agent_id: agentId, cluster_index: i,
      trigger: String(c.trigger || '').slice(0, 500),
      frequency_per_month: Number(c.frequency_per_month) || 0,
      annual_cost_estimate: Number(c.annual_cost_estimate) || 0,
      cost_working: String(c.cost_working || '').slice(0, 1000),
      reason: String(c.reason || 'other').slice(0, 100),
      recommendation: String(c.recommendation || '').slice(0, 1000),
      deviation_count: Number(c.deviation_count) || 0,
      input_hash: inputHash,
      total_annual_cost: Number(summary?.total_annual_cost) || 0,
      total_clusters: Number(summary?.total_clusters) || clusters.length,
      top_cluster: String(summary?.top_cluster || '').slice(0, 500),
      consultant_note: String(summary?.consultant_note || '').slice(0, 500),
    }));
    const { error } = await db.from('exception_catalog').upsert(rows, { onConflict: 'run_id, cluster_index' });
    if (error) console.warn('[ExceptionHarvest] Persist failed:', error.message);
    else console.log(`[ExceptionHarvest] Persisted ${rows.length} rows`);
  } catch (e) { console.warn('[ExceptionHarvest] Persist exception:', e.message); }
}

export async function queryHarvestCatalogs({ agentId, limit = 10 } = {}) {
  const db = getSupabase();
  if (!db) return [];
  let q = db.from('exception_catalog').select('*').order('created_at', { ascending: false }).limit(limit);
  if (agentId) q = q.eq('agent_id', agentId);
  const { data, error } = await q;
  if (error) { console.warn('[ExceptionHarvest] Query failed:', error.message); return []; }
  return data || [];
}
