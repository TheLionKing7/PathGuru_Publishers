/**
 * Utilization tracking — Boss + delivery capacity
 */

import { getSupabase, supabaseWrite } from '../supabaseClient.js';
import { getEngagementOpsSummary } from './engagementDelivery.js';

const CAPACITY_BOSS_HOURS = Number(process.env.BOSS_WEEKLY_CAPACITY_HOURS || 40);
const ALERT_THRESHOLD = Number(process.env.UTILIZATION_ALERT_PCT || 85);

export async function computeCurrentUtilization() {
  const db = getSupabase();
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  let bossHoursUsed = 0;
  let activeTasks = 0;
  let deliveryScheduled = 0;

  if (db) {
    const { data: econ } = await db.from('engagement_economics')
      .select('boss_hours')
      .gte('updated_at', weekStart.toISOString());
    bossHoursUsed = (econ || []).reduce((s, r) => s + Number(r.boss_hours || 0), 0);

    const { count } = await db.from('tasks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'running']);
    activeTasks = count ?? 0;

    const { data: milestones } = await db.from('engagement_milestones')
      .select('id')
      .in('status', ['pending', 'in_progress', 'overdue'])
      .gte('due_at', weekStart.toISOString())
      .lte('due_at', weekEnd.toISOString());
    deliveryScheduled = (milestones || []).length * 4;
  }

  const bossCapacity = CAPACITY_BOSS_HOURS;
  const deliveryCapacity = bossCapacity * 1.5;
  const used = bossHoursUsed + deliveryScheduled;
  const capacity = bossCapacity + deliveryCapacity;
  const utilizationPct = capacity > 0 ? Math.round((used / capacity) * 1000) / 10 : 0;

  const engagementOps = await getEngagementOpsSummary().catch(() => ({}));

  return {
    periodStart: weekStart.toISOString().slice(0, 10),
    periodEnd: weekEnd.toISOString().slice(0, 10),
    bossHoursUsed,
    bossHoursCapacity: bossCapacity,
    deliveryHoursScheduled: deliveryScheduled,
    activeTasks,
    utilizationPct,
    alert: utilizationPct >= ALERT_THRESHOLD,
    alertMessage: utilizationPct >= ALERT_THRESHOLD
      ? `Utilization ${utilizationPct}% — consider pausing new intake`
      : null,
    engagementOps,
  };
}

export async function snapshotUtilization() {
  const u = await computeCurrentUtilization();
  const db = getSupabase();
  if (db) {
    await supabaseWrite(db.from('utilization_logs').insert({
      period_start: u.periodStart,
      period_end: u.periodEnd,
      boss_hours_used: u.bossHoursUsed,
      boss_hours_capacity: u.bossHoursCapacity,
      delivery_hours_scheduled: u.deliveryHoursScheduled,
      active_tasks: u.activeTasks,
      utilization_pct: u.utilizationPct,
    }), 'utilization log');
  }
  return u;
}

export async function logBossHours(engagementId, hours, notes = '') {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const { data: existing } = await db.from('engagement_economics').select('*').eq('engagement_id', engagementId).limit(1);
  const row = existing?.[0] || { engagement_id: engagementId, boss_rate: 250 };
  const newHours = Number(row.boss_hours || 0) + Number(hours);

  const { updateEngagementEconomics } = await import('./partnerEconomics.js');
  return updateEngagementEconomics(engagementId, {
    boss_hours: newHours,
    notes: notes || row.notes,
  });
}
