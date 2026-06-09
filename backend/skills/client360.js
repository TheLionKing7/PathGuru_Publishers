/**
 * Client 360 — unified account view + timeline for Nexus live context
 */

import { getSupabase } from '../supabaseClient.js';
import { getEngagementDetail } from './engagementDelivery.js';

export async function getClient360(accountId) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const { data: account } = await db.from('client_accounts').select('*').eq('id', accountId).single();
  if (!account) throw new Error('Account not found');

  const [engagements, timeline, lead, bookings] = await Promise.all([
    db.from('engagements').select('*').eq('account_id', accountId).order('created_at', { ascending: false }),
    db.from('client_timeline').select('*').eq('account_id', accountId).order('created_at', { ascending: false }).limit(25),
    account.lead_id
      ? db.from('leads').select('*').eq('id', account.lead_id).single()
      : Promise.resolve({ data: null }),
    account.primary_email
      ? db.from('service_bookings').select('*').eq('client_email', account.primary_email).order('created_at', { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  const activeEngagement = (engagements.data || []).find(e => e.status === 'active');
  let engagementDetail = null;
  if (activeEngagement) {
    try { engagementDetail = await getEngagementDetail(activeEngagement.id); } catch { /* */ }
  }

  const { data: economics } = activeEngagement
    ? await db.from('engagement_economics').select('*').eq('engagement_id', activeEngagement.id).limit(1)
    : { data: [] };

  const { data: invoices } = activeEngagement
    ? await db.from('engagement_invoices').select('*').eq('engagement_id', activeEngagement.id).order('due_at', { ascending: false }).limit(3)
    : { data: [] };

  return {
    account,
    lead: lead?.data || null,
    engagements: engagements.data || [],
    activeEngagement,
    engagementDetail,
    economics: economics?.[0] || null,
    invoices: invoices || [],
    bookings: bookings.data || [],
    timeline: timeline.data || [],
  };
}

export async function listClientAccounts({ limit = 30 } = {}) {
  const db = getSupabase();
  if (!db) return { accounts: [] };
  const { data } = await db.from('client_accounts').select('*').order('updated_at', { ascending: false }).limit(limit);
  return { accounts: data || [] };
}

/** Compact snapshot for Nexus LIVE SYSTEM STATE */
export async function buildClient360Snapshot() {
  const db = getSupabase();
  if (!db) return '';

  const { data: active } = await db.from('engagements')
    .select('id, client_name, current_phase, health, contract_value, fee_model, account_id')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(5);

  if (!active?.length) return '\nACTIVE ENGAGEMENTS: none';

  const lines = active.map(e =>
    `- ${e.client_name}: Phase ${e.current_phase} [${e.health}] ${e.fee_model || ''} $${e.contract_value || 0}`
  );

  const { data: overdueInv } = await db.from('engagement_invoices')
    .select('amount, engagements(client_name)')
    .eq('status', 'overdue')
    .limit(3);

  let invoiceLine = '';
  if (overdueInv?.length) {
    invoiceLine = `\nOVERDUE INVOICES: ${overdueInv.map(i => `${i.engagements?.client_name} $${i.amount}`).join('; ')}`;
  }

  return `\nACTIVE ENGAGEMENTS:\n${lines.join('\n')}${invoiceLine}`;
}

export async function findAccountByEmail(email) {
  const db = getSupabase();
  if (!db || !email) return null;
  const { data } = await db.from('client_accounts').select('*').eq('primary_email', email.toLowerCase()).limit(1);
  return data?.[0] || null;
}
