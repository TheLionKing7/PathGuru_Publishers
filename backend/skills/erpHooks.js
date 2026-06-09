/**
 * Light ERP / invoicing hooks — QuickBooks/Xero/manual
 */

import { getSupabase } from '../supabaseClient.js';
import { logTimelineEvent } from './engagementDelivery.js';
import { updateEngagementEconomics } from './partnerEconomics.js';

export async function createInvoice({ engagementId, amount, currency = 'USD', dueAt, provider = 'manual', externalId = null }) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const { data, error } = await db.from('engagement_invoices').insert({
    engagement_id: engagementId,
    amount,
    currency,
    due_at: dueAt || new Date(Date.now() + 14 * 86400000).toISOString(),
    provider,
    external_id: externalId,
    status: 'sent',
  }).select().single();
  if (error) throw new Error(error.message);

  const { data: eng } = await db.from('engagements').select('account_id').eq('id', engagementId).single();
  await logTimelineEvent({
    accountId: eng?.account_id,
    engagementId,
    eventType: 'invoice',
    payload: { amount, invoiceId: data.id, status: 'sent' },
  });

  return data;
}

export async function markInvoicePaid(invoiceId, { paidAt, externalId } = {}) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const { data: inv, error } = await db.from('engagement_invoices')
    .update({
      status: 'paid',
      paid_at: paidAt || new Date().toISOString(),
      external_id: externalId || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (inv.engagement_id) {
    const { data: econ } = await db.from('engagement_economics').select('revenue_collected').eq('engagement_id', inv.engagement_id).limit(1);
    const collected = Number(econ?.[0]?.revenue_collected || 0) + Number(inv.amount || 0);
    await updateEngagementEconomics(inv.engagement_id, { revenue_collected: collected });

    const { data: eng } = await db.from('engagements').select('account_id').eq('id', inv.engagement_id).single();
    await logTimelineEvent({
      accountId: eng?.account_id,
      engagementId: inv.engagement_id,
      eventType: 'invoice',
      payload: { invoiceId, status: 'paid', amount: inv.amount },
    });
  }

  return inv;
}

/** Webhook payload normalizer — QuickBooks/Xero style */
export async function handleErpWebhook(body = {}) {
  const provider = body.provider || body.source || 'manual';
  const event = body.event || body.type;
  const externalId = body.invoice_id || body.id || body.external_id;
  const amount = body.amount || body.total;

  if (!externalId) return { handled: false, reason: 'no external id' };

  const db = getSupabase();
  if (!db) return { handled: false };

  const { data: inv } = await db.from('engagement_invoices').select('*').eq('external_id', String(externalId)).limit(1);
  const invoice = inv?.[0];
  if (!invoice) return { handled: false, reason: 'invoice not found' };

  if (/paid|payment|settled/i.test(event)) {
    await markInvoicePaid(invoice.id, { externalId: String(externalId) });
    return { handled: true, action: 'paid', invoiceId: invoice.id };
  }

  if (/overdue|past_due/i.test(event)) {
    await db.from('engagement_invoices').update({ status: 'overdue' }).eq('id', invoice.id);
    return { handled: true, action: 'overdue', invoiceId: invoice.id };
  }

  return { handled: false, reason: 'unknown event' };
}

export async function checkOverdueInvoices() {
  const db = getSupabase();
  if (!db) return { overdue: [] };

  const now = new Date().toISOString();
  const { data } = await db.from('engagement_invoices')
    .select('*, engagements(client_name, account_id)')
    .in('status', ['sent', 'draft'])
    .lt('due_at', now);

  const results = [];
  for (const inv of data || []) {
    await db.from('engagement_invoices').update({ status: 'overdue' }).eq('id', inv.id);
    await logTimelineEvent({
      accountId: inv.engagements?.account_id,
      engagementId: inv.engagement_id,
      eventType: 'invoice',
      payload: { invoiceId: inv.id, status: 'overdue', amount: inv.amount },
    });
    results.push({ client: inv.engagements?.client_name, amount: inv.amount, invoiceId: inv.id });
  }
  return { overdue: results };
}
