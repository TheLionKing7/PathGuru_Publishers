/**
 * Partner economics (solo principal) — margin, segment scale scores
 */

import { getSupabase } from '../supabaseClient.js';

export function computeMargin({ revenueCollected = 0, bossHours = 0, bossRate = 250, agentCost = 0, toolCost = 0 }) {
  const human = bossHours * bossRate;
  const cost = human + agentCost + toolCost;
  const margin = revenueCollected - cost;
  const marginPct = revenueCollected > 0 ? (margin / revenueCollected) * 100 : 0;
  return { margin: Math.round(margin * 100) / 100, marginPct: Math.round(marginPct * 10) / 10, cost, human };
}

export async function updateEngagementEconomics(engagementId, fields = {}) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const { data: existing } = await db.from('engagement_economics').select('*').eq('engagement_id', engagementId).limit(1);
  const row = existing?.[0] || { engagement_id: engagementId, boss_rate: Number(process.env.BOSS_HOURLY_RATE || 250) };

  const merged = {
    ...row,
    ...fields,
    updated_at: new Date().toISOString(),
  };

  const { margin, marginPct } = computeMargin({
    revenueCollected: merged.revenue_collected ?? merged.revenue_booked ?? 0,
    bossHours: merged.boss_hours || 0,
    bossRate: merged.boss_rate || 250,
    agentCost: merged.agent_cost_est || 0,
    toolCost: merged.tool_cost || 0,
  });
  merged.margin_pct = marginPct;

  const { data, error } = await db.from('engagement_economics')
    .upsert(merged, { onConflict: 'engagement_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await refreshSegmentScores().catch(() => {});
  return { economics: data, margin, marginPct };
}

export async function refreshSegmentScores() {
  const db = getSupabase();
  if (!db) return;

  const { data: engagements } = await db.from('engagements')
    .select('id, contract_value, metadata, account_id')
    .eq('status', 'active');

  const accountSegments = {};
  const accountIds = [...new Set((engagements || []).map(e => e.account_id).filter(Boolean))];
  if (accountIds.length) {
    const { data: accounts } = await db.from('client_accounts').select('id, segment').in('id', accountIds);
    for (const a of accounts || []) accountSegments[a.id] = a.segment;
  }

  const bySegment = {};
  for (const e of engagements || []) {
    const seg = accountSegments[e.account_id] || e.metadata?.segment || 'sme';
    if (!bySegment[seg]) bySegment[seg] = { margins: [], count: 0 };
    bySegment[seg].count++;
  }

  const { data: econRows } = await db.from('engagement_economics').select('engagement_id, margin_pct');
  const marginMap = Object.fromEntries((econRows || []).map(r => [r.engagement_id, r.margin_pct]));

  for (const e of engagements || []) {
    const seg = accountSegments[e.account_id] || 'sme';
    const m = marginMap[e.id];
    if (m != null) bySegment[seg]?.margins.push(m);
  }

  for (const [segment, stats] of Object.entries(bySegment)) {
    const avgMargin = stats.margins.length
      ? stats.margins.reduce((a, b) => a + b, 0) / stats.margins.length
      : 0;
    const scaleScore = Math.round((avgMargin * 0.6 + stats.count * 5) * 10) / 10;

    await db.from('client_segment_scores').upsert({
      segment,
      avg_margin: avgMargin,
      engagement_count: stats.count,
      scale_score: scaleScore,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'segment' });
  }
}

export async function getEconomicsDashboard() {
  const db = getSupabase();
  if (!db) return { engagements: [], segments: [], totals: {} };

  const { data: rows } = await db.from('engagement_economics')
    .select('*, engagements(id, client_name, status, track, contract_value, fee_model)')
    .order('updated_at', { ascending: false })
    .limit(30);

  const { data: segments } = await db.from('client_segment_scores').select('*').order('scale_score', { ascending: false });

  const engagements = (rows || []).map(r => ({
    engagementId: r.engagement_id,
    client: r.engagements?.client_name,
    track: r.engagements?.track,
    revenueBooked: r.revenue_booked,
    revenueCollected: r.revenue_collected,
    marginPct: r.margin_pct,
    bossHours: r.boss_hours,
    feeModel: r.engagements?.fee_model,
  }));

  const totals = {
    revenueBooked: engagements.reduce((s, e) => s + Number(e.revenueBooked || 0), 0),
    revenueCollected: engagements.reduce((s, e) => s + Number(e.revenueCollected || 0), 0),
    avgMargin: engagements.length
      ? engagements.reduce((s, e) => s + Number(e.marginPct || 0), 0) / engagements.length
      : 0,
  };

  const topByMargin = [...engagements].sort((a, b) => (b.marginPct || 0) - (a.marginPct || 0)).slice(0, 5);
  const scaleRecommendation = segments?.[0]?.segment || 'sme';

  return { engagements, segments: segments || [], totals, topByMargin, scaleRecommendation };
}
