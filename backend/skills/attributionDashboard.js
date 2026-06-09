/**
 * C2C Attribution Dashboard — content → magnet → nurture → booking
 */

import { getSupabase } from '../supabaseClient.js';

function rangeToDate(range = '30d') {
  const days = parseInt(String(range).replace(/\D/g, ''), 10) || 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function getAttributionDashboard(range = '30d') {
  const db = getSupabase();
  const since = rangeToDate(range);

  const empty = {
    range,
    since,
    funnel: { captures: 0, nurtureActive: 0, nurtureCompleted: 0, bookings: 0, converted: 0 },
    byContent: [],
    byMagnet: [],
    recentCaptures: [],
    events: [],
    pageviews: null,
  };

  if (!db) return { ...empty, warning: 'Supabase not configured' };

  const [
    capturesRes,
    nurtureActiveRes,
    nurtureDoneRes,
    bookingsRes,
    convertedRes,
    byMagnetRes,
    byContentRes,
    recentRes,
    eventsRes,
  ] = await Promise.all([
    db.from('lead_magnet_captures').select('id', { count: 'exact', head: true }).gte('created_at', since),
    db.from('nurture_enrollments').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('nurture_enrollments').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    db.from('service_bookings').select('id', { count: 'exact', head: true }).gte('created_at', since),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'converted').gte('updated_at', since),
    db.from('lead_magnet_captures').select('magnet_slug').gte('created_at', since),
    db.from('lead_magnet_captures').select('content_slug').gte('created_at', since).not('content_slug', 'is', null),
    db.from('lead_magnet_captures').select('email, name, magnet_slug, content_slug, created_at, utm_source, utm_campaign').gte('created_at', since).order('created_at', { ascending: false }).limit(15),
    db.from('content_attribution_events').select('event_type, content_slug, lead_magnet_slug, email, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(25),
  ]);

  const countBy = (rows, key) => {
    const map = {};
    for (const r of rows || []) {
      const k = r[key] || '(unknown)';
      map[k] = (map[k] || 0) + 1;
    }
    return Object.entries(map)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };

  let pageviews = null;
  try {
    const { getPageviewAnalytics } = await import('../cmsClient.js');
    pageviews = await getPageviewAnalytics(range);
  } catch (e) {
    pageviews = { error: e.message };
  }

  return {
    range,
    since,
    funnel: {
      captures:      capturesRes.count ?? 0,
      nurtureActive: nurtureActiveRes.count ?? 0,
      nurtureCompleted: nurtureDoneRes.count ?? 0,
      bookings:      bookingsRes.count ?? 0,
      converted:     convertedRes.count ?? 0,
    },
    byMagnet:  countBy(byMagnetRes.data, 'magnet_slug'),
    byContent: countBy(byContentRes.data, 'content_slug'),
    recentCaptures: recentRes.data || [],
    events:    eventsRes.data || [],
    pageviews,
  };
}
