/**
 * Engagement Delivery OS — phases, milestones, deliverables, sprints, escalation
 */

import { getSupabase, supabaseWrite } from '../supabaseClient.js';

const PHASE_ORDER = [
  'discovery_audit',
  'gap_analysis',
  'solution_design',
  'build_deploy_measure',
];

const DEFAULT_MILESTONES = [
  { phase: 'discovery_audit', title: 'Diagnostic audit complete', days: 7 },
  { phase: 'gap_analysis', title: 'Gap analysis & opportunity matrix', days: 14 },
  { phase: 'solution_design', title: 'Roadmap & ROI projection signed off', days: 21 },
  { phase: 'build_deploy_measure', title: 'Solution deployed & KPI baseline', days: 45 },
];

function phaseIndex(p) {
  return PHASE_ORDER.indexOf(p) >= 0 ? PHASE_ORDER.indexOf(p) : 0;
}

export async function ensureClientAccount({ name, email, company, leadId, segment = 'sme' }) {
  const db = getSupabase();
  if (!db) return null;

  if (email) {
    const { data: existing } = await db.from('client_accounts')
      .select('*').eq('primary_email', email).limit(1);
    if (existing?.[0]) return existing[0];
  }

  const { data, error } = await db.from('client_accounts').insert({
    name: name || company || 'Client',
    company,
    primary_email: email || null,
    lead_id: leadId || null,
    segment,
  }).select().single();

  if (error) throw new Error(error.message);
  return data;
}

export async function logTimelineEvent({ accountId, engagementId, eventType, email, payload = {} }) {
  const db = getSupabase();
  if (!db) return;
  await supabaseWrite(db.from('client_timeline').insert({
    account_id: accountId,
    engagement_id: engagementId,
    event_type: eventType,
    email,
    payload,
  }), 'client timeline');
}

/**
 * Create engagement + default milestones from client blueprint.
 */
export async function createEngagementFromBlueprint(blueprint = {}) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const meta = blueprint.metadata || {};
  const eng = blueprint.engagement || blueprint.engagement_model || {};
  const clientName = meta.client_name || 'Client';
  const track = meta.track || 'integrated';
  const phase = eng.current_phase || 'discovery_audit';

  const account = await ensureClientAccount({
    name: clientName,
    company: meta.company,
    leadId: blueprint.leadId,
    segment: meta.segment || 'sme',
  });

  const start = new Date();
  const targetEnd = new Date();
  targetEnd.setDate(targetEnd.getDate() + (eng.roi_payback_days || 90));

  const { data: engagement, error } = await db.from('engagements').insert({
    account_id:     account?.id,
    client_name:    clientName,
    lead_id:        blueprint.leadId || null,
    blueprint_id:   blueprint.id,
    track,
    current_phase:  phase,
    health:         'on_track',
    fee_model:      blueprint.deal?.pricing_model || blueprint.deal_engine_output?.pricing_model || 'fixed',
    contract_value: meta.contract_value || eng.cost_of_inaction_12mo || 0,
    target_end_at:  targetEnd.toISOString(),
    metadata:       { blueprintQuality: blueprint.quality?.grade },
  }).select().single();

  if (error) throw new Error(error.message);

  const milestones = [];
  for (let i = 0; i < DEFAULT_MILESTONES.length; i++) {
    const m = DEFAULT_MILESTONES[i];
    const due = new Date(start);
    due.setDate(due.getDate() + m.days);
    const { data: ms } = await db.from('engagement_milestones').insert({
      engagement_id: engagement.id,
      phase: m.phase,
      title: m.title,
      due_at: due.toISOString(),
      status: phaseIndex(m.phase) < phaseIndex(phase) ? 'done' : (m.phase === phase ? 'in_progress' : 'pending'),
      sort_order: i,
    }).select().single();
    if (ms) milestones.push(ms);
  }

  const actionPlan = blueprint.actionPlan || blueprint.action_plan || [];
  for (const item of actionPlan.slice(0, 5)) {
    const productSlug = /procureiq/i.test(item.action || item.deliverable || '') ? 'procureiq'
      : /smartcapture/i.test(item.action || item.deliverable || '') ? 'smartcapture'
      : null;
    if (productSlug || item.deliverable) {
      await db.from('engagement_deliverables').insert({
        engagement_id: engagement.id,
        product_slug: productSlug,
        title: item.deliverable || item.action || 'Deliverable',
        status: 'planned',
      });
    }
  }

  await supabaseWrite(db.from('engagement_economics').insert({
    engagement_id: engagement.id,
    revenue_booked: engagement.contract_value || 0,
    boss_rate: Number(process.env.BOSS_HOURLY_RATE || 250),
  }), 'engagement economics');

  await logTimelineEvent({
    accountId: account?.id,
    engagementId: engagement.id,
    eventType: 'blueprint_created',
    payload: { blueprintId: blueprint.id, track },
  });

  return { engagement, account, milestones };
}

export async function listEngagements({ status, limit = 50 } = {}) {
  const db = getSupabase();
  if (!db) return { engagements: [] };
  let q = db.from('engagements').select('*, engagement_milestones(count)').order('created_at', { ascending: false }).limit(limit);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return { engagements: data || [] };
}

export async function getEngagementDetail(engagementId) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const { data: engagement } = await db.from('engagements').select('*').eq('id', engagementId).single();
  if (!engagement) throw new Error('Engagement not found');

  const [milestones, deliverables, sprints, economics] = await Promise.all([
    db.from('engagement_milestones').select('*').eq('engagement_id', engagementId).order('sort_order'),
    db.from('engagement_deliverables').select('*').eq('engagement_id', engagementId),
    db.from('engagement_sprints').select('*').eq('engagement_id', engagementId).order('sprint_number'),
    db.from('engagement_economics').select('*').eq('engagement_id', engagementId).limit(1),
  ]);

  return {
    engagement,
    milestones: milestones.data || [],
    deliverables: deliverables.data || [],
    sprints: sprints.data || [],
    economics: economics.data?.[0] || null,
  };
}

export async function signOffMilestone(milestoneId, signedOffBy = 'Boss') {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const { data: ms, error } = await db.from('engagement_milestones')
    .update({ status: 'done', signed_off_at: new Date().toISOString(), signed_off_by: signedOffBy })
    .eq('id', milestoneId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  const nextPhase = PHASE_ORDER[phaseIndex(ms.phase) + 1];
  if (nextPhase) {
    await db.from('engagements').update({ current_phase: nextPhase }).eq('id', ms.engagement_id);
    await db.from('engagement_milestones').update({ status: 'in_progress' })
      .eq('engagement_id', ms.engagement_id).eq('phase', nextPhase).eq('status', 'pending');
  } else {
    await db.from('engagements').update({ status: 'completed', health: 'on_track' }).eq('id', ms.engagement_id);
  }

  const { data: eng } = await db.from('engagements').select('account_id').eq('id', ms.engagement_id).single();
  await logTimelineEvent({
    accountId: eng?.account_id,
    engagementId: ms.engagement_id,
    eventType: 'phase_signed',
    payload: { milestoneId, phase: ms.phase },
  });

  return ms;
}

export async function updateDeliverable(deliverableId, updates = {}) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const { data, error } = await db.from('engagement_deliverables')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', deliverableId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (updates.status === 'deployed') {
    const { data: d } = await db.from('engagement_deliverables').select('engagement_id, product_slug, title').eq('id', deliverableId).single();
    const { data: eng } = await db.from('engagements').select('account_id').eq('id', d?.engagement_id).single();
    await logTimelineEvent({
      accountId: eng?.account_id,
      engagementId: d?.engagement_id,
      eventType: 'deliverable_deployed',
      payload: { productSlug: d?.product_slug, title: d?.title },
    });
  }
  return data;
}

/** Scan overdue milestones and escalate */
export async function checkEngagementDrift() {
  const db = getSupabase();
  if (!db) return { overdue: [], blocked: [] };

  const now = new Date().toISOString();
  const { data: overdue } = await db.from('engagement_milestones')
    .select('*, engagements(client_name, account_id, health)')
    .in('status', ['pending', 'in_progress'])
    .lt('due_at', now);

  const results = [];
  for (const ms of overdue || []) {
    await db.from('engagement_milestones').update({ status: 'overdue' }).eq('id', ms.id);
    await db.from('engagements').update({ health: 'at_risk' }).eq('id', ms.engagement_id).eq('health', 'on_track');
    await logTimelineEvent({
      accountId: ms.engagements?.account_id,
      engagementId: ms.engagement_id,
      eventType: 'milestone_overdue',
      payload: { title: ms.title, phase: ms.phase },
    });
    results.push({ engagementId: ms.engagement_id, client: ms.engagements?.client_name, milestone: ms.title });
  }

  const { data: blocked } = await db.from('engagements').select('id, client_name').eq('health', 'blocked');
  return { overdue: results, blocked: blocked || [], checkedAt: now };
}

export async function getEngagementOpsSummary() {
  const db = getSupabase();
  if (!db) return { active: 0, atRisk: 0, overdueMilestones: 0 };

  const [active, atRisk, overdue] = await Promise.all([
    db.from('engagements').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('engagements').select('id', { count: 'exact', head: true }).in('health', ['at_risk', 'blocked']),
    db.from('engagement_milestones').select('id', { count: 'exact', head: true }).eq('status', 'overdue'),
  ]);

  return {
    active: active.count ?? 0,
    atRisk: atRisk.count ?? 0,
    overdueMilestones: overdue.count ?? 0,
  };
}
