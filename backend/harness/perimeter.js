/**
 * DigiFusion Agent Harness — Context Perimeter
 * ==============================================
 * Phase 1, Piece 4: Which agent may read which knowledge namespace.
 *
 * The plan is explicit:
 *   "Which agent may read which knowledge namespace.
 *    Atlas does not need the blog drafts; Aether does not need the prospect register.
 *    The point is not secrecy. It is decorrelation: agents that read different
 *    things fail differently, and differently is what you want."
 *
 * Success test:
 *   "a deliberately poisoned knowledge-base entry should damage exactly
 *    one agent's output, not all seven."
 *
 * The perimeter is enforced by checkPermission() — called before any
 * knowledge_base or namespace-sensitive query. If the DB has agent_permissions
 * rows, those are the source of truth. Otherwise, a hardcoded fallback
 * (matching the seed data in 0019_agent_harness.sql) is used.
 */

import { getSupabase } from '../supabaseClient.js';

// ── Hardcoded perimeter fallback ────────────────────────────────────────────
// This matches the seed rows in 0019_agent_harness.sql exactly.
// Used when the DB is unavailable (standalone dev mode) or when
// agent_permissions table does not exist yet.
//
// Format: agent_id → Set of allowed namespace patterns
// Patterns support '*' as a wildcard suffix (e.g. 'knowledge_base.*')

const FALLBACK_PERIMETER = {
  nexus: new Set([
    'knowledge_base.*',
    'tasks.*',
    'leads.*',
    'agent_traces.*',
  ]),
  researcher: new Set([
    'knowledge_base.general',
    'knowledge_base.business_development',
    'knowledge_base.automation',
    'knowledge_base.digital_media',
  ]),
  atlas: new Set([
    'knowledge_base.business_development',
    'knowledge_base.general',
    'leads',
  ]),
  nova: new Set([
    'knowledge_base.automation',
    'knowledge_base.general',
  ]),
  aether: new Set([
    'knowledge_base.digital_media',
    'knowledge_base.general',
    'posts.*',
  ]),
  synthesizer: new Set([
    'knowledge_base.*',
  ]),
  pulse: new Set([
    'agent_traces.*',
    'tasks.*',
    'notifications.*',
  ]),
  assistant: new Set([
    'knowledge_base.general',
    'leads',
  ]),
};

// ── In-memory cache of DB-loaded permissions ───────────────────────────────
let _dbPermissionsCache = null;
let _dbPermissionsCacheTs = 0;
const DB_CACHE_TTL_MS = 5 * 60_000; // 5 minutes

/**
 * Load permissions from agent_permissions table.
 * Cached in-memory for 5 minutes.
 * Returns null if DB is unavailable.
 */
async function _loadDbPermissions() {
  const now = Date.now();
  if (_dbPermissionsCache && (now - _dbPermissionsCacheTs) < DB_CACHE_TTL_MS) {
    return _dbPermissionsCache;
  }

  const db = getSupabase();
  if (!db) return null;

  try {
    const { data, error } = await db.from('agent_permissions')
      .select('agent_id, namespace, access_level');

    if (error) {
      console.warn('[Harness:Perimeter] DB load failed:', error.message);
      return null;
    }

    if (!data?.length) return null;

    // Build map: agent_id → Set of namespace patterns
    const map = {};
    for (const row of data) {
      if (row.access_level === 'none') continue;
      if (!map[row.agent_id]) map[row.agent_id] = new Set();
      map[row.agent_id].add(row.namespace);
    }

    _dbPermissionsCache   = map;
    _dbPermissionsCacheTs = now;
    console.log(`[Harness:Perimeter] Loaded permissions for ${Object.keys(map).length} agents from DB`);
    return map;
  } catch (e) {
    console.warn('[Harness:Perimeter] DB load exception:', e.message);
    return null;
  }
}

/**
 * Resolve the active perimeter — DB first, then hardcoded fallback.
 */
async function _resolvePerimeter() {
  const dbPerms = await _loadDbPermissions();
  return dbPerms || FALLBACK_PERIMETER;
}

/**
 * Check whether a namespace pattern matches a requested namespace.
 * Supports '*' suffix wildcards: 'knowledge_base.*' matches 'knowledge_base.general'
 */
function _namespaceMatches(pattern, namespace) {
  if (pattern === namespace) return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return namespace === prefix || namespace.startsWith(prefix + '.');
  }
  return false;
}

/**
 * Check whether an agent is permitted to read (or write) a given namespace.
 *
 * @param {object} params
 * @param {string} params.agentId     - e.g. 'atlas', 'aether'
 * @param {string} params.namespace   - e.g. 'knowledge_base.digital_media', 'leads'
 * @param {'read'|'write'} [params.level='read']
 * @param {boolean} [params.throwOnViolation=false] - if true, throws instead of returning false
 * @returns {Promise<boolean>}
 * @throws {Error} if throwOnViolation is true and permission is denied
 */
export async function checkPermission({
  agentId,
  namespace,
  level = 'read',
  throwOnViolation = false,
}) {
  const perimeter = await _resolvePerimeter();
  const allowed   = perimeter[agentId];

  // No entry for this agent → deny by default
  if (!allowed) {
    if (throwOnViolation) {
      throw new Error(
        `[Harness:Perimeter] DENIED — agent "${agentId}" has no permissions defined. ` +
        `Requested: ${level} on "${namespace}".`
      );
    }
    console.warn(`[Harness:Perimeter] DENIED — agent "${agentId}" has no permissions. Requested: ${level} on "${namespace}".`);
    return false;
  }

  // Check each allowed pattern
  for (const pattern of allowed) {
    if (_namespaceMatches(pattern, namespace)) {
      return true;
    }
  }

  // Denied
  if (throwOnViolation) {
    throw new Error(
      `[Harness:Perimeter] DENIED — agent "${agentId}" may not ${level} "${namespace}". ` +
      `Allowed namespaces: ${[...allowed].join(', ')}.`
    );
  }
  console.warn(`[Harness:Perimeter] DENIED — agent "${agentId}" may not ${level} "${namespace}". Allowed: ${[...allowed].join(', ')}`);
  return false;
}

/**
 * Validate that an agent is allowed to access ALL requested namespaces.
 * Returns a filtered list of allowed namespaces + a violation report.
 *
 * This is the primary API for queryKnowledge() — call it before any
 * knowledge_base SELECT, and only query the namespaces that pass.
 *
 * @param {object} params
 * @param {string} params.agentId
 * @param {string[]} params.namespaces
 * @returns {Promise<{ allowed: string[], denied: string[], violations: Array }>}
 */
export async function filterNamespaces({ agentId, namespaces = [] }) {
  if (!namespaces.length) return { allowed: [], denied: [], violations: [] };

  const allowed    = [];
  const denied     = [];
  const violations = [];

  for (const ns of namespaces) {
    const ok = await checkPermission({ agentId, namespace: ns });
    if (ok) {
      allowed.push(ns);
    } else {
      denied.push(ns);
      violations.push({ agentId, namespace: ns, reason: 'not in perimeter' });
    }
  }

  if (denied.length > 0) {
    console.log(`[Harness:Perimeter] ${agentId}: ${allowed.length} namespaces allowed, ${denied.length} denied (${denied.join(', ')})`);
  }

  return { allowed, denied, violations };
}

/**
 * Get all namespaces an agent is permitted to access.
 */
export async function getAllowedNamespaces(agentId) {
  const perimeter = await _resolvePerimeter();
  return perimeter[agentId] ? [...perimeter[agentId]] : [];
}

/**
 * Get the full perimeter map (for debugging/dashboard).
 */
export async function getPerimeterMap() {
  return _resolvePerimeter();
}

/**
 * Invalidate the in-memory permissions cache.
 * Call this after updating agent_permissions rows.
 */
export function invalidatePermissionCache() {
  _dbPermissionsCache   = null;
  _dbPermissionsCacheTs = 0;
  console.log('[Harness:Perimeter] Cache invalidated');
}

/**
 * Check whether two agents share any namespace.
 * Used to verify decorrelation — agents with disjoint namespaces
 * should have decorrelated failure modes.
 */
export async function agentsShareNamespace(agentIdA, agentIdB) {
  const perimeter = await _resolvePerimeter();
  const setA = perimeter[agentIdA];
  const setB = perimeter[agentIdB];
  if (!setA || !setB) return false;

  for (const patternA of setA) {
    for (const patternB of setB) {
      // Check if any concrete namespace could match both patterns
      // Simplest check: if one is a prefix of the other
      const baseA = patternA.replace(/\.\*$/, '');
      const baseB = patternB.replace(/\.\*$/, '');
      if (baseA === baseB) return true;
      if (baseA.startsWith(baseB + '.') || baseB.startsWith(baseA + '.')) return true;
    }
  }
  return false;
}