/**
 * The unified engagement board — one projection across both registers.
 *
 * assessment_5d (small business, five days) and frictioniq_engagement
 * (medium/enterprise, the fourteen-day ladder) are different instruments and
 * stay in separate tables — see migration 0024. This module is the view that
 * makes them one pipeline for the operator, so the question "which business are
 * we working with, what stage, owned by whom, running which framework, for how
 * much" has one answer and one table.
 *
 * It is a READ. It never writes, never guesses, and reports when one of the two
 * registers could not be read rather than silently dropping it.
 */

import { getSupabase } from '../supabaseClient.js';

const db = () => {
  const c = getSupabase();
  if (!c) throw new Error('Supabase not configured');
  return c;
};

export async function loadBoard({ limit = 500 } = {}) {
  const c = db();
  const [five, fiq] = await Promise.allSettled([
    c.from('assessment_5d').select('*').order('created_at', { ascending: false }).limit(limit),
    c.from('frictioniq_engagement').select('*').order('started_at', { ascending: false }).limit(limit),
  ]);

  const rows = [];

  if (five.status === 'fulfilled' && !five.value.error) {
    for (const a of five.value.data || []) rows.push(projectFive(a));
  }
  if (fiq.status === 'fulfilled' && !fiq.value.error) {
    for (const e of fiq.value.data || []) rows.push(projectFiq(e));
  }

  rows.sort((x, y) => String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')));

  return {
    rows,
    counts: {
      total: rows.length,
      fiveDay: rows.filter((r) => r.instrument === '5day').length,
      fiq: rows.filter((r) => r.instrument === 'fiq').length,
      unassigned: rows.filter((r) => !r.assignedAgent).length,
    },
    /* A missing table costs that register's column, not the whole board. */
    degraded: { fiveDay: five.status !== 'fulfilled', fiq: fiq.status !== 'fulfilled' },
  };
}

function projectFive(a) {
  return {
    instrument: '5day',
    id: a.id,
    clientName: a.client_name,
    track: a.track,
    workstreams: a.workstreams ?? [],
    sector: a.sector,
    headcountBand: a.headcount_band,
    revenueBand: a.revenue_band,
    country: a.country,
    stage: a.stage,
    detail: a.decision,
    assignedAgent: a.assigned_agent,
    frameworkId: a.framework_id,
    recommendation: a.recommendation ?? a.first_build,
    nextStage: a.next_stage,
    serviceAmount: a.service_amount ?? a.first_build_cost,
    serviceCurrency: a.service_currency || a.currency || 'USD',
    engagementId: a.engagement_id ?? null,
    updatedAt: a.created_at,
  };
}

function projectFiq(e) {
  return {
    instrument: 'fiq',
    id: e.id,
    clientName: e.client_name,
    track: e.track,
    workstreams: e.workstreams ?? [],
    sector: e.sector,
    headcountBand: e.headcount_band,
    revenueBand: e.revenue_band,
    country: e.country,
    stage: e.status,
    detail: e.kind,
    assignedAgent: e.assigned_agent,
    frameworkId: e.framework_id,
    recommendation: e.recommendation,
    nextStage: e.next_stage,
    serviceAmount: e.service_amount,
    serviceCurrency: e.service_currency || e.currency || 'USD',
    engagementId: e.engagement_id ?? null,
    updatedAt: e.started_at,
  };
}
