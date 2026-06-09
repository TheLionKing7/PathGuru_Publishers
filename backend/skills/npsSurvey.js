/**
 * NPS — post-engagement surveys → Pulse / segment scores
 */

import { getSupabase } from '../supabaseClient.js';
import { sendEmail } from './emailer.js';
import { logTimelineEvent } from './engagementDelivery.js';

const NPS_QUESTION = 'How likely are you to recommend DigiFusion to a colleague? (0–10)';

export async function queueNpsSurvey(engagementId, email, accountId = null) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const { data, error } = await db.from('nps_surveys').insert({
    engagement_id: engagementId,
    account_id: accountId,
    email: email.toLowerCase(),
    status: 'pending',
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function sendNpsSurvey(surveyId) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const { data: survey } = await db.from('nps_surveys').select('*, engagements(client_name)').eq('id', surveyId).single();
  if (!survey) throw new Error('Survey not found');

  const base = (process.env.PATHGURU_PUBLIC_URL || 'https://pathguru-publishers.onrender.com').replace(/\/$/, '');
  const respondUrl = `${base}/api/nps/respond?id=${surveyId}&score=`;

  const html = `
<div style="font-family:Georgia,serif;max-width:520px">
  <p>Hi,</p>
  <p>Your engagement with DigiFusion (${survey.engagements?.client_name || 'recent project'}) has wrapped. We'd value 30 seconds of feedback.</p>
  <p><strong>${NPS_QUESTION}</strong></p>
  <p>${[0,1,2,3,4,5,6,7,8,9,10].map(n => `<a href="${respondUrl}${n}" style="margin:4px;padding:8px 12px;background:#1a365d;color:#fff;text-decoration:none;border-radius:4px">${n}</a>`).join(' ')}</p>
</div>`;

  const result = await sendEmail({
    to: survey.email,
    subject: 'Quick feedback — DigiFusion',
    html,
    text: `${NPS_QUESTION} Reply with 0-10 or visit: ${respondUrl}7`,
  });

  await db.from('nps_surveys').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', surveyId);
  return { sent: !!result.sent, surveyId };
}

export async function recordNpsResponse(surveyId, score, comment = '') {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const s = Number(score);
  if (s < 0 || s > 10) throw new Error('Score must be 0–10');

  const { data: survey, error } = await db.from('nps_surveys')
    .update({ score: s, comment, status: 'responded', responded_at: new Date().toISOString() })
    .eq('id', surveyId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logTimelineEvent({
    accountId: survey.account_id,
    engagementId: survey.engagement_id,
    eventType: 'nps',
    email: survey.email,
    payload: { score: s },
  });

  await refreshNpsAggregates().catch(() => {});
  return survey;
}

export async function refreshNpsAggregates() {
  const db = getSupabase();
  if (!db) return;

  const since = new Date();
  since.setDate(since.getDate() - 90);

  const { data: responses } = await db.from('nps_surveys')
    .select('score, engagements(client_accounts(segment))')
    .eq('status', 'responded')
    .gte('responded_at', since.toISOString());

  const bySeg = {};
  for (const r of responses || []) {
    const seg = r.engagements?.client_accounts?.segment || 'sme';
    if (!bySeg[seg]) bySeg[seg] = [];
    bySeg[seg].push(r.score);
  }

  for (const [segment, scores] of Object.entries(bySeg)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const promoters = scores.filter(s => s >= 9).length / scores.length * 100;
    await db.from('client_segment_scores').upsert({
      segment,
      avg_nps: Math.round(avg * 10) / 10,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'segment' });
  }
}

export async function processDueNpsSurveys() {
  const db = getSupabase();
  if (!db) return { queued: 0, sent: 0 };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  const { data: completed } = await db.from('engagements')
    .select('id, account_id, client_name, updated_at')
    .eq('status', 'completed')
    .lte('updated_at', cutoff.toISOString())
    .limit(20);

  let queued = 0;
  let sent = 0;

  for (const eng of completed || []) {
    const { data: existing } = await db.from('nps_surveys').select('id').eq('engagement_id', eng.id).limit(1);
    if (existing?.length) continue;

    const { data: account } = eng.account_id
      ? await db.from('client_accounts').select('primary_email').eq('id', eng.account_id).single()
      : { data: null };

    const email = account?.primary_email;
    if (!email) continue;

    const survey = await queueNpsSurvey(eng.id, email, eng.account_id);
    queued++;
    const r = await sendNpsSurvey(survey.id).catch(() => ({ sent: false }));
    if (r.sent) sent++;
  }

  return { queued, sent };
}

export async function getNpsDashboard() {
  const db = getSupabase();
  if (!db) return { rolling90d: null, recent: [] };

  const since = new Date();
  since.setDate(since.getDate() - 90);

  const { data: responses } = await db.from('nps_surveys')
    .select('score, comment, responded_at, email, engagements(client_name)')
    .eq('status', 'responded')
    .gte('responded_at', since.toISOString())
    .order('responded_at', { ascending: false });

  const scores = (responses || []).map(r => r.score);
  const nps = scores.length
    ? Math.round(((scores.filter(s => s >= 9).length - scores.filter(s => s <= 6).length) / scores.length) * 100)
    : null;

  return {
    rolling90d: nps,
    responseCount: scores.length,
    recent: (responses || []).slice(0, 10),
  };
}
