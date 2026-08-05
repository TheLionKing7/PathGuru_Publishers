/* ─────────────────────────────────────────────
   FrictionIQ — native operator console.

   Reads the register through the PathGuru backend, which reads Supabase.

   ── WHY THIS FILE WAS REWRITTEN ────────────────────────────────────────────

   The previous version never displayed data, for a reason that had nothing to
   do with the database: it built its URL as apiUrl('') + '/api/…', and
   apiUrl('') returned a trailing slash, so every request went to a doubled
   slash and 404'd before reaching a route. Fixed in js/core/backend.js.

   Three further defects are corrected here, and each is the kind that survives
   for months because nothing visibly breaks:

     THE ESCAPE FUNCTION DID NOTHING. `_esc` replaced '&' with '&', '<' with
     '<'. Organisation and sector strings — attacker-controlled, since anyone
     on the internet can take the diagnostic — went into innerHTML raw.

     THE SCALE WAS HARDCODED. Every score rendered as "/24". The deep
     instrument scores out of 120, so every deep assessment was mislabelled by
     a factor of five.

     "TOTAL" WAS THE PAGE LENGTH. The server capped at 200 rows and the console
     called that number the total. Now the server counts the table, and the
     band distribution is labelled as the sample it actually is.

   ── AND ONE BEHAVIOUR THAT IS DELIBERATE ───────────────────────────────────

   Nothing here fabricates a value to fill a gap. A missing score renders as an
   em dash, an unknown scale renders the bare number with no denominator, and a
   truncated page says so on screen. A console that guesses is worse than one
   that is blank, because you cannot tell which cells it guessed in — which is
   the argument this product makes to clients about their own dashboards.
──────────────────────────────────────────── */

'use strict';

(function () {
  const REFRESH_MS = 60_000;

  let _refreshTimer = null;
  let _rows = [];

  const api = () => window.PathGuruBackend;

  /* ── Escaping ──────────────────────────────────────────────────────────
     The real one. Ampersand first, or every other replacement gets
     double-escaped on the way through. */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ── Formatting ────────────────────────────────────────────────────────── */

  function fmtScore(row) {
    if (row.total === null || row.total === undefined) return '—';
    // No denominator invented. If the server could not tell us the scale, the
    // honest render is the bare number.
    return row.max ? `${row.total}/${row.max}` : String(row.total);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const STAGES = ['captured', 'working', 'conversation', 'proposal', 'engaged', 'declined', 'dormant'];

  /* ── Render ────────────────────────────────────────────────────────────── */

  function renderSessions(rows) {
    const tbody = document.getElementById('fiqSessionsBody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="10" class="fiq-empty">No sessions yet. The register is empty.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r) => {
      const band = r.band || '—';
      const stage = r.stage || 'captured';
      const options = STAGES.map(
        (s) => `<option value="${s}"${s === stage ? ' selected' : ''}>${s}</option>`
      ).join('');

      // A capped band means the firm's own total said ready and a blocked
      // domain said otherwise. That gap is the most productive opening line
      // available to an operator, so it gets a marker rather than being
      // averaged away into the band letter.
      const capMark = r.capped
        ? ` <span class="fiq-cap" title="Band capped by a blocked domain">capped</span>`
        : '';

      // 'short' is the screening instrument's stored value — NOT 'screening'.
      // Getting this wrong tagged every ordinary row with a depth chip.
      const depthMark = r.depth && r.depth !== 'short'
        ? ` <span class="fiq-depth">${esc(r.depth)}</span>`
        : '';

      return `<tr data-token="${esc(r.token)}">
        <td class="fiq-date">${fmtDate(r.created_at)}</td>
        <td class="fiq-score"><strong>${fmtScore(r)}</strong>${depthMark}</td>
        <td><span class="fiq-badge fiq-badge--${esc(String(band).toLowerCase())}">${esc(band)}</span>${capMark}</td>
        <td>${esc(r.organization) || '—'}</td>
        <td>${esc(r.sector) || '—'}</td>
        <td>${esc(r.role) || '—'}</td>
        <td>${esc(r.country) || '—'}</td>
        <td class="fiq-email">${esc(r.email) || '—'}</td>
        <td>
          <label class="fiq-replied">
            <input type="checkbox" data-action="replied" ${r.replied ? 'checked' : ''} />
            <span>replied</span>
          </label>
        </td>
        <td>
          <select class="fiq-stage-select" data-action="stage">${options}</select>
        </td>
      </tr>`;
    }).join('');
  }

  function renderSummary(stats, page) {
    const el = document.getElementById('fiqSummary');
    if (!el) return;

    // Counts missed their deadline server-side. Say so. Rendering zeroes here
    // would be a lie, and an unexplained blank is a bug report waiting to happen.
    if (!stats) {
      el.innerHTML = `<div class="fiq-stat fiq-stat--unavailable">
        <span class="fiq-stat-value">—</span>
        <span class="fiq-stat-label">Counts unavailable</span>
        <span class="fiq-stat-note">the database was too slow to total the register; the rows below are current</span>
      </div>`;
      const n0 = document.getElementById('fiqPageNote');
      if (n0) n0.hidden = true;
      return;
    }

    const cell = (v, label, note) => `
      <div class="fiq-stat">
        <span class="fiq-stat-value">${v ?? 0}</span>
        <span class="fiq-stat-label">${label}</span>
        ${note ? `<span class="fiq-stat-note">${note}</span>` : ''}
      </div>`;

    el.innerHTML =
      cell(stats.total, 'Total', 'whole register') +
      cell(stats.this_week, 'This week') +
      cell(stats.today, 'Today') +
      cell(stats.with_email, 'With email');

    const note = document.getElementById('fiqPageNote');
    if (note) {
      // Say when the table is a window rather than the whole thing. A silent
      // cap reads as "you are looking at everything" when you are not.
      note.textContent = page?.truncated
        ? `Showing the most recent ${page.returned} of ${stats?.total ?? 'an unknown number'}. Older rows are not on this screen.`
        : '';
      note.hidden = !page?.truncated;
    }
  }

  function renderBands(distribution, sampleSize) {
    const el = document.getElementById('fiqBands');
    if (!el) return;
    const entries = Object.entries(distribution || {});
    if (!entries.length) { el.innerHTML = ''; return; }

    const max = Math.max(1, ...entries.map(([, v]) => v));
    el.innerHTML =
      `<div class="fiq-bands-caption">Band mix across the ${sampleSize} rows on this screen — a sample, not a benchmark.</div>` +
      entries.map(([band, count]) => {
        const pct = Math.round((count / max) * 100);
        const key = esc(String(band).toLowerCase());
        return `
          <div class="fiq-band-row">
            <span class="fiq-band-label">${esc(band)}</span>
            <div class="fiq-band-bar-wrap">
              <div class="fiq-band-bar fiq-band-bar--${key}" style="width:${pct}%"></div>
            </div>
            <span class="fiq-band-count">${count}</span>
          </div>`;
      }).join('');
  }

  function showError(message, hint) {
    const tbody = document.getElementById('fiqSessionsBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="10" class="fiq-empty fiq-error">
      ${esc(message)}${hint ? `<br><span class="fiq-error-hint">${esc(hint)}</span>` : ''}
    </td></tr>`;
  }

  /* ── Load ──────────────────────────────────────────────────────────────── */

  async function load() {
    const loading = document.getElementById('fiqEmbedLoading');
    const container = document.getElementById('fiqNative');

    // Reveal the panel immediately and put the waiting state inside the table.
    // The old version hid the whole panel behind a separate spinner, so any
    // path that failed to reach its finally block left the operator staring at
    // "Loading FrictionIQ console…" with nothing to click and nothing to read.
    if (loading) loading.style.display = 'none';
    if (container) container.style.display = 'block';

    const tbody = document.getElementById('fiqSessionsBody');
    if (tbody && !_rows.length) {
      tbody.innerHTML = `<tr><td colspan="10" class="fiq-empty">Loading…</td></tr>`;
    }

    try {
      const data = await api().apiFetch('/api/frictioniq/sessions', { timeoutMs: 15000 });
      _rows = data.sessions || [];
      renderSummary(data.stats, data.page);
      renderBands(data.band_distribution, _rows.length);
      renderSessions(_rows);
    } catch (e) {
      if (e.status === 401 || e.status === 503) {
        // session.js has already raised the login overlay; do not also shout.
        showError('Sign in to view the register.');
        return;
      }
      showError(
        `Could not load the register — ${e.message}`,
        'Check that the backend is running and that Backend URL in Settings points at it.'
      );
    }
  }

  /* ── Operator actions ──────────────────────────────────────────────────── */

  async function update(token, patch, revert) {
    try {
      await api().postJson('/api/frictioniq/session', { token, ...patch });
      window.pgToast?.('Saved', 'success');
    } catch (e) {
      // Put the control back where it was. A control showing a state the server
      // rejected is worse than one that never moved, because the operator will
      // act on what they can see.
      revert?.();
      window.pgToast?.(`Could not save — ${e.message}`, 'error');
    }
  }

  function bindActions() {
    const tbody = document.getElementById('fiqSessionsBody');
    if (!tbody) return;

    // Delegated, so it survives every re-render without rebinding.
    tbody.addEventListener('change', (ev) => {
      const el = ev.target;
      const row = el.closest && el.closest('tr[data-token]');
      if (!row) return;
      const token = row.dataset.token;
      const rec = _rows.find((r) => r.token === token);

      if (el.dataset.action === 'stage') {
        const previous = rec?.stage ?? 'captured';
        const next = el.value;
        update(token, { stage: next }, () => { el.value = previous; });
        if (rec) rec.stage = next;
      }

      if (el.dataset.action === 'replied') {
        const next = el.checked;
        update(token, { replied: next }, () => { el.checked = !next; });
        if (rec) rec.replied = next;
      }
    });
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */

  function startPolling() {
    if (!_refreshTimer) _refreshTimer = setInterval(load, REFRESH_MS);
  }

  function stopPolling() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  }

  function isActive() {
    const el = document.querySelector('.module-shell.active');
    return Boolean(el && el.dataset.module === 'frictioniq');
  }

  function init() {
    if (!document.getElementById('fiqNative')) return;

    bindActions();

    document.addEventListener('pg:tab-change', (e) => {
      if (e.detail && e.detail.module === 'frictioniq') { load(); startPolling(); }
      else stopPolling();
    });

    // Signing in mid-session should fill the panel if we are looking at it.
    document.addEventListener('pg:authenticated', () => {
      if (isActive()) { load(); startPolling(); }
    });

    // Losing the session stops the poll, so an expired console does not hammer
    // a 401 every sixty seconds for the rest of the day.
    document.addEventListener('pg:unauthorized', stopPolling);

    if (isActive()) { setTimeout(load, 200); startPolling(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
