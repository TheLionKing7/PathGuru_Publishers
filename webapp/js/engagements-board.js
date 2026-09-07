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

  const state = { rows: [], filter: 'all', error: null, showForm: false, busy: false };

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

    host.innerHTML = headerHtml() + filtersHtml() + formHtml() + tableHtml(list);
  }

  function headerHtml() {
    const c = state.counts || {};
    const degraded = Object.entries(state.degraded || {})
      .filter(([, v]) => v)
      .map(([k]) => k === 'fiveDay' ? 'five-day' : 'fourteen-day').join(' · ');
    return `<header class="eb-masthead">
      <div class="eb-masthead-row">
        <div>
          <h2 class="eb-title">Engagement board</h2>
          <p class="eb-lede">Every delivery in one table — both instruments, one pipeline.</p>
        </div>
        <button class="eb-new-btn" data-new-engagement>+ New engagement</button>
      </div>
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

  function formHtml() {
    if (!state.showForm) return '';
    const sel = (name, opts, def) => `<select name="${name}" class="eb-input"><option value="">—</option>${opts.map((o) => `<option value="${o}"${o === def ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    return `<form class="eb-form" id="ebNewForm">
      <h3 class="eb-form-title">New enterprise engagement</h3>
      <div class="eb-form-grid">
        <label>Client name<input name="client_name" required class="eb-input" placeholder="ABC Company"></label>
        <label>Service line${sel('track', ['ai-automation', 'business-development', 'digital-media'], 'ai-automation')}</label>
        <label>Rung${sel('kind', ['investigation', 'audit-14d', 'build', 'retainer'], 'audit-14d')}</label>
        <label>Sector<input name="sector" class="eb-input" placeholder="Financial services"></label>
        <label>Headcount${sel('headcount_band', ['1–9', '10–49', '50–249', '250–999', '1,000+'])}</label>
        <label>Country<input name="country" class="eb-input"></label>
        <label>Amount<input name="service_amount" type="number" step="any" class="eb-input" placeholder="0"></label>
        <label>Currency${sel('service_currency', ['USD', 'NGN', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR', 'CAD', 'AUD'], 'USD')}</label>
      </div>
      <label>Scope<textarea name="scope_note" class="eb-input" rows="2" placeholder="The two or three flows in scope"></textarea></label>
      <label class="eb-form-promote"><input type="checkbox" name="promote" value="1"> Promote to the delivery OS now — the amount becomes a contract</label>
      <div class="eb-form-actions">
        <button type="submit" class="eb-new-btn">Create</button>
        <button type="button" class="eb-chip" data-cancel-new>Cancel</button>
      </div>
    </form>`;
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
      <td>${agentSelect(r)}${r.workstreams?.length ? ` <span class="eb-badge eb-badge-streams" title="Multi-agent engagement — ${r.workstreams.length} workstreams">${r.workstreams.length} streams</span>` : ''}</td>
      <td>${r.frameworkId ? esc(r.frameworkId) : '<span class="eb-muted">—</span>'}</td>
      <td class="eb-rec">${r.recommendation ? esc(r.recommendation) : '<span class="eb-muted">—</span>'}</td>
      <td>${r.nextStage ? esc(r.nextStage) : '<span class="eb-muted">—</span>'}</td>
      <td class="eb-num">${money(r.serviceAmount, r.serviceCurrency)}${r.engagementId ? ' <span class="eb-badge eb-badge-contracted" title="Promoted — the amount is a contract on the delivery OS">contracted</span>' : ''}</td>
    </tr>`;
  }

  function agentSelect(r) {
    const opts = ['', 'atlas', 'nova', 'aether'].map((a) =>
      `<option value="${a}"${r.assignedAgent === a ? ' selected' : ''}>${a || '—'}</option>`
    ).join('');
    return `<select class="eb-agent" data-instrument="${r.instrument}" data-id="${r.id}" title="Re-route to a different agent">${opts}</select>`;
  }

  /* ── Wire filters + inline re-route (delegated, survive re-render) ──── */
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (chip) { setFilter(chip.dataset.filter); return; }
    if (e.target.closest('[data-new-engagement]')) { state.showForm = true; render(); return; }
    if (e.target.closest('[data-cancel-new]')) { state.showForm = false; render(); }
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('#ebNewForm');
    if (!form) return;
    e.preventDefault();
    if (state.busy) return;
    state.busy = true;
    const fd = new FormData(form);
    const body = {
      client_name: fd.get('client_name'),
      track: fd.get('track') || null,
      kind: fd.get('kind') || null,
      sector: fd.get('sector') || null,
      headcount_band: fd.get('headcount_band') || null,
      country: fd.get('country') || null,
      service_amount: fd.get('service_amount') ? Number(fd.get('service_amount')) : null,
      service_currency: fd.get('service_currency') || 'USD',
      scope_note: fd.get('scope_note') || null,
      promote: fd.get('promote') === '1',
    };
    try {
      await api().postJson('/api/engagements/create', body);
      window.pgToast?.('Engagement created', 'success');
      state.showForm = false;
      await load();
    } catch (err) {
      window.pgToast?.(err.message, 'error');
    } finally {
      state.busy = false;
    }
  });

  document.addEventListener('change', async (e) => {
    const sel = e.target.closest('select.eb-agent');
    if (!sel) return;
    try {
      await api().postJson('/api/engagements/board/op', {
        instrument: sel.dataset.instrument,
        id: sel.dataset.id,
        assigned_agent: sel.value || null,
      });
      window.pgToast?.('Re-routed', 'success');
    } catch (err) {
      window.pgToast?.(err.message, 'error');
    } finally {
      load();
    }
  });

  /* Lazy-load on first visit to the tab, like the other rooms. */
  document.addEventListener('pg:tab-change', (e) => {
    if (e.detail?.tab !== 'frictioniq-engagements') return;
    load();
  });
})();
