/**
 * Lead Magnet → Email Capture → Nurture → Attribution
 * Wired to C2C growth engine and DigiFusion site forms.
 */

import { getSupabase, supabaseWrite } from '../supabaseClient.js';
import { sendEmail } from './emailer.js';

const DEFAULT_SEQUENCE_SLUG = 'c2c-welcome-5';

function slugify(text = '') {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || `magnet-${Date.now().toString(36)}`;
}

function defaultNurtureEmails(magnetTitle) {
  const t = magnetTitle || 'your playbook';
  return [
    { step: 1, delayDays: 0,  subject: `Your ${t} is ready`, preview: 'Download link inside' },
    { step: 2, delayDays: 2,  subject: 'The one mistake African operators make with AI', preview: 'THINK-stage insight' },
    { step: 3, delayDays: 5,  subject: 'Case pattern: authority before conversion', preview: 'From our C2C playbook' },
    { step: 4, delayDays: 9,  subject: 'Ready for a strategy session?', preview: 'Book a free 45-min session' },
    { step: 5, delayDays: 14, subject: 'Last call — strategy session slots', preview: 'We hold 3 slots per week' },
  ];
}

async function logAttribution(eventType, fields = {}) {
  const db = getSupabase();
  if (!db) return;
  await supabaseWrite(db.from('content_attribution_events').insert({
    event_type:       eventType,
    content_slug:     fields.contentSlug || null,
    lead_magnet_slug: fields.magnetSlug || null,
    email:            fields.email || null,
    lead_id:          fields.leadId || null,
    metadata:         fields.metadata || {},
  }), 'funnel attribution');
}

/**
 * Create or update a lead magnet (+ default nurture sequence).
 */
export async function createLeadMagnet(input = {}) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const slug = input.slug || slugify(input.title);
  const row = {
    slug,
    title:         input.title || 'DigiFusion Playbook',
    description:   input.description || '',
    format:        input.format || 'pdf',
    download_url:  input.downloadUrl || input.download_url || null,
    cta_copy:      input.ctaCopy || input.cta_copy || 'Download the free guide',
    pillar_plan_id: input.pillarPlanId || input.planId || null,
    blog_slug:     input.blogSlug || null,
    seo_keyword:   input.seoKeyword || input.title,
    stdc_stage:    input.stdcStage || 'think',
    status:        input.status || 'active',
    updated_at:    new Date().toISOString(),
  };

  const { data: magnet, error } = await db.from('lead_magnets')
    .upsert(row, { onConflict: 'slug' })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const seqSlug = `${slug}-nurture`;
  const steps = input.nurtureEmails || defaultNurtureEmails(magnet.title);
  const emails = await Promise.all(steps.map(async (step, i) => {
    const body = await buildNurtureEmailBody(step, magnet, i);
    return { ...step, ...body };
  }));

  await db.from('nurture_sequences').upsert({
    slug:           seqSlug,
    name:           `${magnet.title} nurture`,
    lead_magnet_id: magnet.id,
    emails,
    status:         'active',
  }, { onConflict: 'slug' });

  return { magnet, nurtureSequenceSlug: seqSlug, emailSteps: emails.length };
}

export async function listLeadMagnets() {
  const db = getSupabase();
  if (!db) return { magnets: [] };
  const { data } = await db.from('lead_magnets').select('*').order('created_at', { ascending: false }).limit(50);
  return { magnets: data || [] };
}

/**
 * Public capture endpoint — called from digitafusion.com lead magnet forms.
 */
export async function captureLeadMagnet(body = {}) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase not configured');

  const email = (body.email || '').toLowerCase().trim();
  if (!email || !email.includes('@')) throw new Error('Valid email required');

  const magnetSlug = body.magnetSlug || body.slug || body.leadMagnet;
  if (!magnetSlug) throw new Error('magnetSlug required');

  const { data: magnet } = await db.from('lead_magnets').select('*').eq('slug', magnetSlug).eq('status', 'active').single();
  if (!magnet) throw new Error(`Lead magnet not found: ${magnetSlug}`);

  const name = body.name || null;
  const contentSlug = body.contentSlug || body.blogSlug || magnet.blog_slug || null;

  // Upsert newsletter subscriber
  await db.from('newsletter_subscribers').upsert({
    email, name, source: `lead_magnet:${magnetSlug}`, status: 'active',
  }, { onConflict: 'email' });

  // Upsert lead record for Assistant / Nexus pipeline
  let leadId = null;
  const { data: leadRows } = await db.from('leads').select('id').eq('email', email).limit(1);
  const existingLead = leadRows?.[0];
  if (existingLead?.id) {
    leadId = existingLead.id;
    await db.from('leads').update({
      name: name || undefined,
      source_url: contentSlug ? `/blog/${contentSlug}` : `/lead-magnet/${magnetSlug}`,
      status: 'qualified',
      score: 3,
      updated_at: new Date().toISOString(),
    }).eq('id', leadId);
  } else {
    const { data: newLead } = await db.from('leads').insert({
      name, email,
      challenge: `Downloaded lead magnet: ${magnet.title}`,
      status: 'qualified',
      score: 3,
      source_url: contentSlug ? `/blog/${contentSlug}` : `/lead-magnet/${magnetSlug}`,
    }).select('id').single();
    leadId = newLead?.id || null;
  }

  const { data: capture, error: capErr } = await db.from('lead_magnet_captures').insert({
    lead_magnet_id: magnet.id,
    magnet_slug:    magnetSlug,
    email,
    name,
    content_slug:   contentSlug,
    utm_source:     body.utmSource || body.utm_source || null,
    utm_medium:     body.utmMedium || body.utm_medium || null,
    utm_campaign:   body.utmCampaign || body.utm_campaign || null,
    referrer:       body.referrer || null,
    landing_path:   body.landingPath || body.path || null,
    lead_id:        leadId,
  }).select().single();
  if (capErr) throw new Error(capErr.message);

  await db.from('lead_magnets').update({ capture_count: (magnet.capture_count || 0) + 1 }).eq('id', magnet.id);

  await logAttribution('magnet_capture', {
    magnetSlug, email, leadId, contentSlug,
    metadata: { utm_source: body.utmSource, utm_campaign: body.utmCampaign },
  });

  const welcome = await sendWelcomeEmail(magnet, capture, email, name);
  const enrolled = await enrollInNurture(magnet, capture, email, name);

  await db.from('lead_magnet_captures').update({
    welcome_sent: welcome.sent,
    nurture_enrolled: enrolled,
  }).eq('id', capture.id);

  return {
    ok: true,
    captureId: capture.id,
    downloadUrl: magnet.download_url,
    welcomeSent: welcome.sent,
    nurtureEnrolled: enrolled,
  };
}

async function sendWelcomeEmail(magnet, capture, email, name) {
  const downloadUrl = magnet.download_url
    || `${(process.env.DIGIFUSION_API_URL || 'https://www.digitafusion.com').replace(/\/$/, '')}/resources/${magnet.slug}`;
  const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hi there,';
  const html = `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a202c;">
  <p>${greeting}</p>
  <p>Here is <strong>${magnet.title}</strong> — the guide you requested.</p>
  <p style="text-align:center;margin:28px 0;">
    <a href="${downloadUrl}" style="background:#C9A84C;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">${magnet.cta_copy || 'Download now'}</a>
  </p>
  <p style="font-size:14px;color:#718096;">Over the next two weeks you'll receive a short nurture series with practical C2C insights. Reply anytime if you want a strategy session.</p>
</div>`;
  const text = `${greeting}\n\n${magnet.title}: ${downloadUrl}\n\nYou'll receive a short nurture series over the next two weeks.`;

  const result = await sendEmail({
    to: email,
    subject: `Your ${magnet.title}`,
    html,
    text,
  });
  return { sent: !!result.sent, id: result.id };
}

async function enrollInNurture(magnet, capture, email, name) {
  const db = getSupabase();
  if (!db) return false;

  const seqSlug = `${magnet.slug}-nurture`;
  const { data: seq } = await db.from('nurture_sequences').select('*').eq('slug', seqSlug).single();
  if (!seq) return false;

  const emails = Array.isArray(seq.emails) ? seq.emails : [];
  const first = emails.find(e => e.step === 1) || emails[0];
  const delayDays = first?.delayDays ?? 0;
  const nextSend = new Date();
  nextSend.setDate(nextSend.getDate() + delayDays);

  const step2 = emails.find(e => e.step === 2) || emails[1];
  const step2Delay = step2?.delayDays ?? 2;
  const nextNurture = addDays(new Date(), step2Delay);

  const { error } = await db.from('nurture_enrollments').upsert({
    sequence_id:  seq.id,
    email,
    name,
    capture_id:   capture.id,
    current_step: 1,
    next_send_at: nextNurture.toISOString(),
    status:       'active',
  }, { onConflict: 'sequence_id,email' });

  return !error;
}

async function buildNurtureEmailBody(step, magnet, index) {
  const bookingUrl = (process.env.DIGIFUSION_BOOKING_URL || 'https://www.digitafusion.com/agency/booking').replace(/\/$/, '');
  const downloadUrl = magnet.download_url || '#';

  const templates = [
    { html: `<p>Your <strong>${magnet.title}</strong> is attached below.</p><p><a href="${downloadUrl}">Download again</a></p>`, plain: `Download: ${downloadUrl}` },
    { html: `<p>Most African operators treat AI as a tool purchase. C2C treats it as an <em>operating model</em> shift — THINK before DO.</p>`, plain: 'THINK before DO — authority compounds.' },
    { html: `<p>Authority content (pillar + clusters) should drive one lead magnet and one booking CTA — not ten scattered offers.</p>`, plain: 'One magnet, one CTA.' },
    { html: `<p>If this resonates, book a free 45-minute strategy session: <a href="${bookingUrl}">${bookingUrl}</a></p>`, plain: `Book: ${bookingUrl}` },
    { html: `<p>We hold a limited number of strategy sessions each week. <a href="${bookingUrl}">Reserve your slot</a> before this cohort closes.</p>`, plain: `Last call: ${bookingUrl}` },
  ];

  const tpl = templates[index] || templates[0];
  return {
    subject: step.subject || `DigiFusion insight #${step.step}`,
    html:    step.html || tpl.html,
    plain:   step.plain || tpl.plain,
  };
}

/**
 * Cron: send due nurture emails (skip step 1 — welcome already sent on capture).
 */
export async function processNurtureQueue() {
  const db = getSupabase();
  if (!db) return { sent: 0, skipped: true };

  const now = new Date().toISOString();
  const { data: due } = await db.from('nurture_enrollments')
    .select('*, nurture_sequences(*)')
    .eq('status', 'active')
    .lte('next_send_at', now)
    .limit(50);

  let sent = 0;
  let failed = 0;

  for (const row of due || []) {
    const seq = row.nurture_sequences;
    const emails = (Array.isArray(seq?.emails) ? seq.emails : []).filter(e => e.step > 1);
    const nextStepNum = (row.current_step || 1) + 1;
    const stepDef = emails.find(e => e.step === nextStepNum);

    if (!stepDef) {
      await db.from('nurture_enrollments').update({ status: 'completed', updated_at: now }).eq('id', row.id);
      continue;
    }

    const result = await sendEmail({
      to:      row.email,
      subject: stepDef.subject,
      html:    stepDef.html,
      text:    stepDef.plain,
    });

    if (result.sent) {
      sent++;
      const following = emails.find(e => e.step === nextStepNum + 1);
      const updates = {
        current_step: nextStepNum,
        last_sent_at: now,
        updated_at:   now,
        status:       following ? 'active' : 'completed',
        next_send_at: following
          ? addDays(new Date(), Math.max(1, (following.delayDays || 3) - (stepDef.delayDays || 0))).toISOString()
          : null,
      };
      await db.from('nurture_enrollments').update(updates).eq('id', row.id);

      await logAttribution('nurture_sent', {
        email: row.email,
        metadata: { step: nextStepNum, sequence: seq.slug, subject: stepDef.subject },
      });
    } else {
      failed++;
    }
  }

  return { sent, failed, processed: (due || []).length };
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Auto-create lead magnet from C2C pillar plan.
 */
export async function createLeadMagnetFromPlan(plan) {
  if (!plan?.leadMagnet?.title) return null;
  const slug = slugify(plan.leadMagnet.title);
  return createLeadMagnet({
    slug,
    title:       plan.leadMagnet.title,
    format:      plan.leadMagnet.format || 'checklist',
    ctaCopy:     plan.leadMagnet.ctaCopy,
    pillarPlanId: plan.id,
    seoKeyword:  plan.pillar?.seoKeyword,
    stdcStage:   plan.pillar?.stdcStage || 'think',
    description: `C2C lead magnet for pillar: ${plan.pillar?.title || plan.leadMagnet.title}`,
  });
}
