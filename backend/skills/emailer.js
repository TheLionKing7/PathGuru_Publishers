/**
 * DigiFusion Intelligence Network — Emailer
 * ==========================================
 * Sends transactional and newsletter emails via Resend.
 * https://resend.com — add RESEND_API_KEY to Render env vars.
 *
 * Env vars required:
 *   RESEND_API_KEY        — from resend.com dashboard
 *   EMAIL_FROM            — verified sending address e.g. "DigiFusion <hello@digifusion.com>"
 *   EMAIL_REPLY_TO        — reply-to address (optional)
 */

import { isPaused } from './systemFlags.js';

function env(k) { return (process.env[k] || '').trim(); }

const RESEND_API = 'https://api.resend.com/emails';

/**
 * Send a single email.
 * @param {{ to, subject, html, text, replyTo }} opts
 */
export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (await isPaused()) {
    console.log('[Paused] outbound email send suppressed');
    return { paused: true };
  }

  const apiKey = env('RESEND_API_KEY');
  const from   = env('EMAIL_FROM') || 'DigiFusion <hello@digifusion.com>';

  if (!apiKey) {
    console.warn('[Emailer] Skipped — RESEND_API_KEY not set.');
    return { skipped: true };
  }

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    reply_to: replyTo || env('EMAIL_REPLY_TO') || undefined,
    ...(html ? { html }  : {}),
    ...(text ? { text }  : {}),
  };

  try {
    const res = await fetch(RESEND_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(15_000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[Emailer] Resend error ${res.status}:`, JSON.stringify(data).slice(0, 200));
      return { error: `Resend ${res.status}` };
    }

    console.log(`[Emailer] Sent to ${Array.isArray(to) ? to.length + ' recipients' : to} — id: ${data.id}`);
    return { sent: true, id: data.id };
  } catch (e) {
    console.error('[Emailer] Error:', e.message);
    return { error: e.message };
  }
}

/**
 * Send a newsletter to a batch of subscribers.
 * Resend supports batch sends of up to 100 per request.
 * For large lists we chunk automatically.
 *
 * @param {{ subject, html, text, subscribers: [{email, name}] }} opts
 * @returns {{ sent, failed, batchId }}
 */
export async function sendNewsletter({ subject, html, text, subscribers }) {
  if (await isPaused()) {
    console.log('[Paused] outbound email send suppressed');
    return { paused: true };
  }

  const apiKey     = env('RESEND_API_KEY');
  const from       = env('EMAIL_FROM') || 'DigiFusion <hello@digifusion.com>';
  const unsubUrl   = env('APP_URL') ? `${env('APP_URL')}/unsubscribe` : 'https://digifusion.com/unsubscribe';

  if (!apiKey) {
    console.warn('[Emailer] Newsletter skipped — RESEND_API_KEY not set.');
    return { skipped: true };
  }
  if (!subscribers?.length) {
    console.warn('[Emailer] Newsletter skipped — no subscribers.');
    return { sent: 0, failed: 0 };
  }

  // Append unsubscribe footer to HTML
  const footerHtml = `
<div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#718096;text-align:center;">
  You're receiving this because you subscribed to DigiFusion insights.<br/>
  <a href="${unsubUrl}?email={{email}}" style="color:#C9A84C;">Unsubscribe</a>
</div>`;
  const footerText = `\n\n---\nYou're receiving this because you subscribed to DigiFusion insights.\nUnsubscribe: ${unsubUrl}`;

  const CHUNK = 100;
  let sent = 0, failed = 0;
  const batchIds = [];

  for (let i = 0; i < subscribers.length; i += CHUNK) {
    const chunk = subscribers.slice(i, i + CHUNK);
    const batch = chunk.map(sub => ({
      from,
      to:      [sub.email],
      subject,
      ...(html ? { html: html + footerHtml.replace('{{email}}', encodeURIComponent(sub.email)) } : {}),
      ...(text ? { text: text + footerText } : {}),
    }));

    try {
      const res  = await fetch('https://api.resend.com/emails/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body:    JSON.stringify(batch),
        signal:  AbortSignal.timeout(30_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(`[Emailer] Batch error ${res.status}:`, JSON.stringify(data).slice(0, 200));
        failed += chunk.length;
      } else {
        sent += chunk.length;
        if (data.data?.[0]?.id) batchIds.push(data.data[0].id);
        console.log(`[Emailer] Batch sent ${chunk.length} emails (chunk ${Math.floor(i / CHUNK) + 1})`);
      }
    } catch (e) {
      console.error('[Emailer] Batch error:', e.message);
      failed += chunk.length;
    }
  }

  return { sent, failed, batchId: batchIds[0] || null };
}
