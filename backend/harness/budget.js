/**
 * DigiFusion Agent Harness — Budget Ceiling
 * ===========================================
 * Phase 1, Piece 3: Enforced budget per run.
 *
 * The plan is explicit:
 *   "Tokens and currency, enforced, with the run aborting rather than degrading."
 *
 * A budget is created at the start of a run with ceilings for:
 *   - total tokens (input + output)
 *   - total cost (in milli-dollars)
 *   - maximum steps
 *
 * After every agent step, the harness checks whether any ceiling has been breached.
 * If so, the run is aborted and the caller receives a BudgetExceededError.
 */

import { getSupabase } from '../supabaseClient.js';

// ── Budget defaults (overridable per run) ────────────────────────────────────
// These are the ceilings from the plan. The plan says "budget ceiling per run"
// and mentions "token + currency, enforced". Defaults are safe ceilings that
// should trigger only if something has gone wrong (e.g. an unbounded loop).

const DEFAULT_TOKEN_LIMIT        = 200_000;   // 200k tokens per run
const DEFAULT_COST_LIMIT_MILLS   = 10_000;    // $10.00
const DEFAULT_STEP_LIMIT         = 12;        // max chain length

/** Error thrown when a budget ceiling is exceeded. */
export class BudgetExceededError extends Error {
  constructor(reason, runId, detail = {}) {
    super(`[Harness:Budget] RUN ABORTED — ${reason}`);
    this.name         = 'BudgetExceededError';
    this.runId        = runId;
    this.detail       = detail;
    this.isBudgetError = true;  // for instanceof-like checks without class coupling
  }
}

/**
 * Create a budget row for a new run.
 *
 * @param {object} params
 * @param {string} params.runId
 * @param {number} [params.tokenLimit=200000]
 * @param {number} [params.costLimitUsdMills=10000]  - milli-dollars ($10)
 * @param {number} [params.stepLimit=12]
 * @returns {Promise<object|null>} the created budget row, or null if DB unavailable
 */
export async function createBudget({
  runId,
  tokenLimit       = DEFAULT_TOKEN_LIMIT,
  costLimitUsdMills = DEFAULT_COST_LIMIT_MILLS,
  stepLimit        = DEFAULT_STEP_LIMIT,
}) {
  const db = getSupabase();
  if (!db) return null;

  const row = {
    run_id:               runId,
    token_limit:          tokenLimit,
    cost_limit_usd_mills: costLimitUsdMills,
    step_limit:           stepLimit,
    tokens_consumed:      0,
    cost_consumed_usd_mills: 0,
    steps_executed:       0,
    status:               'active',
  };

  try {
    const { data, error } = await db.from('agent_budgets').insert(row).select().single();
    if (error) {
      console.warn(`[Harness:Budget] Create failed for ${runId}:`, error.message);
      return null;
    }
    console.log(`[Harness:Budget] Created ${runId}: token≤${tokenLimit} cost≤${costLimitUsdMills}mills step≤${stepLimit}`);
    return data;
  } catch (e) {
    console.warn(`[Harness:Budget] Create exception for ${runId}:`, e.message);
    return null;
  }
}

/**
 * Consume budget after a step. Checks ALL three ceilings.
 * Throws BudgetExceededError if any ceiling is breached.
 *
 * Call this AFTER writing the trace row for the step.
 *
 * @param {object} params
 * @param {string} params.runId
 * @param {number} params.tokensIn
 * @param {number} params.tokensOut
 * @param {number} params.costUsdMills
 * @throws {BudgetExceededError} if any ceiling is breached
 */
export async function consumeBudget({ runId, tokensIn = 0, tokensOut = 0, costUsdMills = 0 }) {
  const db = getSupabase();
  if (!db) return; // No DB = no budget enforcement (standalone dev mode)

  const totalTokens = tokensIn + tokensOut;

  // 1. Fetch current budget
  const { data: budget, error } = await db.from('agent_budgets')
    .select('*')
    .eq('run_id', runId)
    .single();

  if (error || !budget) {
    console.warn(`[Harness:Budget] Budget not found for ${runId} — skipping enforcement`);
    return;
  }

  if (budget.status !== 'active') {
    throw new BudgetExceededError(
      `Budget already ${budget.status}: ${budget.aborted_reason || 'unknown reason'}`,
      runId,
      { previousStatus: budget.status }
    );
  }

  // 2. Compute new totals
  const newTokens  = Number(budget.tokens_consumed) + totalTokens;
  const newCost    = Number(budget.cost_consumed_usd_mills) + (costUsdMills || 0);
  const newSteps   = Number(budget.steps_executed) + 1;

  // 3. Check ceilings
  const breaches = [];
  if (newTokens > budget.token_limit) {
    breaches.push(`token: ${newTokens}/${budget.token_limit}`);
  }
  if (newCost > budget.cost_limit_usd_mills) {
    breaches.push(`cost: ${newCost}/${budget.cost_limit_usd_mills}mills`);
  }
  if (newSteps > budget.step_limit) {
    breaches.push(`step: ${newSteps}/${budget.step_limit}`);
  }

  // 4. Update running totals
  const update = {
    tokens_consumed:         newTokens,
    cost_consumed_usd_mills: newCost,
    steps_executed:          newSteps,
  };

  if (breaches.length > 0) {
    update.status         = 'exceeded';
    update.exceeded_at    = new Date().toISOString();
    update.aborted_reason = `Ceilings breached: ${breaches.join(', ')}`;
  }

  const { error: updateErr } = await db.from('agent_budgets')
    .update(update)
    .eq('run_id', runId);

  if (updateErr) {
    console.warn(`[Harness:Budget] Update failed for ${runId}:`, updateErr.message);
  }

  console.log(`[Harness:Budget] ${runId}: ${newTokens} tok | ${newCost}mills | step ${newSteps}/${budget.step_limit}`);

  // 5. Throw if breached
  if (breaches.length > 0) {
    throw new BudgetExceededError(
      `Run ${runId} exceeded budget: ${breaches.join(', ')}`,
      runId,
      { tokens: newTokens, cost: newCost, steps: newSteps, limits: { token: budget.token_limit, cost: budget.cost_limit_usd_mills, step: budget.step_limit } }
    );
  }
}

/**
 * Check current budget status without consuming.
 * Returns null if no budget exists (standalone dev mode).
 */
export async function getBudgetStatus(runId) {
  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db.from('agent_budgets')
    .select('*')
    .eq('run_id', runId)
    .single();

  if (error || !data) return null;

  return {
    runId,
    status:            data.status,
    tokensConsumed:    data.tokens_consumed,
    tokensLimit:       data.token_limit,
    costConsumedMills: data.cost_consumed_usd_mills,
    costLimitMills:    data.cost_limit_usd_mills,
    stepsExecuted:     data.steps_executed,
    stepLimit:         data.step_limit,
    remainingTokens:   Math.max(0, data.token_limit - data.tokens_consumed),
    remainingCostMills: Math.max(0, data.cost_limit_usd_mills - Number(data.cost_consumed_usd_mills)),
    remainingSteps:    Math.max(0, data.step_limit - data.steps_executed),
  };
}

/**
 * Manually abort a budget (e.g. on unrecoverable error).
 */
export async function abortBudget(runId, reason) {
  const db = getSupabase();
  if (!db) return;
  await db.from('agent_budgets')
    .update({ status: 'aborted', aborted_reason: reason, exceeded_at: new Date().toISOString() })
    .eq('run_id', runId);
}

/**
 * Wrap an async budgeted step. Creates the budget if this is the first step,
 * consumes tokens/cost after the step, and throws BudgetExceededError on breach.
 */
export async function withBudget({
  runId,
  tokensIn,
  tokensOut,
  costUsdMills,
  stepLimit,
  tokenLimit,
  costLimitUsdMills,
  isFirstStep = false,
}) {
  // First step: create the budget
  if (isFirstStep) {
    await createBudget({ runId, tokenLimit, costLimitUsdMills, stepLimit });
  }

  // Consume (this throws if exceeded)
  await consumeBudget({ runId, tokensIn, tokensOut, costUsdMills });
}