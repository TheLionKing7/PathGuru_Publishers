/* ─────────────────────────────────────────────────────────────────────────
   PathGuru — Site Analytics

   ── WHAT THIS PAGE IS FOR, AND WHY IT CHANGED ──────────────────────────────

   The old page answered "how many views." That is the wrong question, and the
   firm's own paid-acquisition rule says so in as many words: impressions,
   reach, click-through and session counts are *available*, and an available
   number crowds out an important one. Every one of them can improve while the
   thing that matters does not move.

   The thing that matters is completed assessments. So this page is a funnel
   that ends in the FrictionIQ register, and the register's own numbers are
   pulled in as the last two steps rather than left on a different screen. If
   traffic doubles and completions do not, this page now shows that in one
   glance instead of hiding it behind two tabs.

   ── THREE DEFECTS IN THE PREVIOUS VERSION, EACH FIXED HERE ────────────────

   THE DAILY CHART RENDERED AS AN EMPTY STRIP. It drew thirty absolutely-
   positioned bars with a pixel height inside a container that established no
   baseline, so they had nothing to sit on. Thirty days of a continuous series
   is change-over-time — a line, not thirty bars — and it is now one.

   EVERY NUMBER WAS UNCOMPARED. "310 views" is not information. Against what?
   Each tile now carries the previous equivalent period and the change, which
   is the smallest unit of a number that can actually be acted on.

   AN EMPTY PANEL COLLAPSED SILENTLY. TOP REFERRERS rendered as a title with
   nothing beneath it, which reads as broken rather than as empty. Empty states
   now occupy space and say which of the two they are: no data yet, or no
   endpoint to get it from.
──────────────────────────────────────────────────────────────────────────── */

(() => {
  'use strict';

  const CX = () => window.ConsoleCharts;
  const $ = (id) => document.getElementById(id);
  const api = () => window.PathGuruBackend;
  const backend = () =>
    window.PathGuruBackend?.getBackendUrl?.() || window.location.origin.replace(/\/$/, '');

  const unwrap = (j) => (j && typeof j === 'object' ? (j.data ?? j) : {});
  const DAYS = { '7d': 7, '30d': 30, '90d': 90 };

  let _busy = false;

  async function get(path) {
    const base = backend();
    if (!base.startsWith('http')) throw new Error('NO_BACKEND');
    const res = await fetch(`${base}${path}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(json.error || res.statusText); e.status = res.status; throw e; }
    return unwrap(json);
  }

  /* ── Load ───────────────────────────────────────────────────────────── */
  async function load() {
    if (_busy) return;
    _busy = true;
    const range = $('analyticsRange')?.value || '30d';
    const days = DAYS[range] || 30;
    const btn = $('analyticsRefreshBtn');
    if (btn) { btn.textContent = 'Loading…'; btn.disabled = true; }

    /* Each panel is fetched and rendered independently. One dead endpoint
       must not blank the page — that was how the old version failed. */
    /* The prior period is DERIVED, not requested. /api/shop/analytics/pageviews
       accepts `range` and nothing else — an `offset` parameter is silently
       ignored, so asking for one returns the same window again and every delta
       renders as 0.0%. A fabricated comparison presented as a measurement is
       precisely the failure this estate exists to catch, so instead we pull a
       wider window and slice its daily series into current and prior halves. */
    const wider = range === '7d' ? '30d' : range === '30d' ? '90d' : null;

    /* The register is behind the operator gate, so it goes through apiFetch —
       which carries the session — and not through the bare `fetch` used for the
       public analytics proxy. Fetching it raw returns 401 and the completions
       tile silently reports "register unavailable" on a working register. */
    const [cur, hist, register] = await Promise.allSettled([
      get(`/api/shop/analytics/pageviews?range=${encodeURIComponent(range)}`),
      wider ? get(`/api/shop/analytics/pageviews?range=${wider}`) : Promise.resolve(null),
      api()?.apiFetch
        ? api().apiFetch('/api/frictioniq/sessions', { timeoutMs: 15000 })
        : Promise.reject(new Error('backend helper unavailable')),
    ]);

    const data = cur.status === 'fulfilled' ? cur.value : null;
    const series = hist.status === 'fulfilled' && hist.value ? (hist.value.daily_views || []) : [];
    const before = priorWindow(series, days);
    const reg = register.status === 'fulfilled' ? normaliseRegister(register.value) : null;

    if (!data) {
      const why = cur.reason?.message === 'NO_BACKEND'
        ? 'Set the backend URL in Settings, then refresh.'
        : `Analytics endpoint unavailable — ${CX().esc(cur.reason?.message || 'unknown error')}`;
      ['anTiles', 'anDaily', 'anFunnel', 'anPages', 'anReferrers', 'anSources'].forEach((id) => {
        const el = $(id); if (el) CX().emptyState(el, why);
      });
      finish(btn); return;
    }

    renderTiles(data, before, days, reg);
    renderDaily(data, days);
    renderFunnel(data, reg, days);
    renderPages(data);
    renderReferrers(data);
    renderSources(data);
    finish(btn);
  }

  function finish(btn) {
    _busy = false;
    if (btn) { btn.textContent = 'Refresh'; btn.disabled = false; }
    const stamp = $('anUpdated');
    if (stamp) stamp.textContent = `updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  }

  /* ── The register, in the shape this page needs ───────────────────────
     GET /api/frictioniq/sessions answers with { sessions, stats, page } —
     `sessions`, not `rows`, and the whole-table counts live in `stats` rather
     than in the array. Reading `.rows` returns undefined, which renders as an
     empty register on a register that is not empty.

     `stats` is the number to trust: the route computes it with count queries
     against the whole table, precisely because `sessions.length` means "the
     most recent page" and had previously been labelled "total". It is null
     when those count queries missed their deadline, and null is carried
     through rather than replaced with the page length. */
  function normaliseRegister(v) {
    if (!v || typeof v !== 'object') return null;
    const rows = Array.isArray(v.sessions) ? v.sessions
      : Array.isArray(v.rows) ? v.rows
      : Array.isArray(v) ? v : null;
    if (!rows) return null;
    const stats = v.stats && typeof v.stats === 'object' ? v.stats : null;
    const times = rows.map((r) => Date.parse(r.created_at || '')).filter(Number.isFinite);
    return {
      rows,
      total: stats?.total ?? null,
      withEmail: stats?.with_email ?? null,
      truncated: Boolean(v.page?.truncated),
      oldest: times.length ? Math.min(...times) : null,
    };
  }

  /* Sum the window immediately before the current one, from a longer daily
     series. Returns null when the history does not reach back far enough —
     null renders as "no prior period to compare", which is the truth. */
  function priorWindow(series, days) {
    if (!Array.isArray(series) || series.length < days * 2) return null;
    const sorted = [...series].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const slice = sorted.slice(-days * 2, -days);
    if (slice.length < days) return null;
    return slice.reduce((a, d) => a + (Number(d.views) || 0), 0);
  }

  /* ── Tiles: four, each with its prior period ────────────────────────── */
  function renderTiles(d, prev, days, reg) {
    const host = $('anTiles');
    if (!host) return;
    /* The column wrapper is not decoration. #anTiles is a twelve-column grid;
       a bare div is a one-column child, so four unwrapped tiles occupy four of
       twelve columns and render as a row of slivers with the text clipped —
       which is exactly how the old page looked. Each tile spans three. */
    host.innerHTML = ['anTileViews', 'anTileSessions', 'anTilePerDay', 'anTileAssess']
      .map((id) => `<div class="cx-col-3"><div class="cx-stat" id="${id}"></div></div>`).join('');

    const views = d.total_views ?? 0;
    const sessions = d.unique_sessions ?? 0;

    CX().stat($('anTileViews'), { value: views, label: 'Page views', prev });

    /* No delta on sessions. The endpoint reports one session count for the whole
       range and gives no day-level session series, so a prior figure cannot be
       derived — and inventing one would be the exact error fixed above. */
    CX().stat($('anTileSessions'), {
      value: sessions, label: 'Sessions',
      hint: sessions ? `${(views / sessions).toFixed(1)} pages per session` : null,
    });
    CX().stat($('anTilePerDay'), {
      value: days ? Math.round(views / days) : 0, label: 'Views per day',
      prev: prev != null && days ? Math.round(prev / days) : null,
    });

    /* The tile that matters. Completions inside the window, from the register. */
    if (!reg) {
      CX().emptyState($('anTileAssess'), 'Register unavailable — completions cannot be counted.');
      return;
    }

    const since = Date.now() - days * 86400000;
    const inWindow = reg.rows.filter((r) => {
      const t = Date.parse(r.created_at || r.date || '');
      return Number.isFinite(t) && t >= since;
    }).length;

    /* One caveat, stated rather than hidden. The register route returns a
       capped page of the most recent rows. If that page was capped AND its
       oldest row is still newer than the start of this window, then rows older
       than the page but inside the window were never sent — the count is a
       floor, not a count, and it is labelled as one. */
    const floor = reg.truncated && reg.oldest != null && reg.oldest > since;

    CX().stat($('anTileAssess'), {
      value: inWindow,
      label: floor ? 'Assessments completed (at least)' : 'Assessments completed',
      hint: floor
        ? 'The register returned a capped page that does not reach back across this window — raise the limit for an exact count.'
        : views ? `${((inWindow / views) * 100).toFixed(2)}% of views — this is the scorecard` : null,
    });
  }

  /* ── Daily series ──────────────────────────────────────────────────── */
  function renderDaily(d, days) {
    const host = $('anDaily');
    if (!host) return;
    const raw = Array.isArray(d.daily_views) ? d.daily_views : [];
    if (!raw.length) {
      return CX().emptyState(host, `No day-level data returned for this ${days}-day window.`);
    }
    const points = raw.map((r) => ({
      value: Number(r.views) || 0,
      label: new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    }));
    CX().areaChart(host, points, { height: 200, unit: 'views', label: 'Daily page views' });
  }

  /* ── The funnel ────────────────────────────────────────────────────────
     EVERY STEP IS SCOPED TO THE SAME WINDOW. This is the whole discipline of
     the panel and it is easy to lose: the traffic numbers come from a range
     query and are therefore windowed, while the register's `stats.total` is a
     lifetime count. Putting a lifetime completion count under a 7-day view
     count produces a conversion rate that is not merely wrong but flattering,
     which is the direction errors travel when nobody checks. So the last two
     steps are counted from the rows, filtered to the same window, and the
     lifetime figures are deliberately not used here. */
  function renderFunnel(d, reg, days) {
    const host = $('anFunnel');
    if (!host) return;
    const pages = Array.isArray(d.top_pages) ? d.top_pages : [];
    const hit = (re) => {
      const m = pages.filter((p) => re.test(String(p.path || '')));
      return m.length ? m.reduce((a, p) => a + (Number(p.views) || 0), 0) : null;
    };

    const since = Date.now() - days * 86400000;
    const inWindow = reg
      ? reg.rows.filter((r) => {
          const t = Date.parse(r.created_at || '');
          return Number.isFinite(t) && t >= since;
        })
      : null;
    const completed = inWindow ? inWindow.length : null;
    const withEmail = inWindow ? inWindow.filter((r) => r.email).length : null;

    // Same floor caveat as the tile: a capped page that does not reach back
    // across the window under-counts, and says so rather than reading low.
    const floor = Boolean(reg?.truncated && reg.oldest != null && reg.oldest > since);

    CX().funnel(host, [
      { label: 'Site views', value: d.total_views ?? null },
      { label: 'Reached the blog', value: hit(/^\/blog/) },
      { label: 'Reached the diagnostic', value: hit(/^\/diagnostic/) },
      { label: 'Started the assessment', value: null,
        note: 'needs a start event on /diagnostic — not currently recorded' },
      { label: 'Completed the assessment', value: completed,
        note: reg == null
          ? 'register unavailable — sign in as operator, or check the backend'
          : floor ? 'at least this many — the register page is capped short of the window' : null },
      { label: 'Reached capture (gave an email)', value: withEmail },
    ]);
  }

  /* ── Lists ─────────────────────────────────────────────────────────── */
  function renderPages(d) {
    CX().barList($('anPages'),
      (d.top_pages || []).map((r) => ({ label: r.path, value: r.views })),
      { color: CX().SERIES[0], limit: 10, empty: 'No page data in this window.' });
  }

  function renderReferrers(d) {
    const rows = (d.top_referrers || []).map((r) => ({ label: r.referrer, value: r.views }));
    CX().barList($('anReferrers'), rows, {
      color: CX().SERIES[3], limit: 10,
      empty: 'No referrers recorded. Either all traffic is direct, or the referrer header is not being captured.',
    });
  }

  /* Grouping referrers by kind is the only referrer view that answers a
     question. A list of thirty hostnames does not. */
  function renderSources(d) {
    const host = $('anSources');
    if (!host) return;
    const refs = d.top_referrers || [];
    const total = d.total_views ?? 0;
    if (!refs.length && !total) return CX().emptyState(host, 'No traffic in this window.');

    const bucket = { Search: 0, Social: 0, Referral: 0 };
    for (const r of refs) {
      const h = String(r.referrer || '').toLowerCase();
      const v = Number(r.views) || 0;
      if (/google|bing|duckduckgo|yahoo|ecosia|brave/.test(h)) bucket.Search += v;
      else if (/facebook|twitter|x\.com|linkedin|instagram|t\.co|tiktok|whatsapp|reddit/.test(h)) bucket.Social += v;
      else bucket.Referral += v;
    }
    const known = bucket.Search + bucket.Social + bucket.Referral;
    const direct = Math.max(0, total - known);
    const rows = [
      { label: 'Direct / unknown', value: direct },
      { label: 'Search', value: bucket.Search },
      { label: 'Social', value: bucket.Social },
      { label: 'Referral', value: bucket.Referral },
    ].filter((r) => r.value > 0);
    CX().distribution(host, rows, { empty: 'No sources to group.' });
  }

  /* ── Wiring ────────────────────────────────────────────────────────── */
  function wire() {
    $('analyticsRefreshBtn')?.addEventListener('click', load);
    $('analyticsRange')?.addEventListener('change', load);
    document.addEventListener('pg:tab-change', (e) => {
      const { tab, module } = e.detail || {};
      if (module === 'analytics' || tab === 'analytics') load();
    });
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(load, 350); });
    if ($('module-analytics')?.classList.contains('active')) load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
