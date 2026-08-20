/**
 * DigiFusion Intelligence Network — Content Commission
 * =====================================================
 * Tracks one human-commissioned piece of content through its stage lifecycle
 * in public.content_commission. Every transition is written to the table AND
 * mirrored into the Slack thread named by slack_channel / slack_thread_ts, so
 * that thread is the human-readable log of the commission.
 */

import { getSupabase } from '../supabaseClient.js';
import { postSlackMessage } from './slackNotify.js';
import { callAiProvider, resolveProvider } from '../aiProviders.js';

/** Must stay in sync with the check constraint in 0038_content_commission.sql. */
export const CONTENT_COMMISSION_STATUSES = [
  'intake', 'assessing', 'angle_review', 'researching', 'research_review',
  'synthesising', 'drafting', 'draft_review', 'publishing', 'published', 'abandoned',
];

const TERMINAL_STATUSES = new Set(['published', 'abandoned']);

/** The thesis every assessment is measured against (edit as the firm evolves). */
export const FIRM_THESIS = 'DigiFusion helps African SMEs and enterprises adopt AI and automation to remove operational friction, speed time-to-market, and compound growth — every engagement grounded in the firm\'s own frameworks (AVE, Deal Engine, C2C, Engagement Model) rather than third-party methodology.';

/** Pull the first URL out of free text, including Slack's `<url|label>` form. */
export function extractUrlFromText(text) {
  const s = String(text || '');
  const slack = s.match(/<((?:https?|mailto):[^>|]+)(?:\|[^>]*)?>/);
  if (slack) return slack[1].trim();
  const bare = s.match(/(?:https?:\/\/|www\.)[^\s<>]+/);
  if (!bare) return null;
  return bare[0].replace(/[.,;:!?)\]]+$/, '');
}

/** Split free text into { url, note } — the url (if any) and the rest as the note. */
export function parseCommissionText(text) {
  const s = String(text || '').trim();
  const url = extractUrlFromText(s);
  if (!url) return { url: null, note: s || null };
  let note = s.replace(/<[^>]+>/g, (m) => (m.includes(url) ? '' : m));
  note = note.replace(url, '').replace(/\s+/g, ' ').trim();
  return { url, note: note || null };
}

/** Open a commission at `intake` and mirror the intake to its Slack thread. */
export async function createContentCommission({
  sourceUrl = null,
  sourceNote = null,
  commissionedBy = null,
  angle = null,
  slackChannel = null,
  slackThreadTs = null,
  mirror = true,
  db = getSupabase(),
} = {}) {
  if (!db) return { ok: false, error: 'Supabase not configured' };

  const { data, error } = await db.from('content_commission')
    .insert({
      source_url:      sourceUrl,
      source_note:     sourceNote,
      commissioned_by: commissionedBy,
      angle,
      slack_channel:   slackChannel,
      slack_thread_ts: slackThreadTs,
    })
    .select()
    .single();

  if (error) {
    console.error('[ContentCommission] create failed:', error.message);
    return { ok: false, error: error.message };
  }

  if (mirror) await mirrorTransition(data, sourceNote || 'Commission opened');
  return { ok: true, commission: data };
}

/**
 * Move a commission to a new stage, persist it, and mirror the transition into
 * its Slack thread. `fields` carries stage-specific columns (angle,
 * angle_approved_at, research_task_id, research_grade, synthesis_ref,
 * draft_post_id, published_url, closed_at, close_reason, …).
 */
export async function transitionContentCommission({
  id,
  status,
  note = null,
  fields = {},
  mirror = true,
  db = getSupabase(),
} = {}) {
  if (!db) return { ok: false, error: 'Supabase not configured' };
  if (!id) return { ok: false, error: 'commission id is required' };
  if (!CONTENT_COMMISSION_STATUSES.includes(status)) {
    return { ok: false, error: `invalid status: ${status}` };
  }

  const patch = { status, ...fields };
  if (TERMINAL_STATUSES.has(status) && !patch.closed_at) {
    patch.closed_at = new Date().toISOString();
  }

  const { data, error } = await db.from('content_commission')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[ContentCommission] transition failed:', error.message);
    return { ok: false, error: error.message };
  }

  if (mirror) await mirrorTransition(data, note || `Advanced to ${status}`);
  return { ok: true, commission: data };
}

/** Update arbitrary fields on a commission without changing status or mirroring. */
export async function updateContentCommission({ id, fields = {}, db = getSupabase() }) {
  if (!db) return { ok: false, error: 'Supabase not configured' };
  if (!id) return { ok: false, error: 'commission id is required' };
  const { data, error } = await db.from('content_commission')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[ContentCommission] update failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, commission: data };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONCURRENCY CAP — review capacity is the scarce resource, not compute
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_ACTIVE_COMMISSIONS = 3;
export const ACTIVE_STATUSES = [
  'intake', 'assessing', 'angle_review', 'researching',
  'research_review', 'synthesising', 'drafting',
];

/** Refuse a fourth commission while three are between intake and draft_review. */
export async function assertCommissionCapacity({ db = getSupabase() } = {}) {
  if (!db) return { ok: true, count: 0 };
  const { data: active } = await db.from('content_commission')
    .select('id, angle, source_note, source_url, status, commissioned_at')
    .in('status', ACTIVE_STATUSES)
    .order('commissioned_at', { ascending: true });
  const count = (active || []).length;
  if (count >= MAX_ACTIVE_COMMISSIONS) {
    return {
      ok: false,
      atCapacity: true,
      count,
      inFlight: (active || []).map((c) => ({
        id: c.id,
        label: c.angle || c.source_note || c.source_url || String(c.id).slice(0, 8),
        status: c.status,
      })),
    };
  }
  return { ok: true, count };
}

/** Mirror one transition into the commission's Slack thread (no-op if unset). */
async function mirrorTransition(commission, note) {
  if (!commission?.slack_channel || !commission?.slack_thread_ts) {
    return { ok: true, skipped: true };
  }

  const res = await postSlackMessage({
    channel: commission.slack_channel,
    threadTs: commission.slack_thread_ts,
    text: `:memo: *Content commission — ${commission.status}*${note ? `\n${note}` : ''}`,
  });

  if (!res.ok) console.warn('[ContentCommission] Slack thread mirror failed:', res.error);
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSESSMENT + GATE 1
// ─────────────────────────────────────────────────────────────────────────────

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fetch + read a source. Returns { ok, title?, content?, error? }. */
async function fetchAndReadUrl(url) {
  // 1. Firecrawl clean scrape when configured.
  try {
    const { scrapeURL } = await import('./research.js');
    const scraped = await scrapeURL(url);
    if (scraped?.content && String(scraped.content).trim().length >= 40) {
      return { ok: true, title: scraped.title || url, content: String(scraped.content).slice(0, 12000) };
    }
  } catch { /* fall through to plain fetch */ }

  // 2. Plain fetch + tag strip.
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (DigiFusion-Nexus)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const text = htmlToText(await res.text());
    if (text.length < 40) return { ok: false, error: 'page was empty or unreadable' };
    return { ok: true, title: url, content: text.slice(0, 12000) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Post an arbitrary message into the commission's Slack thread (no-op if unset). */
async function mirrorMessage(commission, text) {
  if (!commission?.slack_channel || !commission?.slack_thread_ts) return { ok: true, skipped: true };
  const res = await postSlackMessage({
    channel: commission.slack_channel,
    threadTs: commission.slack_thread_ts,
    text,
  });
  if (!res.ok) console.warn('[ContentCommission] Slack mirror failed:', res.error);
  return res;
}

async function runAssessmentLlm(content, url, topic) {
  const prompt = `You are Nexus, DigiFusion's strategic coordinator. Read the source below and assess it against the firm's thesis. You propose; you never choose.

FIRM THESIS: ${FIRM_THESIS}

SOURCE URL: ${url}
${topic ? `COMMISSION NOTE: ${topic}\n` : ''}
SOURCE CONTENT:
${String(content).slice(0, 9000)}

Return ONLY a single JSON object with exactly these keys:
{
  "summary": "three-sentence summary of the source",
  "thesisRelevance": "why this does or does not bear on the firm's thesis (1-3 sentences)",
  "angles": ["candidate angle one (one sentence)", "candidate angle two (one sentence)", "candidate angle three (one sentence)"],
  "unknowns": "what is not yet known and would need research (1-3 sentences)"
}

Two or three angles only, each one sentence. Ground everything in the source above — never invent facts, statistics, or claims that are not present in the content.`;

  const raw = await callAiProvider(resolveProvider(), prompt, null, { json: true, fallback: true });
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('assessment returned no JSON');
  const parsed = JSON.parse(match[0]);
  return {
    summary: String(parsed.summary || '').trim(),
    thesisRelevance: String(parsed.thesisRelevance || '').trim(),
    angles: (Array.isArray(parsed.angles) ? parsed.angles : []).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 3),
    unknowns: String(parsed.unknowns || '').trim(),
  };
}

/**
 * Assessment stage: fetch + read the source, propose candidate angles, and move
 * status to `angle_review`. Never assesses a page that could not be read.
 */
export async function assessContentCommission({ id, db = getSupabase() }) {
  if (!db) return { ok: false, error: 'Supabase not configured' };

  const { data: commission } = await db.from('content_commission').select('*').eq('id', id).maybeSingle();
  if (!commission) return { ok: false, error: 'commission not found' };

  const url = (commission.source_url || '').trim();
  if (!url) {
    const msg = 'I need a link to read before I can assess — please paste a URL and I\'ll fetch it.';
    await mirrorMessage(commission, `:warning: ${msg}`);
    return { ok: false, error: 'no source_url', message: msg };
  }

  const read = await fetchAndReadUrl(url);
  if (!read.ok) {
    const msg = `Could not read \`${url}\` (${read.error}). I won\'t assess a page I couldn\'t read.`;
    await mirrorMessage(commission, `:x: ${msg}`);
    return { ok: false, error: read.error, message: msg };
  }

  let assessment;
  try {
    assessment = await runAssessmentLlm(read.content, url, commission.source_note);
  } catch (e) {
    const msg = `Assessment failed: ${e.message}`;
    await mirrorMessage(commission, `:x: ${msg}`);
    return { ok: false, error: e.message, message: msg };
  }

  const moved = await transitionContentCommission({
    id, status: 'angle_review', mirror: false,
    fields: { synthesis_ref: JSON.stringify(assessment) },
    db,
  });
  if (!moved.ok) {
    await mirrorMessage(commission, `:x: Could not advance to angle_review: ${moved.error}`);
    return moved;
  }

  const angleLines = assessment.angles.map((a, i) => `  ${i + 1}. ${a}`).join('\n');
  const text = [
    ':mag: *Assessment*',
    `*Summary:* ${assessment.summary}`,
    '',
    `*Bearing on the thesis:* ${assessment.thesisRelevance}`,
    '',
    `*Candidate angles:*\n${angleLines}`,
    '',
    `*Not yet known:* ${assessment.unknowns}`,
    '',
    'Reply in this thread with a number (1/2/3), a revised angle, or "abandon".',
  ].join('\n');
  await mirrorMessage(moved.commission || commission, text);

  return { ok: true, assessment };
}

/** Parse a gate-1 reply into a chosen angle, or signal abandon. */
export function parseAngleReply(text, angles = []) {
  const s = String(text || '').trim();
  if (!s) return { action: 'none' };

  if (/\b(abandon|drop it|cancel|never mind|stop)\b/i.test(s)) return { action: 'abandon' };

  const numMatch = s.match(/(?:^|\s)(?:#|angle\s*)?([1-3])\b/i);
  const ordinal = s.match(/\b(first|second|third)\b/i);
  const idx = numMatch
    ? parseInt(numMatch[1], 10) - 1
    : (ordinal ? ['first', 'second', 'third'].indexOf(ordinal[1].toLowerCase()) : -1);
  if (idx >= 0 && idx < angles.length) return { action: 'choose', angle: angles[idx], index: idx };

  const cleaned = s.replace(/^(yes|ok|sure|approved|approve|choose|pick|go with|do|let's|lets)\b[:,.\s]*/i, '').trim();
  if (cleaned) return { action: 'choose', angle: cleaned, index: null };

  return { action: 'none' };
}

/**
 * Gate 1: the human replies in-thread choosing/refining/abandoning an angle.
 * Nothing advances without this reply. On choice, sets angle + angle_approved_at
 * and moves status to `researching`.
 */
export async function resolveAngleReply({ id, text, db = getSupabase() }) {
  if (!db) return { ok: false, error: 'Supabase not configured' };

  const { data: commission } = await db.from('content_commission').select('*').eq('id', id).maybeSingle();
  if (!commission) return { ok: false, error: 'commission not found' };
  if (commission.status !== 'angle_review') return { ok: false, error: `commission is not awaiting an angle (status: ${commission.status})` };

  let angles = [];
  try { angles = JSON.parse(commission.synthesis_ref || '{}')?.angles || []; } catch { angles = []; }

  const parsed = parseAngleReply(text, angles);

  if (parsed.action === 'abandon') {
    const moved = await transitionContentCommission({
      id, status: 'abandoned', mirror: false,
      fields: { close_reason: String(text || '').slice(0, 500) },
      db,
    });
    if (!moved.ok) { await mirrorMessage(commission, `:x: Could not abandon the commission: ${moved.error}`); return moved; }
    await mirrorMessage(moved.commission, `:no_entry: Commission abandoned — ${String(text || '').slice(0, 200)}`);
    return { ok: true, action: 'abandoned', commission: moved.commission };
  }

  if (parsed.action !== 'choose') {
    await mirrorMessage(commission, ':warning: I couldn\'t parse that as an angle. Reply with a number (1/2/3), a revised angle, or "abandon".');
    return { ok: false, error: 'unparseable reply' };
  }

  const now = new Date().toISOString();
  const moved = await transitionContentCommission({
    id, status: 'researching', mirror: false,
    fields: { angle: parsed.angle, angle_approved_at: now },
    db,
  });
  if (!moved.ok) { await mirrorMessage(commission, `:x: Could not record the angle: ${moved.error}`); return moved; }
  await mirrorMessage(moved.commission, `:white_check_mark: *Angle approved* — ${parsed.angle}\nStatus → researching.`);

  // Auto-advance through research → synthesis → draft, then stop at draft_review.
  const { runContentCommission } = await import('./contentCommissionPipeline.js');
  runContentCommission({ id }).catch((e) => console.error('[ContentCommission] pipeline failed:', e.message));

  return { ok: true, action: 'researching', angle: parsed.angle, commission: moved.commission };
}
