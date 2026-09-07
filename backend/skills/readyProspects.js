/**
 * Ready-to-engage prospects — the enterprise funnel's "booked but not started".
 *
 * A firm that took the twelve-domain diagnostic, identified themselves (the
 * result was emailed via Resend and is viewable at /diagnostic/r/<token>), and
 * is enterprise-sized — but has no frictioniq_engagement yet. These are the rows
 * the operator promotes into an engagement with one click, pre-filled from what
 * the funnel already knows.
 */

import { getSupabase } from '../supabaseClient.js';

const db = () => {
  const c = getSupabase();
  if (!c) throw new Error('Supabase not configured');
  return c;
};

const ENTERPRISE_BANDS = ['50–249', '250–999', '1,000+'];
const SITE_URL = 'https://www.digitafusion.com';

export async function loadReadyProspects({ limit = 100 } = {}) {
  const c = db();

  const { data: sessions, error } = await c.from('frictioniq_session')
    .select('token, organization, full_name, email, sector, headcount_band, revenue_band, band, lead_score, priority, created_at')
    .in('headcount_band', ENTERPRISE_BANDS)
    .not('email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const tokens = (sessions || []).map((s) => s.token);

  // Which tokens already have an engagement.
  const engaged = new Set();
  if (tokens.length) {
    const { data: engs } = await c.from('frictioniq_engagement')
      .select('session_token')
      .in('session_token', tokens)
      .not('session_token', 'is', null);
    for (const e of engs || []) engaged.add(e.session_token);
  }

  // Intake rows joined on session_token.
  const intakes = new Map();
  if (tokens.length) {
    const { data: ins } = await c.from('intake_submission')
      .select('id, session_token, company, contact_name, track, booked_at')
      .in('session_token', tokens)
      .not('session_token', 'is', null);
    for (const i of ins || []) if (!intakes.has(i.session_token)) intakes.set(i.session_token, i);
  }

  // Bookings joined on intake_id (the funnel booking table, migration 0021).
  const bookings = new Map();
  const intakeIds = [...intakes.values()].map((i) => i.id);
  if (intakeIds.length) {
    const { data: bks } = await c.from('booking')
      .select('intake_id, status, starts_at')
      .in('intake_id', intakeIds)
      .order('starts_at', { ascending: false });
    for (const bk of bks || []) if (bk.intake_id && !bookings.has(bk.intake_id)) bookings.set(bk.intake_id, bk);
  }

  return {
    prospects: (sessions || [])
      .filter((s) => !engaged.has(s.token))
      .map((s) => {
        const intake = intakes.get(s.token) || null;
        const booking = intake ? (bookings.get(intake.id) || null) : null;
        return {
          token: s.token,
          organization: s.organization,
          contact: s.full_name || intake?.contact_name || null,
          email: s.email,
          sector: s.sector,
          headcountBand: s.headcount_band,
          revenueBand: s.revenue_band,
          band: s.band,
          leadScore: s.lead_score,
          priority: s.priority,
          resultUrl: `${SITE_URL}/diagnostic/r/${s.token}`,
          bookedAt: booking?.starts_at || intake?.booked_at || null,
          bookingStatus: booking?.status || null,
          track: intake?.track || null,
        };
      }),
    engagedCount: engaged.size,
  };
}
