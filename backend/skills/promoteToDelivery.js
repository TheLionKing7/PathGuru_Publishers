/**
 * Promote a concluded register row into the delivery OS.
 *
 * This is the step that turns `service_amount` from a note into real money: it
 * creates one `client_accounts` row and one `engagements` row whose
 * `contract_value` is the quoted amount, and returns the ids so the caller can
 * stamp `engagement_id` back onto the register.
 *
 * Called from the five-day `proceed` path (`assessment5d.js`). The enterprise
 * register (`frictioniq_engagement`) promotes through the same function — the
 * table name is the only difference.
 */

import { getSupabase } from '../supabaseClient.js';

const db = () => {
  const c = getSupabase();
  if (!c) throw new Error('Supabase not configured');
  return c;
};

/** Hyphenated service line → PathGuru engagements.track (snake_case). */
const TRACK_TO_DELIVERY = {
  'ai-automation': 'automation',
  'business-development': 'business_development',
  'digital-media': 'digital_media',
};

/**
 * @param {'assessment_5d' | 'frictioniq_engagement'} table
 * @param {object} row  the register row (client_name, service_amount, first_build_cost, …)
 * @param {object} [opts]
 * @param {string} [opts.track]   hyphenated service line
 * @param {string} [opts.segment] 'sme' | 'enterprise'
 * @returns {Promise<{ engagement_id: string, account_id: string|null }|null>}
 */
export async function promoteToDelivery(table, row, { track = null, segment = 'sme' } = {}) {
  const c = db();
  const amount = row.service_amount ?? row.first_build_cost ?? null;
  const currency = row.service_currency || row.currency || 'USD';

  // One account per business, matched on name.
  let accountId = null;
  const { data: existing } = await c.from('client_accounts')
    .select('id').eq('name', row.client_name).maybeSingle();
  if (existing?.id) {
    accountId = existing.id;
  } else {
    const { data: created } = await c.from('client_accounts')
      .insert({ name: row.client_name, company: row.client_name, segment, primary_email: null, status: 'active' })
      .select('id').maybeSingle();
    accountId = created?.id ?? null;
  }

  // The delivery engagement — the amount is now a contract_value.
  const { data: eng } = await c.from('engagements')
    .insert({
      account_id: accountId,
      client_name: row.client_name,
      track: TRACK_TO_DELIVERY[track] || 'integrated',
      contract_value: amount,
      currency,
      fee_model: 'fixed',
      status: 'active',
      current_phase: 'build_deploy_measure',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  return eng?.id ? { engagement_id: eng.id, account_id: accountId } : null;
}
