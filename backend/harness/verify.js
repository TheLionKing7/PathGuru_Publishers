/**
 * DigiFusion Agent Harness — Verification Gate
 * ==============================================
 * Phase 1, Piece 2: Verification between chain steps.
 *
 * The plan is explicit:
 *   "Chains longer than three steps without one are rejected
 *    at the orchestration layer rather than discouraged in a document."
 *
 * A verification gate is a checkable condition on an agent's output:
 *   - schema:    output must match a JSON schema
 *   - range:     a numeric field must fall within [min, max]
 *   - citation:  output must contain at least one URL or source reference
 *   - non_empty: a required field must not be null/undefined/empty string
 *   - custom:    a caller-supplied predicate function
 *
 * Usage:
 *   import { verifyStep, assertChainLength } from '../harness/verify.js';
 *   assertChainLength(stepIndex, chainLength);   // throws if >3 steps without gate
 *   const result = await verifyStep({ output, checks: [...] });
 */

import { getSupabase } from '../supabaseClient.js';

/** Maximum consecutive steps allowed before a verification gate is REQUIRED. */
export const MAX_UNVERIFIED_STEPS = 3;

/**
 * Hard-reject chains that exceed MAX_UNVERIFIED_STEPS without a gate.
 * Called BEFORE each agent step. If this throws, the orchestration aborts.
 *
 * @param {number} stepIndex          - current step (0-based)
 * @param {number} chainLength        - total planned steps
 * @param {number} lastVerifiedIndex  - index of the last step that passed verification (-1 if none)
 * @throws {Error} if more than MAX_UNVERIFIED_STEPS since last verified step
 */
export function assertChainLength(stepIndex, chainLength, lastVerifiedIndex = -1) {
  const stepsSinceVerify = stepIndex - lastVerifiedIndex;

  if (stepsSinceVerify >= MAX_UNVERIFIED_STEPS) {
    throw new Error(
      `[Harness:Verify] REJECTED — ${stepsSinceVerify} consecutive steps without a verification gate ` +
      `(max allowed: ${MAX_UNVERIFIED_STEPS}). ` +
      `Last verified step: ${lastVerifiedIndex >= 0 ? lastVerifiedIndex : 'none'}. ` +
      `Insert a verifyStep() call between steps ${lastVerifiedIndex + 1} and ${stepIndex}.`
    );
  }
}

// ── Check runners ─────────────────────────────────────────────────────────

function checkSchema(output, schema) {
  // Simple structural check: does the output (string) parse as JSON
  // and contain the required top-level keys?
  if (typeof output !== 'string') return { passed: true, detail: 'non-string output, schema check skipped' };
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    // Try to extract JSON from markdown-wrapped text
    const match = output.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return { passed: false, detail: 'Output is not valid JSON and contains no JSON-like structure' };
    try { parsed = JSON.parse(match[0]); } catch {
      return { passed: false, detail: 'Could not parse output as JSON' };
    }
  }
  if (schema.requiredFields) {
    const missing = schema.requiredFields.filter(f => !(f in parsed));
    if (missing.length) return { passed: false, detail: `Missing required fields: ${missing.join(', ')}` };
  }
  return { passed: true, detail: `Schema valid: ${schema.requiredFields?.length || 0} required fields present` };
}

function checkRange(output, range) {
  // Extract a numeric value from the output by field name
  let value;
  if (typeof output === 'object' && output !== null) {
    value = output[range.field];
  } else if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output);
      value = parsed[range.field];
    } catch {
      // try regex: "field": number
      const re = new RegExp(`"${range.field}"\\s*:\\s*(\\d+\\.?\\d*)`);
      const m  = output.match(re);
      value = m ? parseFloat(m[1]) : undefined;
    }
  }
  if (value === undefined || value === null) {
    return { passed: false, detail: `Field "${range.field}" not found in output` };
  }
  if (typeof range.min === 'number' && value < range.min) {
    return { passed: false, detail: `${range.field}=${value} below minimum ${range.min}` };
  }
  if (typeof range.max === 'number' && value > range.max) {
    return { passed: false, detail: `${range.field}=${value} above maximum ${range.max}` };
  }
  return { passed: true, detail: `${range.field}=${value} in [${range.min ?? '-∞'}, ${range.max ?? '∞'}]` };
}

function checkCitation(output) {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  // Look for URLs or source references like [1], (Source: ...), "according to..."
  const hasUrl      = /https?:\/\/[^\s]+/.test(text);
  const hasRef      = /\[\d+\]/.test(text);
  const hasAttrib   = /(?:source|according to|cited in|referenced in)/i.test(text);
  const hasArxivOrDoi = /\b(?:arxiv|doi\.org|pmid|10\.\d{4,})\b/i.test(text);
  const passed = hasUrl || hasRef || hasAttrib || hasArxivOrDoi;
  return {
    passed,
    detail: passed
      ? 'Citation found in output'
      : 'No URL, reference marker, or attribution found — output may be unsourced',
  };
}

function checkNonEmpty(output, field) {
  if (output === null || output === undefined) {
    return { passed: false, detail: 'Output is null/undefined' };
  }
  if (typeof output === 'string') {
    let parsed;
    try { parsed = JSON.parse(output); } catch { parsed = null; }
    if (parsed && field) {
      const val = parsed[field];
      if (val === undefined || val === null || val === '') {
        return { passed: false, detail: `Field "${field}" is empty` };
      }
      return { passed: true, detail: `Field "${field}" is non-empty` };
    }
    // No field specified or not JSON — check the whole string
    const trimmed = output.trim();
    return { passed: trimmed.length > 0, detail: trimmed.length > 0 ? `Output is non-empty (${trimmed.length} chars)` : 'Output is empty' };
  }
  if (typeof output === 'object') {
    if (field) {
      const val = output[field];
      const empty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
      return { passed: !empty, detail: empty ? `Field "${field}" is empty` : `Field "${field}" is non-empty` };
    }
    return { passed: true, detail: 'Output is a non-null object' };
  }
  return { passed: true, detail: 'Output is non-empty' };
}

// ── Verify step ───────────────────────────────────────────────────────────

/**
 * Run verification checks on an agent's output between chain steps.
 *
 * @param {object} params
 * @param {*}      params.output          - the agent's output to verify
 * @param {Array}  params.checks          - array of check descriptors:
 *   { type: 'schema',     requiredFields: ['title', 'content'] }
 *   { type: 'range',      field: 'score', min: 0, max: 100 }
 *   { type: 'citation' }
 *   { type: 'non_empty',  field?: 'brief' }
 *   { type: 'custom',     predicate: (output) => boolean, detail?: string }
 * @param {string} [params.runId]         - optionally log to verification_log
 * @param {number} [params.stepIndex]
 * @param {string} [params.agentId]
 * @returns {{ passed: boolean, results: Array, summary: string }}
 */
export async function verifyStep({ output, checks = [], runId, stepIndex, agentId } = {}) {
  if (!checks.length) {
    return { passed: true, results: [], summary: 'No checks defined — passing by default' };
  }

  const results = [];
  let allPassed = true;

  for (const check of checks) {
    let result;
    switch (check.type) {
      case 'schema':
        result = checkSchema(output, check);
        break;
      case 'range':
        result = checkRange(output, check);
        break;
      case 'citation':
        result = checkCitation(output);
        break;
      case 'non_empty':
        result = checkNonEmpty(output, check.field);
        break;
      case 'custom':
        try {
          const passed = check.predicate(output);
          result = { passed, detail: check.detail || (passed ? 'Custom check passed' : 'Custom check failed') };
        } catch (e) {
          result = { passed: false, detail: `Custom check threw: ${e.message}` };
        }
        break;
      default:
        result = { passed: false, detail: `Unknown check type: ${check.type}` };
    }

    results.push({ type: check.type, ...result });
    if (!result.passed) allPassed = false;
  }

  // Log to verification_log table if DB is available
  if (runId !== undefined && stepIndex !== undefined) {
    const db = getSupabase();
    if (db) {
      const rows = results.map(r => ({
        run_id:          runId,
        step_index:      stepIndex,
        agent_id:        agentId || 'unknown',
        check_type:      r.type,
        check_condition: JSON.stringify(checks.find(c => c.type === r.type) || {}),
        passed:          r.passed,
        detail:          r.detail,
      }));
      // Fire-and-forget — don't block the chain on logging
      Promise.all(rows.map(row => db.from('verification_log').insert(row)))
        .catch(e => console.warn('[Harness:Verify] Log write failed:', e.message));
    }
  }

  const failedChecks = results.filter(r => !r.passed);
  const summary = allPassed
    ? `All ${results.length} checks passed`
    : `${failedChecks.length}/${results.length} checks failed: ${failedChecks.map(r => `${r.type}(${r.detail})`).join('; ')}`;

  return { passed: allPassed, results, summary };
}

/**
 * Convenience: assert a non_empty check. Throws if the field is empty.
 * Used as a lightweight gate between steps without the full verifyStep() ceremony.
 */
export function assertNonEmpty(output, field, label = 'output') {
  if (output === null || output === undefined) {
    throw new Error(`[Harness:Verify] ${label} is null/undefined`);
  }
  if (typeof output === 'string' && output.trim().length === 0) {
    throw new Error(`[Harness:Verify] ${label} is an empty string`);
  }
  if (field) {
    let val;
    if (typeof output === 'object') val = output[field];
    else if (typeof output === 'string') {
      try { val = JSON.parse(output)[field]; } catch { val = undefined; }
    }
    if (val === undefined || val === null || val === '') {
      throw new Error(`[Harness:Verify] ${label}.${field} is empty`);
    }
  }
}