/**
 * Enterprise engagement creation — the operational home.
 *
 * DigiFusion is the storefront; this is where an enterprise engagement
 * (frictioniq_engagement) is actually created, routed, and optionally promoted
 * to the delivery OS. The DigiFusion `/fiq/e` form has been retired.
 */

import { getSupabase } from '../supabaseClient.js';
import { routeEngagement } from './engagementRouting.js';
import { promoteToDelivery } from './promoteToDelivery.js';

const db = () => {
  const c = getSupabase();
  if (!c) throw new Error('Supabase not configured');
  return c;
};

const KINDS = new Set(['investigation', 'audit-14d', 'build', 'retainer']);
const TRACKS = new Set(['ai-automation', 'business-development', 'digital-media']);

/** The next rung up the FrictionIQ ladder, or null at the top. */
function nextRung(kind) {
  const RUNGS = ['investigation', 'audit-14d', 'build', 'retainer'];
  const i = RUNGS.indexOf(kind);
  return i >= 0 && i < RUNGS.length - 1 ? RUNGS[i + 1] : null;
}

export async function createEnterpriseEngagement(input = {}) {
  const c = db();
  const name = String(input.client_name || '').trim();
  if (!name) throw new Error('a client name is required');

  const track = TRACKS.has(input.track) ? input.track : null;
  const kind = KINDS.has(input.kind) ? input.kind : 'audit-14d';

  /* Route by service line unless the operator pinned the owner. */
  const route = track
    ? routeEngagement({ track, segment: input.segment || 'enterprise', sector: input.sector, headcountBand: input.headcount_band })
    : { assigned_agent: null, framework_id: null };

  const { data, error } = await c.from('frictioniq_engagement')
    .insert({
      client_name: name.slice(0, 200),
      sector: input.sector || null,
      headcount_band: input.headcount_band || null,
      revenue_band: input.revenue_band || null,
      country: input.country || null,
      currency: input.currency || 'USD',
      session_token: input.session_token || null,
      gate_token: input.gate_token || null,
      scope_note: input.scope_note || null,
      kind,
      track,
      status: 'scoping',
      created_by: input.created_by || 'pathguru',
      assigned_agent: input.assigned_agent || route.assigned_agent || null,
      framework_id: input.framework_id || route.framework_id || null,
      recommendation: input.recommendation || null,
      next_stage: input.next_stage || nextRung(kind),
      service_amount: input.service_amount ?? null,
      service_currency: input.service_currency || 'USD',
    })
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  const id = data?.id ?? null;
  if (!id) return null;

  /* Optional: promote straight into the delivery OS — the amount becomes a
     contract_value on public.engagements and the register is linked back. */
  if (input.promote) {
    try {
      const promoted = await promoteToDelivery('frictioniq_engagement', {
        id,
        client_name: name,
        service_amount: input.service_amount ?? null,
        service_currency: input.service_currency || 'USD',
        sector: input.sector,
        headcount_band: input.headcount_band,
      }, { track, segment: 'enterprise' });
      if (promoted?.engagement_id) {
        await c.from('frictioniq_engagement').update({ engagement_id: promoted.engagement_id }).eq('id', id);
      }
    } catch (e) {
      console.warn('[EnterpriseEngagement] promote failed — amount stays a note:', e.message);
    }
  }

  return { id };
}
