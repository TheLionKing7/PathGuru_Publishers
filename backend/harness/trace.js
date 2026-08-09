/**
 * DigiFusion Agent Harness — Trace System
 * =========================================
 * Phase 1, Piece 1: Per-run trace table.
 *
 * Every agent invocation writes one row into agent_traces.
 * This is NOT observability theatre — it is the raw material
 * for Phase 3 calibration.
 *
 * Design constraint (from the plan):
 *   "One table, written by every agent invocation. Everything in
 *    phases 2–4 depends on it and it is a day of work."
 */

import { createHash } from 'node:crypto';
import { getSupabase } from '../supabaseClient.js';

/**
 * Generate a unique run ID. Format: run-yyyymmdd-hhmmss-<6 random hex>
 * Deterministic enough to sort, unique enough to avoid collisions.
 */
export function generateRunId() {
  const now  = new Date();
  const pad  = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(16).slice(2, 8);
  return `run-${date}-${time}-${rand}`;
}

/**
 * SHA-256 hex digest of any stringifiable input.
 * Used for input_hash / output_hash so traces are cryptographically auditable
 * without storing the raw content in the trace table.
 */
export function hashContent(content) {
  if (content === null || content === undefined) return null;
  const str = typeof content === 'string' ? content : JSON.stringify(content);
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

// ── Token → cost maps (approximate, in milli-dollars) ──────────────────────
// Prices per 1M tokens. Kept here rather than in aiProviders.js
// so the harness has a single place to update when pricing changes.
const PROVIDER_PRICING_USD_PER_1M = {
  'deepseek-chat':                  { input: 0.27,  output: 1.10 },
  'deepseek-reasoner':              { input: 0.55,  output: 2.19 },
  'llama-3.3-70b-versatile':       { input: 0.59,  output: 0.79 },
  'llama-4-scout-17b-16e-instruct': { input: 0.10,  output: 0.10 },
  'claude-sonnet-4-5':              { input: 3.00,  output: 15.00 },
  'gemini-2.5-flash':               { input: 0.15,  output: 0.60 },
  'sonar-pro':                      { input: 1.00,  output: 1.00 },
};

function estimateCostUsdMills(modelName, tokensIn, tokensOut) {
  const pricing = PROVIDER_PRICING_USD_PER_1M[modelName];
  if (!pricing) return 0;
  const costUsd = (tokensIn / 1_000_000) * pricing.input
                + (tokensOut / 1_000_000) * pricing.output;
  return Math.round(costUsd * 1_000);
}

/**
 * Write a trace row for a single agent invocation.
 *
 * @param {object} params
 * @param {string} params.runId
 * @param {string} params.agentId
 * @param {number} params.stepIndex
 * @param {number} params.chainLength
 * @param {boolean} params.verified
 * @param {*}      params.input
 * @param {*}      params.output
 * @param {string} params.providerName
 * @param {string} params.modelName
 * @param {Array}  [params.toolCalls]
 * @param {number} [params.tokensIn=0]
 * @param {number} [params.tokensOut=0]
 * @param {number} [params.durationMs=0]
 * @param {string} [params.verdict='passed']
 * @param {string} [params.errorMessage]
 * @param {string} [params.verificationCheck]
 * @param {string[]} [params.namespacesAccessed]
 * @returns {Promise<string|null>} trace row id, or null if DB unavailable
 */
export async function writeTrace({
  runId,
  agentId,
  stepIndex = 0,
  chainLength = 1,
  verified = false,
  input,
  output,
  providerName,
  modelName,
  toolCalls = [],
  tokensIn = 0,
  tokensOut = 0,
  durationMs = 0,
  verdict = 'passed',
  errorMessage,
  verificationCheck,
  namespacesAccessed = [],
}) {
  const db = getSupabase();
  if (!db) return null;

  const cost = estimateCostUsdMills(modelName, tokensIn, tokensOut);

  const row = {
    run_id:              runId,
    agent_id:            agentId,
    step_index:          stepIndex,
    chain_length:        chainLength,
    verified,
    input_hash:          hashContent(input),
    output_hash:         hashContent(output),
    provider_name:       providerName || null,
    model_name:          modelName || null,
    tool_calls:          JSON.stringify(toolCalls),
    tokens_in:           tokensIn,
    tokens_out:          tokensOut,
    cost_usd_mills:      cost,
    duration_ms:         durationMs,
    started_at:          new Date(Date.now() - durationMs).toISOString(),
    finished_at:         new Date().toISOString(),
    verdict,
    error_message:       errorMessage || null,
    verification_check:  verificationCheck || null,
    namespaces_accessed: namespacesAccessed,
  };

  try {
    const { data, error } = await db.from('agent_traces').insert(row).select('id').single();
    if (error) {
      console.warn(`[Harness:Trace] Write failed for ${agentId}:${stepIndex}:`, error.message);
      return null;
    }
    console.log(`[Harness:Trace] ${agentId}.${stepIndex} → ${verdict} | ${tokensIn}+${tokensOut} tok | ${cost}mills | ${durationMs}ms`);
    return data?.id || null;
  } catch (e) {
    console.warn(`[Harness:Trace] Write exception for ${agentId}:${stepIndex}:`, e.message);
    return null;
  }
}

/**
 * Wrap an async LLM call with automatic trace instrumentation.
 */
export async function tracedCall({
  runId,
  agentId,
  stepIndex,
  chainLength,
  verified,
  llmCall,
  input,
  verificationCheck,
  namespacesAccessed,
}) {
  const start = Date.now();
  let result;
  let errorMessage;
  let verdict = 'passed';

  try {
    result = await llmCall();
  } catch (e) {
    errorMessage = e.message;
    verdict       = 'failed';
    result        = { text: '', providerName: null, modelName: null, tokensIn: 0, tokensOut: 0 };
  }

  const durationMs = Date.now() - start;

  const traceId = await writeTrace({
    runId,
    agentId,
    stepIndex,
    chainLength,
    verified,
    input,
    output:              result.text,
    providerName:        result.providerName,
    modelName:           result.modelName,
    tokensIn:            result.tokensIn || 0,
    tokensOut:           result.tokensOut || 0,
    durationMs,
    verdict,
    errorMessage,
    verificationCheck,
    namespacesAccessed,
  });

  return { text: result.text, traceId, durationMs, errorMessage };
}

/**
 * Query trace history for calibration / debugging.
 */
export async function queryTraces({ runId, agentId, limit = 50 } = {}) {
  const db = getSupabase();
  if (!db) return [];
  let q = db.from('agent_traces').select('*').order('started_at', { ascending: true }).limit(limit);
  if (runId)   q = q.eq('run_id', runId);
  if (agentId) q = q.eq('agent_id', agentId);
  const { data, error } = await q;
  if (error) { console.warn('[Harness:Trace] Query failed:', error.message); return []; }
  return data || [];
}

/**
 * Aggregate trace stats for a run — useful for budget checking.
 */
export async function getRunStats(runId) {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.from('agent_traces')
    .select('tokens_in, tokens_out, cost_usd_mills, verdict, step_index')
    .eq('run_id', runId);
  if (error || !data) return null;
  const totals = data.reduce((acc, row) => ({
    tokensIn:       acc.tokensIn       + (row.tokens_in || 0),
    tokensOut:      acc.tokensOut      + (row.tokens_out || 0),
    costUsdMills:   acc.costUsdMills   + (Number(row.cost_usd_mills) || 0),
    stepsCompleted: acc.stepsCompleted + 1,
    stepsFailed:    acc.stepsFailed    + (row.verdict === 'failed' ? 1 : 0),
  }), { tokensIn: 0, tokensOut: 0, costUsdMills: 0, stepsCompleted: 0, stepsFailed: 0 });
  return totals;
}