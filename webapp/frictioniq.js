/* ─────────────────────────────────────────────
   FrictionIQ — native operator console.
   Reads directly from Supabase via PathGuru backend.
   Replaces the broken iframe embed.
──────────────────────────────────────────── */

'use strict';

(function () {
  const REFRESH_MS = 60_000; // auto-refresh every 60 seconds

  let _refreshTimer = null;
  let _lastData = null;

  /* ── API helpers ── */
  function apiFetch(path) {
    const base = window.PathGuruBackend?.apiUrl?.('') || '';
    const url = `${base}${path}`;

    // Abort after 10 seconds — never leave the user staring at a spinner
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);

    return fetch(url, { signal: ctrl.signal }).then(r => {
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).catch(err => {
      clearTimeout(timer);
      throw err;
    });
  }

  /* ── Render ── */
  function renderSessions(rows) {
    const tbody = document.getElementById('fiqSessionsBody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="fiq-empty">No sessions yet. The register is empty.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const date = new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const score = r.total != null ? `${r.total}/24` : '—';
      const band = r.band || '—';
      const sector = r.sector || '—';
      const role = r.role || '—';
      const headcount = r.headcount_band || '—';
      const country = r.country || '—';
      const email = r.email || '—';
      const stage = r.stage || 'captured';
      const stageClass = `fiq-stage fiq-stage--${stage}`;

      return `<tr>
        <td class="fiq-date">${date}</td>
        <td class="fiq-score"><strong>${score}</strong></td>
        <td><span class="fiq-badge fiq-badge--${band.toLowerCase()}">${band}</span></td>
        <td>${_esc(sector)}</td>
        <td>${_esc(role)}</td>
        <td>${headcount}</td>
        <td>${country}</td>
        <td>${email}</td>
        <td><span class="${stageClass}">${stage}</span></td>
      </tr>`;
    }).join('');
  }

  function renderSummary(stats) {
    const el = document.getElementById('fiqSummary');
    if (!el) return;
    el.innerHTML = `
      <div class="fiq-stat">
        <span class="fiq-stat-value">${stats.total ?? 0}</span>
        <span class="fiq-stat-label">Total</span>
      </div>
      <div class="fiq-stat">
        <span class="fiq-stat-value">${stats.this_week ?? 0}</span>
        <span class="fiq-stat-label">This Week</span>
      </div>
      <div class="fiq-stat">
        <span class="fiq-stat-value">${stats.today ?? 0}</span>
        <span class="fiq-stat-label">Today</span>
      </div>
      <div class="fiq-stat">
        <span class="fiq-stat-value">${stats.with_email ?? 0}</span>
        <span class="fiq-stat-label">With Email</span>
      </div>
    `;
  }

  function renderBands(distribution) {
    const el = document.getElementById('fiqBands');
    if (!el || !distribution) return;
    const max = Math.max(1, ...Object.values(distribution));
    el.innerHTML = Object.entries(distribution).map(([band, count]) => {
      const pct = Math.round((count / max) * 100);
      return `
        <div class="fiq-band-row">
          <span class="fiq-band-label">${band}</span>
          <div class="fiq-band-bar-wrap">
            <div class="fiq-band-bar fiq-band-bar--${band.toLowerCase()}" style="width:${pct}%"></div>
          </div>
          <span class="fiq-band-count">${count}</span>
        </div>`;
    }).join('');
  }

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
  }

  /* ── Fetch & render ── */
  async function load() {
    const loading = document.getElementById('fiqEmbedLoading');
    const container = document.getElementById('fiqNative');
    if (loading) loading.style.display = 'block';
    if (container) container.style.display = 'none';

    try {
      const data = await apiFetch('/api/frictioniq/sessions');
      _lastData = data;

      renderSummary(data.stats);
      renderBands(data.band_distribution);
      renderSessions(data.sessions);
    } catch (e) {
      console.warn('[FrictionIQ] Failed to load:', e.message);
      const tbody = document.getElementById('fiqSessionsBody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="fiq-empty fiq-error">Failed to load. Is the backend running? Retrying in ${REFRESH_MS / 1000}s…</td></tr>`;
    } finally {
      if (loading) loading.style.display = 'none';
      if (container) container.style.display = 'block';
    }
  }

  /* ── Init ── */
  function init() {
    const container = document.getElementById('fiqNative');
    if (!container) return;

    document.addEventListener('pg:tab-change', (e) => {
      if (e.detail && e.detail.module === 'frictioniq') {
        load();
        if (!_refreshTimer) {
          _refreshTimer = setInterval(load, REFRESH_MS);
        }
      } else {
        if (_refreshTimer) {
          clearInterval(_refreshTimer);
          _refreshTimer = null;
        }
      }
    });

    // If already active on boot
    const activeModule = document.querySelector('.module-shell.active');
    if (activeModule && activeModule.dataset.module === 'frictioniq') {
      setTimeout(load, 200);
      _refreshTimer = setInterval(load, REFRESH_MS);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();