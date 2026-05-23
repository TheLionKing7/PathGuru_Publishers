/* ─────────────────────────────────────────────
   PathGuru Publishers — Analytics Module
   Fetches pageview stats from DigiFusion CMS
   GET /api/cms/analytics/pageviews?range=7d|30d|90d
───────────────────────────────────────────── */
(() => {
  'use strict';

  /* ── Helpers ───────────────────────────────── */
  function getBackendUrl () {
    try { return JSON.parse(localStorage.getItem('pg_settings') || '{}').backendUrl || ''; } catch { return ''; }
  }
  function getCmsToken () {
    try { return JSON.parse(localStorage.getItem('pg_settings') || '{}').cmsToken || ''; } catch { return ''; }
  }
  function $ (id) { return document.getElementById(id); }

  /* ── Fetch analytics data ─────────────────── */
  async function loadAnalytics () {
    const base = getBackendUrl();
    if (!base) {
      showEmpty('Configure your backend URL in Settings first.');
      return;
    }
    const range  = $('analyticsRange')?.value || '30d';
    const days   = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const token  = getCmsToken();
    const url    = `${base.replace(/\/$/, '')}/api/cms/analytics/pageviews?range=${range}`;

    $('analyticsRefreshBtn').textContent = 'Loading…';
    $('analyticsRefreshBtn').disabled = true;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res  = await fetch(url, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      renderStats(json, days);
    } catch (err) {
      showEmpty(`Error: ${err.message}`);
    } finally {
      $('analyticsRefreshBtn').textContent = 'Refresh';
      $('analyticsRefreshBtn').disabled = false;
    }
  }

  /* ── Render ───────────────────────────────── */
  function renderStats (data, days) {
    // KPIs
    const views    = data.total_views   ?? 0;
    const sessions = data.unique_sessions ?? 0;
    const avgDay   = days > 0 ? Math.round(views / days) : 0;
    $('akpiViews').textContent    = views.toLocaleString();
    $('akpiSessions').textContent = sessions.toLocaleString();
    $('akpiAvgPerDay').textContent = avgDay.toLocaleString();

    // Daily chart
    renderDailyChart(data.daily_views || []);

    // Top pages
    renderList('analyticsTopPages', data.top_pages || [], row =>
      `<div class="analytics-row">
        <span class="analytics-row-label" title="${esc(row.path)}">${esc(row.path)}</span>
        <div class="analytics-row-bar-wrap"><div class="analytics-row-bar" style="width:${pct(row.views, data.top_pages)}%"></div></div>
        <span class="analytics-row-count">${row.views.toLocaleString()}</span>
      </div>`
    );

    // Top referrers
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
    $('akpiViews').textContent    = '—';
    $('akpiSessions').textContent = '—';
    $('akpiAvgPerDay').textContent = '—';
    ['analyticsTopPages','analyticsTopReferrers','analyticsDailyChart'].forEach(id => {
      const el = $(id);
      if (el) el.innerHTML = `<div class="analytics-empty">${esc(msg)}</div>`;
    });
  }

  function esc (s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Wire up ──────────────────────────────── */
  function wireAnalytics () {
    $('analyticsRefreshBtn')?.addEventListener('click', loadAnalytics);
    $('analyticsRange')?.addEventListener('change', loadAnalytics);

    // Auto-load when analytics module becomes active
    document.querySelectorAll('.nav-btn[data-module]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.module === 'analytics') loadAnalytics();
      });
    });

    // Load on init if analytics is the active module
    if (document.getElementById('module-analytics')?.classList.contains('active')) {
      loadAnalytics();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireAnalytics);
  else wireAnalytics();
})();
