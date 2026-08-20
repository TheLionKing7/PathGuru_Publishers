/* ─────────────────────────────────────────────────────────────────────────
   FrictionIQ — operator console

   ── WHAT THE REGISTER IS FOR ───────────────────────────────────────────────

   The register is not a list of leads. It is the instrument that retires the
   estate's priors. Two numbers are currently guesses, and both are guesses
   only because this console has never captured the outcome that would replace
   them:

     · the band priors in lib/frictioniq/commitment.ts, which set every
       Commitment Sizer recommendation on the public site;
     · the value of a completed assessment in the paid-acquisition sizing
       rule, which sets the advertising tranche.

   Neither can be measured until somebody records, against a row, whether it
   became a paid engagement and what it was worth. That is what the outcome
   panel in the row detail is for. Ten paired outcomes and both priors become
   measurements.

   ── WHAT THE FIRST REWRITE STILL LEFT OUT ──────────────────────────────────

   It rendered a filtered, sortable table with outcome capture, and stopped
   there. Five things the system already produces never reached the screen:

     THE REPLY SWITCH. `replied` is the one control that stops a scheduled
     sequence talking over a live conversation. The server has allowlisted it
     since the route was written. Leaving it out meant the only way to prevent
     an embarrassment was the SQL console.

     THE OUTBOX. frictioniq_touch holds what is scheduled, what was sent, what
     was cancelled and why, per prospect — and GET /api/frictioniq/session
     already returns it. An operator deciding whether to call someone needs to
     know what was emailed to them yesterday.

     THE CAP. `capped` means the total said ready and a blocked domain said
     otherwise. The field guide calls it the most productive opening line an
     operator has. It was in the payload and thrown away.

     THE INSTRUMENT DEPTH. A screening score out of 24 and a deep score out of
     its own ceiling are different measurements; showing them in one column
     without saying which is which invites a comparison that is not valid.

     LEAD SCORE AND PRIORITY. Both are computed server-side and both were
     dropped, so the console could not answer "who first?" — which is the
     question an operator opens it to ask.

   ── ONE BEHAVIOUR THAT IS DELIBERATE, CARRIED FORWARD ─────────────────────

   Nothing here fabricates a value to fill a gap. A missing score renders as an
   em dash, an unknown scale renders a bare number with no denominator, and a
   benchmark below ten comparable rows is withheld with its sample size printed
   rather than shown small. A console that guesses is worse than a blank one,
   because you cannot tell which cells it guessed in.
──────────────────────────────────────────────────────────────────────────── */

'use strict';

(function () {
  const REFRESH_MS = 60_000;
  const MIN_BENCHMARK_N = 10;   // the honesty rule, from the build spec
  const STAGES = ['captured', 'working', 'conversation', 'proposal', 'engaged', 'declined', 'dormant'];
  const BANDS = ['opaque', 'approaching', 'legible', 'engineered'];

  const CX = () => window.ConsoleCharts;
  const api = () => window.PathGuruBackend;
  const $ = (id) => document.getElementById(id);

  /* The ORDINAL band ramp, read from the tokens operator-console.css defines
     and validated in that file: single hue, monotone lightness, Opaque through
     Engineered. The bands are a ranked scale, not four unrelated categories,
     and an earlier version of this console replaced the ramp with a
     categorical red/gold/blue/teal set — which both broke the ranked reading
     and overrode a decision the estate had already made and documented. */
  const cssVar = (name, fallback) => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch { return fallback; }
  };
  const BAND_COLOUR = {
    opaque:      cssVar('--fiq-band-1', '#1d6f66'),
    approaching: cssVar('--fiq-band-2', '#25907f'),
    legible:     cssVar('--fiq-band-3', '#2bb3a3'),
    engineered:  cssVar('--fiq-band-4', '#5fd3c4'),
  };

  let _rows = [];
  let _deleted = [];   // deleted rows — recovery view, populated only when "Show deleted" is on
  let _stats = null;   // whole-table counts from the server, or null if it timed out
  let _page = null;    // { returned, limit, truncated }
  let _open = null;
  let _detail = {};    // token -> { loading | error | session, touches }
  let _sort = { key: 'created_at', dir: -1 };
  let _timer = null;
  const _showDeleted = () => $('fiqDeleted')?.checked === true;
  const sourceRows = () => (_showDeleted() ? _deleted : _rows);

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—'
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—'
      : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  /* No denominator is invented. If the server did not tell us the scale, the
     honest render is the bare number. */
  const fmtScore = (r) =>
    r.total == null ? '—' : (r.max ? `${r.total}/${r.max}` : String(r.total));

  const pctScore = (r) => (r.total != null && r.max ? (r.total / r.max) * 100 : null);

  /* ── Filtering ─────────────────────────────────────────────────────── */
  function filtered() {
    const q = ($('fiqSearch')?.value || '').trim().toLowerCase();
    const band = $('fiqBand')?.value || '';
    const stage = $('fiqStage')?.value || '';
    const sector = $('fiqSector')?.value || '';
    const test = $('fiqTest')?.value || '';
    const days = Number($('fiqSince')?.value || 0);
    const since = days ? Date.now() - days * 86400000 : null;

    let out = sourceRows().filter((r) => {
      if (band && String(r.band || '').toLowerCase() !== band) return false;
      if (stage && String(r.stage || 'captured').toLowerCase() !== stage) return false;
      if (sector && r.sector !== sector) return false;
      if (test === 'test' && !r.is_test) return false;
      if (test === 'live' && r.is_test) return false;
      if (since) { const t = Date.parse(r.created_at || ''); if (!Number.isFinite(t) || t < since) return false; }
      if (q) {
        const hay = [r.organisation, r.sector, r.role, r.country, r.email, r.band]
          .map((x) => String(x ?? '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const k = _sort.key, dir = _sort.dir;
    out.sort((a, b) => {
      let x = a[k], y = b[k];
      if (k === 'created_at') { x = Date.parse(x || '') || 0; y = Date.parse(y || '') || 0; }
      else if (k === 'total') { x = pctScore(a) ?? -1; y = pctScore(b) ?? -1; }
      else if (k === 'lead_score') { x = Number(x) || -1; y = Number(y) || -1; }
      else if (k === 'band') { x = BANDS.indexOf(String(x || '').toLowerCase()); y = BANDS.indexOf(String(y || '').toLowerCase()); }
      else { x = String(x ?? '').toLowerCase(); y = String(y ?? '').toLowerCase(); }
      return x < y ? -dir : x > y ? dir : 0;
    });
    return out;
  }

  /* ── Summary ───────────────────────────────────────────────────────── */
  function renderSummary(view) {
    /* Recovery view: deleted rows are listed below for restore only. The tiles
       and band mix are analytics, and analytics count live rows — showing them
       over deleted rows would re-inflate the numbers the delete just removed. */
    if (_showDeleted()) {
      const host = $('fiqTiles');
      if (host) host.innerHTML = '<div class="cx-col-12"><div class="cx-empty"><span class="cx-empty-mark"></span>' +
        'Deleted rows are listed below for recovery only — the tiles, band mix and funnel count live rows, not these.</div></div>';
      const dist = $('fiqBandMix');
      if (dist) dist.innerHTML = `<div class="cx-empty"><span class="cx-empty-mark"></span>${_deleted.length} deleted row(s). Restore one to return it to the register.</div>`;
      const note = $('fiqBandNote');
      if (note) note.textContent = '';
      return;
    }
    const host = $('fiqTiles');
    if (host) {
      // Three columns each, inside the twelve-column grid — an unwrapped tile
      // is a one-column sliver.
      host.innerHTML = ['fiqT1', 'fiqT2', 'fiqT3', 'fiqT4']
        .map((id) => `<div class="cx-col-3"><div class="cx-stat" id="${id}"></div></div>`).join('');
      const wk = Date.now() - 7 * 86400000, prevWk = Date.now() - 14 * 86400000;
      const inRange = (r, from, to) => {
        const t = Date.parse(r.created_at || ''); return Number.isFinite(t) && t >= from && (!to || t < to);
      };

      /* The server computes these against the WHOLE table with count queries,
         for the stated reason that `sessions.length` means "the most recent
         page" and was once labelled "total". The page length is used only when
         the counts missed their deadline, and then it is labelled as a page. */
      const capped = Boolean(_page?.truncated);

      CX().stat($('fiqT1'), {
        value: _stats?.total ?? _rows.length,
        label: _stats ? 'Whole register' : `Register${capped ? ' — page only' : ''}`,
        hint: view.length !== _rows.length ? `${view.length} match the current filter` : null,
      });

      /* The delta is derived from rows, so it is only honest while the page
         reaches back a fortnight. When it does not, the count shows without a
         comparison rather than against a truncated prior week. */
      const reachesBack = !capped || _rows.some((r) => {
        const t = Date.parse(r.created_at || ''); return Number.isFinite(t) && t < prevWk;
      });
      CX().stat($('fiqT2'), {
        value: _stats?.this_week ?? _rows.filter((r) => inRange(r, wk)).length,
        label: 'Last 7 days',
        prev: reachesBack ? _rows.filter((r) => inRange(r, prevWk, wk)).length : null,
        hint: reachesBack ? null : 'no prior week to compare — the register page is capped',
      });

      const withEmail = _stats?.with_email ?? _rows.filter((r) => r.email).length;
      const emailDenom = _stats?.total ?? _rows.length;
      CX().stat($('fiqT3'), { value: withEmail, label: 'Reached capture',
        hint: emailDenom ? `${((withEmail / emailDenom) * 100).toFixed(0)}% gave an email` : null });

      /* This tile is the point of the console. It counts rows with a RECORDED
         outcome — not rows at stage "engaged" — because a stage is where the
         operator thinks a prospect is and an outcome is what happened. */
      const decided = _rows.filter((r) => r.outcome).length;
      const won = _rows.filter((r) => r.outcome === 'won').length;
      CX().stat($('fiqT4'), {
        value: decided, label: 'Outcomes recorded',
        hint: decided < MIN_BENCHMARK_N
          ? `${MIN_BENCHMARK_N - decided} more before the declared priors can be replaced by measurements`
          : `${won} won of ${decided} decided — enough to retire the guessed conversion rate`,
      });
    }

    const dist = $('fiqBandMix');
    if (dist) {
      const counts = BANDS.map((b) => ({
        label: b, color: BAND_COLOUR[b],
        value: view.filter((r) => String(r.band || '').toLowerCase() === b).length,
      })).filter((r) => r.value > 0);
      CX().distribution(dist, counts, { empty: 'No rows in the current filter.' });
      const note = $('fiqBandNote');
      if (note) {
        note.textContent = view.length < MIN_BENCHMARK_N
          ? `Sample of ${view.length}. Below ${MIN_BENCHMARK_N} this is a sample, not a benchmark — do not quote it to a client.`
          : `Sample of ${view.length} rows on this screen.`;
        note.className = view.length < MIN_BENCHMARK_N ? 'cx-sample' : 'cx-panel-sub';
      }
    }
  }

  /* ── Table ─────────────────────────────────────────────────────────── */
  const bandChip = (b) => {
    const k = String(b || '').toLowerCase();
    return BANDS.includes(k)
      ? `<span class="cx-band cx-band-${k}"><i></i>${esc(k)}</span>`
      : '<span class="cx-band cx-band-unknown"><i></i>unknown</span>';
  };

  /* The cap and the depth marker travel WITH the score, never in a column of
     their own — the whole point of both is that they qualify the number they
     sit beside. */
  const scoreCell = (r) => {
    const cap = r.capped
      ? '<span class="cx-cap" title="The total read ready, but at least one domain was blocked. The band is held down deliberately.">capped</span>'
      : '';
    const deep = r.depth && r.depth !== 'short';
    const depth = `<span class="cx-depth" title="${deep ? 'Deep instrument' : 'Screening instrument'}">${deep ? 'deep' : 'screen'}</span>`;
    return `<b>${esc(fmtScore(r))}</b>${cap}${depth}`;
  };

  const rowActions = (r) => {
    if (r.deleted_at) {
      return `<button class="cx-btn cx-btn-sm" data-restore-for="${esc(r.token)}" title="Return this row to the register">Restore</button>`;
    }
    const test = r.is_test
      ? `<button class="cx-btn cx-btn-sm" data-test-for="${esc(r.token)}" title="Mark as a real submission">unmark test</button>`
      : `<button class="cx-btn cx-btn-sm" data-test-for="${esc(r.token)}" title="Mark as a test submission">mark test</button>`;
    return `${test}<button class="cx-btn cx-btn-danger cx-btn-sm" data-delete-for="${esc(r.token)}" title="Soft-delete this row">Delete</button>`;
  };

  function renderTable(view) {
    const body = $('fiqTableBody');
    if (!body) return;
    const COLS = 10;
    if (!view.length) {
      body.innerHTML = `<tr><td colspan="${COLS}"><div class="cx-empty">
        <span class="cx-empty-mark"></span>No rows match this filter.</div></td></tr>`;
      return;
    }
    body.innerHTML = view.map((r) => {
      const open = _open === r.token;
      const hot = Number(r.lead_score) >= 70 || String(r.priority || '').toLowerCase() === 'high';
      return `<tr data-token="${esc(r.token)}" class="${open ? 'cx-open' : ''}">
        <td class="cx-num">${esc(fmtDate(r.created_at))}</td>
        <td class="cx-num">${scoreCell(r)}</td>
        <td>${bandChip(r.band)}</td>
        <td>${esc(r.organisation || '—')}${r.is_test ? '<span class="cx-flag cx-flag-test" title="Marked as a test submission">test</span>' : ''}${r.deleted_at ? '<span class="cx-flag cx-flag-deleted" title="Soft-deleted">deleted</span>' : ''}</td>
        <td>${esc(r.sector || '—')}</td>
        <td>${esc(r.country || '—')}</td>
        <td>${r.email ? esc(r.email) : '<span style="color:var(--text-muted,#4d6280)">no email</span>'}
            ${r.replied ? '<span class="cx-flag cx-flag-replied" title="This prospect has replied. Scheduled sends are held.">replied</span>' : ''}</td>
        <td class="cx-num">${r.lead_score == null ? '—' : esc(String(r.lead_score))}
            ${hot ? '<span class="cx-flag cx-flag-hot">priority</span>' : ''}</td>
        <td>${stageSelect(r)}</td>
        <td class="cx-actions">${rowActions(r)}</td>
      </tr>${open ? detailRow(r) : ''}`;
    }).join('');

    // Sort indicator. A sortable header that never shows which way it sorted
    // makes the operator click twice to find out.
    document.querySelectorAll('#module-frictioniq .cx-table th[data-sort]').forEach((th) => {
      if (th.dataset.sort === _sort.key) th.setAttribute('aria-sort', _sort.dir === 1 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
  }

  const stageSelect = (r) => `<select class="cx-stage" data-stage-for="${esc(r.token)}">
      ${STAGES.map((s) => `<option value="${s}"${String(r.stage || 'captured') === s ? ' selected' : ''}>${s}</option>`).join('')}
    </select>`;

  /* ── Row detail ────────────────────────────────────────────────────────
     Opening a row fetches GET /api/frictioniq/session?token=, which returns
     the whole record plus its touch history. The list endpoint deliberately
     projects a narrow set of columns; everything else about a prospect lives
     behind this second call, and not making it was the reason the console
     could show you the register but not tell you anything about a row in it. */
  function detailRow(r) {
    const d = _detail[r.token];
    const hot = Number(r.lead_score) >= 70 || String(r.priority || '').toLowerCase() === 'high';

    return `<tr class="cx-detail"><td colspan="10"><div class="cx-detail-inner">
      <div>
        <div class="cx-detail-block">
          <h4>Outbox</h4>
          ${outboxHtml(d)}
        </div>
        <div class="cx-detail-block">
          <h4>Full record</h4>
          ${recordHtml(r, d)}
        </div>
      </div>
      <div>
        <div class="cx-detail-block">
          <h4>Session</h4>
          <div class="cx-kv"><span>Taken</span><b>${esc(fmtDate(r.created_at))}</b></div>
          <div class="cx-kv"><span>Role</span><b>${esc(r.role || '—')}</b></div>
          <div class="cx-kv"><span>Headcount</span><b>${esc(r.headcount_band || '—')}</b></div>
          <div class="cx-kv"><span>Instrument</span><b>${r.depth && r.depth !== 'short'
            ? `deep${r.max ? ` — scored out of ${esc(String(r.max))}` : ''}`
            : 'screening — scored out of 24'}</b></div>
          <div class="cx-kv"><span>Band held down</span><b>${r.capped
            ? 'yes — a domain was blocked'
            : 'no'}</b></div>
          <div class="cx-kv"><span>Lead score</span><b>${r.lead_score == null ? '—' : esc(String(r.lead_score))}${hot ? ' · priority' : ''}</b></div>
          <div class="cx-kv"><span>Result link</span><b><a href="https://www.digitafusion.com/diagnostic/r/${esc(r.token)}"
            target="_blank" rel="noopener" style="color:var(--blue,#4d9fff)">open ↗</a></b></div>
        </div>

        <div class="cx-detail-block">
          <h4>Sequence</h4>
          <label class="cx-kv" style="cursor:pointer">
            <span>Prospect has replied</span>
            <b><input type="checkbox" data-replied-for="${esc(r.token)}"${r.replied ? ' checked' : ''}
                      style="accent-color:var(--fiq-band-3,#2bb3a3);cursor:pointer"></b>
          </label>
          <p class="cx-outcome-note">Ticking this holds every scheduled send. It is the one
            switch that stops an automated sequence talking over a live conversation.</p>
        </div>

        <div class="cx-detail-block">
          <h4>Outcome</h4>
          <div class="cx-outcome">
            <select class="cx-select" data-outcome-for="${esc(r.token)}">
              <option value="">— not yet known —</option>
              <option value="won"${r.outcome === 'won' ? ' selected' : ''}>Became a paid engagement</option>
              <option value="lost"${r.outcome === 'lost' ? ' selected' : ''}>Did not convert</option>
              <option value="pending"${r.outcome === 'pending' ? ' selected' : ''}>Still open</option>
            </select>
            <input class="cx-input" type="text" inputmode="numeric" placeholder="Engagement value in naira, if won"
                   data-value-for="${esc(r.token)}" value="${esc(r.outcome_value ?? '')}">
            <button class="cx-btn cx-btn-primary" data-save-for="${esc(r.token)}">Save outcome</button>
            <p class="cx-outcome-note">This is the field that replaces the guesses. The band priors in
              the Commitment Sizer and the value-per-assessment in the advertising rule are both
              declared priors until ${MIN_BENCHMARK_N} rows here carry a real outcome.</p>
          </div>
        </div>
      </div>
    </div></td></tr>`;
  }

  /* The outbox. Four states, each with its own dot, and a cancelled touch
     prints its reason — a send that was called off silently is indistinguishable
     from one that never existed. */
  function outboxHtml(d) {
    if (!d || d.loading) return '<div class="cx-empty"><span class="cx-empty-mark"></span>Loading the touch history…</div>';
    if (d.error) return `<div class="cx-empty"><span class="cx-empty-mark"></span>Could not read the outbox — ${esc(d.error)}</div>`;
    const t = Array.isArray(d.touches) ? d.touches : [];
    if (!t.length) {
      return `<div class="cx-empty"><span class="cx-empty-mark"></span>Nothing scheduled or sent.
        Either the sequence has not started, or migration 0010 has not been applied.</div>`;
    }
    const state = (x) => x.cancelled_at ? 'cancelled'
      : x.sent_at ? 'sent'
      : x.last_error ? 'failed'
      : 'scheduled';
    const sorted = [...t].sort((a, b) =>
      Date.parse(a.sent_at || a.scheduled_for || '') - Date.parse(b.sent_at || b.scheduled_for || ''));
    return sorted.map((x) => {
      const s = state(x);
      const when = x.sent_at || x.scheduled_for;
      const why = s === 'cancelled' ? (x.cancel_reason || 'cancelled — no reason recorded')
        : s === 'failed' ? `failed after ${x.attempts ?? '?'} attempt(s) — ${x.last_error}`
        : null;
      return `<div class="cx-touch">
        <span class="cx-touch-dot cx-touch-${s}" title="${s}"></span>
        <span class="cx-touch-what">${esc(x.subject || x.kind || 'touch')}${
          x.step != null ? ` <span class="cx-depth">step ${esc(String(x.step))}</span>` : ''}${
          x.channel ? ` <span class="cx-depth">${esc(x.channel)}</span>` : ''}</span>
        <span class="cx-touch-when">${esc(fmtDateTime(when))}</span>
        ${why ? `<span class="cx-touch-why">${esc(why)}</span>` : ''}
      </div>`;
    }).join('');
  }

  /* Everything on the record that is not already on screen. The list endpoint
     projects a narrow column set by design; rather than guess which of the
     remaining columns matter — the per-domain breakdown among them, whose
     shape this client does not know — the whole rest of the row is shown as it
     comes. Nothing about a prospect is hidden behind a projection I chose. */
  function recordHtml(r, d) {
    if (!d || d.loading) return '<div class="cx-empty"><span class="cx-empty-mark"></span>Loading…</div>';
    if (d.error || !d.session) return '<div class="cx-empty"><span class="cx-empty-mark"></span>The full record could not be read.</div>';
    const shown = new Set(['token', 'created_at', 'total', 'max', 'depth', 'band', 'capped', 'sector',
      'role', 'headcount_band', 'country', 'email', 'stage', 'organization', 'organisation',
      'replied', 'replied_at', 'lead_score', 'priority', 'outcome', 'outcome_value', 'outcome_at',
      'is_test', 'deleted_at', 'deleted_by', 'delete_reason']);
    const rest = Object.entries(d.session)
      .filter(([k, v]) => !shown.has(k) && v !== null && v !== undefined && v !== '');
    if (!rest.length) return '<div class="cx-empty"><span class="cx-empty-mark"></span>No further fields on this record.</div>';
    return rest.map(([k, v]) => {
      const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `<div class="cx-kv"><span>${esc(k.replace(/_/g, ' '))}</span><b>${esc(
        val.length > 160 ? `${val.slice(0, 157)}…` : val)}</b></div>`;
    }).join('');
  }

  async function loadDetail(token) {
    _detail[token] = { loading: true };
    render();
    try {
      const d = await api().apiFetch(`/api/frictioniq/session?token=${encodeURIComponent(token)}`, { timeoutMs: 15000 });
      _detail[token] = { session: d?.session ?? null, touches: d?.touches ?? [] };
    } catch (e) {
      _detail[token] = { error: e.message };
    }
    render();
  }

  /* ── Export ────────────────────────────────────────────────────────── */
  function exportCsv() {
    const view = filtered();
    const cols = ['created_at', 'total', 'max', 'depth', 'capped', 'band', 'organisation', 'sector',
      'role', 'headcount_band', 'country', 'email', 'replied', 'lead_score', 'priority',
      'stage', 'outcome', 'outcome_value', 'token'];
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...view.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `frictioniq-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ── Data ──────────────────────────────────────────────────────────── */
  async function refresh() {
    const status = $('fiqStatus');
    if (status) status.textContent = 'loading…';
    const deleted = _showDeleted();
    try {
      const data = await api().apiFetch(`/api/frictioniq/sessions${deleted ? '?deleted=1' : ''}`, { timeoutMs: 15000 });
      /* The route answers with { sessions, stats, band_distribution, page }.
         `sessions`, not `rows` — reading the wrong key yields undefined and
         renders "no rows match this filter" over a register that is full. */
      const raw = Array.isArray(data?.sessions) ? data.sessions
        : Array.isArray(data?.rows) ? data.rows
        : Array.isArray(data) ? data : [];
      _stats = data?.stats && typeof data.stats === 'object' ? data.stats : null;
      _page = data?.page && typeof data.page === 'object' ? data.page : null;

      /* The server spells it `organization`; this console reads `organisation`
         in the cell, the search haystack, the sort key and the CSV header.
         Reconciling it in four places invites the fifth to be missed, so it is
         reconciled once, here, at the boundary. */
      const mapped = raw.map((r) => {
        const org = r.organisation ?? r.organization ?? null;
        return { ...r, organisation: org, organization: org };
      });
      if (deleted) _deleted = mapped; else _rows = mapped;

      if (deleted) {
        if (status) status.textContent = `${_deleted.length} deleted row(s) · recovery view`;
      } else if (_page?.truncated) {
        if (status) status.textContent = `showing ${_rows.length} of ${_stats?.total ?? '?'} — server capped this page`;
      } else if (status) {
        status.textContent = `${_rows.length} rows · updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
      }
      populateSectors();
      render();
    } catch (e) {
      if (status) status.textContent = `error: ${e.message}`;
      const body = $('fiqTableBody');
      if (body) body.innerHTML = `<tr><td colspan="10"><div class="cx-empty">
        <span class="cx-empty-mark"></span>Could not read the register — ${esc(e.message)}</div></td></tr>`;
    }
  }

  function populateSectors() {
    const sel = $('fiqSector');
    if (!sel || sel.dataset.filled) return;
    const seen = [...new Set(_rows.map((r) => r.sector).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All sectors</option>' +
      seen.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    sel.dataset.filled = '1';
  }

  async function patch(token, body, btn) {
    const label = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await api().postJson('/api/frictioniq/session', { token, ...body });
      const r = _rows.find((x) => x.token === token);
      if (r) Object.assign(r, body);
      if (btn) btn.textContent = 'Saved';
      setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = label || 'Save outcome'; } }, 1200);
      render();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = `Failed — ${e.message}`; }
      else window.pgToast?.(`Could not save — ${e.message}`, 'error');
      render();
    }
  }

  /* ── Delete / restore / test ───────────────────────────────────────────── */
  async function removeRow(token) {
    const r = sourceRows().find((x) => x.token === token);
    const org = r?.organisation || 'this row';
    const date = r?.created_at ? fmtDate(r.created_at) : '';
    const label = `Delete ${org}${date ? ` (${date})` : ''}?`;
    /* The confirmation carries the organisation and date so a mis-click cannot
       remove the wrong row. Soft delete: the row leaves the register and every
       count and its scheduled touches are stopped, but it can be restored. */
    if (!window.confirm(`${label}\n\nThe row is soft-deleted — it leaves the register and every count, and its scheduled touches are stopped. It can be restored from the "Show deleted" view.`)) return;
    try {
      await api().apiFetch(`/api/frictioniq/session/${encodeURIComponent(token)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'deleted from console' }),
      });
      await refresh();
    } catch (e) {
      window.pgToast?.(`Delete failed — ${e.message}`, 'error');
    }
  }

  async function restoreRow(token) {
    try {
      await api().postJson(`/api/frictioniq/session/${encodeURIComponent(token)}/restore`, {});
      await refresh();
    } catch (e) {
      window.pgToast?.(`Restore failed — ${e.message}`, 'error');
    }
  }

  async function toggleTest(token) {
    const r = sourceRows().find((x) => x.token === token);
    const next = !(r?.is_test === true);
    try {
      await api().postJson('/api/frictioniq/sessions/mark-test', { tokens: [token], is_test: next });
      if (r) r.is_test = next;
      render();
    } catch (e) {
      window.pgToast?.(`Could not update — ${e.message}`, 'error');
    }
  }

  function render() {
    const view = filtered();
    renderSummary(view);
    renderTable(view);
  }

  /* ── Wiring ────────────────────────────────────────────────────────── */
  function wire() {
    ['fiqSearch', 'fiqBand', 'fiqStage', 'fiqSector', 'fiqSince', 'fiqTest'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', render);
    });
    $('fiqRefresh')?.addEventListener('click', refresh);
    $('fiqExport')?.addEventListener('click', exportCsv);
    $('fiqDeleted')?.addEventListener('change', () => {
      _open = null; _detail = {};
      refresh();
    });
    $('fiqClear')?.addEventListener('click', () => {
      ['fiqSearch', 'fiqBand', 'fiqStage', 'fiqSector', 'fiqSince', 'fiqTest'].forEach((id) => { const e = $(id); if (e) e.value = ''; });
      const del = $('fiqDeleted'); if (del) del.checked = false;
      render();
    });

    document.addEventListener('click', (e) => {
      const th = e.target.closest('#module-frictioniq th[data-sort]');
      if (th) {
        const k = th.dataset.sort;
        _sort = { key: k, dir: _sort.key === k ? -_sort.dir : -1 };
        return render();
      }
      const save = e.target.closest('[data-save-for]');
      if (save) {
        const token = save.dataset.saveFor;
        const outcome = document.querySelector(`[data-outcome-for="${CSS.escape(token)}"]`)?.value || null;
        const raw = document.querySelector(`[data-value-for="${CSS.escape(token)}"]`)?.value || '';
        const num = Number(String(raw).replace(/[^\d.]/g, ''));
        /* A value is only ever sent alongside a win. The table enforces the
           same rule, and letting the console post a value against "did not
           convert" would surface as a constraint error the operator cannot
           read — and, if the constraint were dropped, would quietly inflate
           the mean engagement value the advertising rule uses. */
        const value = outcome === 'won' && Number.isFinite(num) && num > 0 ? num : null;
        return patch(token, { outcome, outcome_value: value }, save);
      }
      const del = e.target.closest('[data-delete-for]');
      if (del) return removeRow(del.dataset.deleteFor);
      const restore = e.target.closest('[data-restore-for]');
      if (restore) return restoreRow(restore.dataset.restoreFor);
      const testToggle = e.target.closest('[data-test-for]');
      if (testToggle) return toggleTest(testToggle.dataset.testFor);
      const tr = e.target.closest('#module-frictioniq tr[data-token]');
      if (tr && !e.target.closest('select,input,button,a,label')) {
        const token = tr.dataset.token;
        _open = _open === token ? null : token;
        if (_open && !_detail[_open]) return loadDetail(_open);
        render();
      }
    });

    document.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-stage-for]');
      if (sel) return patch(sel.dataset.stageFor, { stage: sel.value });
      const rep = e.target.closest('[data-replied-for]');
      if (rep) return patch(rep.dataset.repliedFor, { replied: rep.checked });
    });

    document.addEventListener('pg:tab-change', (e) => {
      const { tab, module } = e.detail || {};
      const on = module === 'frictioniq' || tab === 'frictioniq';
      clearInterval(_timer);
      if (on) { refresh(); _timer = setInterval(refresh, REFRESH_MS); }
    });

    if ($('module-frictioniq')?.classList.contains('active')) {
      refresh();
      _timer = setInterval(refresh, REFRESH_MS);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
