/* ══════════════════════════════════════════════════════════════════════════
   ENGAGEMENT BOARD — FrictionIQ › Engagements
   ══════════════════════════════════════════════════════════════════════════

   One read across both delivery registers — assessment_5d (five-day) and
   frictioniq_engagement (fourteen-day) — projected into a single table so the
   operator can answer, in one place: which business, what stage, owned by whom,
   running which framework, and for how much.

   It is a read-only projection. The instruments stay separate; this board never
   writes, and never invents a value to fill a gap — a missing agent or amount
   renders as an em dash, not a guess.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const api = () => window.PathGuruBackend;

  const AGENTS = ['atlas', 'nova', 'aether'];

  const state = { rows: [], filter: 'all', error: null };

  const money = (n, ccy) => {
    if (n === null || n === undefined || n === '') return '—';
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'USD', maximumFractionDigits: 0 }).format(Number(n));
    } catch { return `${ccy || 'USD'} ${Number(n).toLocaleString('en-GB')}`; }
  };

  async function load() {
    const host = $('engBoard');
    if (!host) return;
    try {
      const d = await api().apiFetch('/api/engagements/board?limit=500', { timeoutMs: 15000 });
      state.rows = d.rows || [];
      state.counts = d.counts || {};
      state.degraded = d.degraded || {};
      state.error = null;
    } catch (e) {
      state.error = e.message;
    }
    render();
  }

  function setFilter(f) {
    state.filter = f;
    render();
  }

  function render() {
    const host = $('engBoard');
    if (!host) return;
    if (state.error) {
      host.innerHTML = `<p class="eb-error">${esc(state.error)}</p>`;
      return;
    }
    const list = state.filter === 'unassigned'
      ? state.rows.filter((r) => !r.assignedAgent)
      : state.filter === 'all'
        ? state.rows
        : state.rows.filter((r) => r.assignedAgent === state.filter);

    host.innerHTML = headerHtml() + filtersHtml() + tableHtml(list);
  }

  function headerHtml() {
    const c = state.counts || {};
    const degraded = Object.entries(state.degraded || {})
      .filter(([, v]) => v)
      .map(([k]) => k === 'fiveDay' ? 'five-day' : 'fourteen-day').join(' · ');
    return `<header class="eb-masthead">
      <h2 class="eb-title">Engagement board</h2>
      <p class="eb-lede">Every delivery in one table — both instruments, one pipeline.</p>
      <p class="eb-meta">${c.total ?? 0} total · ${c.fiveDay ?? 0} five-day · ${c.fiq ?? 0} fourteen-day · ${c.unassigned ?? 0} unassigned${degraded ? ` · <span class="eb-warn">${esc(degraded)} unavailable</span>` : ''}</p>
    </header>`;
  }

  function filtersHtml() {
    const chip = (id, label) => `<button class="eb-chip${state.filter === id ? ' active' : ''}" data-filter="${id}">${label}</button>`;
    return `<div class="eb-filters" id="ebFilters">
      ${chip('all', 'All')}
      ${AGENTS.map((a) => chip(a, a)).join('')}
      ${chip('unassigned', 'Unassigned')}
    </div>`;
  }

  function tableHtml(list) {
    if (!list.length) {
      return `<p class="eb-empty">No engagements yet. The board fills as assessments conclude — a five-day proceeds, or a rung on the fourteen-day ladder is sold.</p>`;
    }
    return `<div class="eb-table-wrap">
      <table class="eb-table">
        <thead>
          <tr>
            <th>Business</th>
            <th>Instrument</th>
            <th>Line</th>
            <th>Sector · Size</th>
            <th>Stage</th>
            <th>Agent</th>
            <th>Framework</th>
            <th>Recommendation</th>
            <th>Next</th>
            <th class="eb-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(rowHtml).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function rowHtml(r) {
    const badge = r.instrument === '5day'
      ? `<span class="eb-badge eb-badge-5d">5-day</span>`
      : `<span class="eb-badge eb-badge-fiq">14-day</span>`;
    const stage = [r.stage, r.detail].filter(Boolean).join(' · ') || '—';
    return `<tr>
      <td class="eb-name">${esc(r.clientName)}</td>
      <td>${badge}</td>
      <td>${r.track ? esc(r.track) : '<span class="eb-muted">—</span>'}</td>
      <td>${esc([r.sector, r.headcountBand].filter(Boolean).join(' · ')) || '—'}</td>
      <td>${esc(stage)}</td>
      <td>${r.assignedAgent ? esc(r.assignedAgent) : '<span class="eb-muted">—</span>'}</td>
      <td>${r.frameworkId ? esc(r.frameworkId) : '<span class="eb-muted">—</span>'}</td>
      <td class="eb-rec">${r.recommendation ? esc(r.recommendation) : '<span class="eb-muted">—</span>'}</td>
      <td>${r.nextStage ? esc(r.nextStage) : '<span class="eb-muted">—</span>'}</td>
      <td class="eb-num">${money(r.serviceAmount, r.serviceCurrency)}${r.engagementId ? ' <span class="eb-badge eb-badge-contracted" title="Promoted — the amount is a contract on the delivery OS">contracted</span>' : ''}</td>
    </tr>`;
  }

  /* ── Wire filters (delegated, so re-render keeps them live) ─────────── */
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (chip) setFilter(chip.dataset.filter);
  });

  load();
})();
