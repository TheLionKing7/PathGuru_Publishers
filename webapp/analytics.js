/* ─────────────────────────────────────────────
   PathGuru Publishers — Analytics Module
   DigiFusion site footprint via PathGuru proxy
   GET /api/shop/analytics/pageviews?range=7d|30d|90d
───────────────────────────────────────────── */
(() => {
  'use strict';

  function getBackendUrl () {
    return window.PathGuruBackend?.getBackendUrl?.() || window.location.origin.replace(/\/$/, '');
  }
  function $ (id) { return document.getElementById(id); }

  function unwrapPayload (json) {
    if (!json || typeof json !== 'object') return {};
    return json.data ?? json;
  }

  async function loadAnalytics () {
    const base = getBackendUrl();
    if (!base.startsWith('http')) {
      showEmpty('Configure your backend URL in Settings first.');
      return;
    }
    const range = $('analyticsRange')?.value || '30d';
    const days  = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const btn   = $('analyticsRefreshBtn');
    if (btn) { btn.textContent = 'Loading…'; btn.disabled = true; }

    try {
      const res  = await fetch(`${base}/api/shop/analytics/pageviews?range=${encodeURIComponent(range)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      renderStats(unwrapPayload(json), days);
    } catch (err) {
      showEmpty(`Error: ${err.message}`);
    } finally {
      if (btn) { btn.textContent = 'Refresh'; btn.disabled = false; }
    }
  }

  function renderStats (data, days) {
    const views    = data.total_views     ?? 0;
    const sessions = data.unique_sessions ?? 0;
    const avgDay   = days > 0 ? Math.round(views / days) : 0;
    $('akpiViews').textContent     = views.toLocaleString();
    $('akpiSessions').textContent  = sessions.toLocaleString();
    $('akpiAvgPerDay').textContent = avgDay.toLocaleString();

    renderDailyChart(data.daily_views || []);
    renderList('analyticsTopPages', data.top_pages || [], row =>
      `<div class="analytics-row">
        <span class="analytics-row-label" title="${esc(row.path)}">${esc(row.path)}</span>
        <div class="analytics-row-bar-wrap"><div class="analytics-row-bar" style="width:${pct(row.views, data.top_pages)}%"></div></div>
        <span class="analytics-row-count">${row.views.toLocaleString()}</span>
      </div>`
    );
    renderList('analyticsTopReferrers', data.top_referrers || [], row =>
      `<div class="analytics-row">
        <span class="analytics-row-label" title="${esc(row.referrer)}">${esc(row.referrer)}</span>
        <div class="analytics-row-bar-wrap"><div class="analytics-row-bar" style="width:${pct(row.views, data.top_referrers)}%"></div></div>
        <span class="analytics-row-count">${row.views.toLocaleString()}</span>
      </div>`
    );
  }

  function pct (val, arr) {
    const max = Math.max(1, ...arr.map(r => r.views));
    return Math.round((val / max) * 100);
  }

  function renderList (containerId, rows, template) {
    const el = $(containerId);
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<div class="analytics-empty">No data yet.</div>'; return; }
    el.innerHTML = rows.map(template).join('');
  }

  function renderDailyChart (dailyViews) {
    const el = $('analyticsDailyChart');
    if (!el) return;
    if (!dailyViews.length) { el.innerHTML = '<div class="analytics-empty">No daily data.</div>'; return; }
    const max = Math.max(1, ...dailyViews.map(d => d.views));
    el.innerHTML = dailyViews
      .map(d => {
        const h = Math.max(3, Math.round((d.views / max) * 70));
        return `<div class="analytics-chart-bar" style="height:${h}px" title="${esc(d.date)}: ${d.views} views"></div>`;
      })
      .join('');
  }

  function showEmpty (msg) {
    $('akpiViews').textContent     = '—';
    $('akpiSessions').textContent  = '—';
    $('akpiAvgPerDay').textContent = '—';
    ['analyticsTopPages', 'analyticsTopReferrers', 'analyticsDailyChart'].forEach(id => {
      const el = $(id);
      if (el) el.innerHTML = `<div class="analytics-empty">${esc(msg)}</div>`;
    });
  }

  function esc (s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function wireAnalytics () {
    $('analyticsRefreshBtn')?.addEventListener('click', loadAnalytics);
    $('analyticsRange')?.addEventListener('change', loadAnalytics);

    document.addEventListener('pg:tab-change', (e) => {
      const { tab, module } = e.detail || {};
      if (module === 'analytics' || tab === 'analytics') loadAnalytics();
    });

    if (document.getElementById('module-analytics')?.classList.contains('active')) {
      loadAnalytics();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireAnalytics);
  else wireAnalytics();
})();
