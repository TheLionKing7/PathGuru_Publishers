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
   panel in the row detail is for, and it is the reason this console exists at
   all. Ten paired outcomes and both priors become measurements.

   ── WHAT WAS MISSING BEFORE ────────────────────────────────────────────────

   The previous console rendered a table and four counters. It had no search,
   no filters, no way to open a row, no way to move a row through the pipeline
   the schema already defines, no export, and no outcome capture. It could
   show you the register; it could not be used to operate it.

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

  /* Colour follows the entity, never its position in a list. These are the same
     four values the band chips use in console.css, so a band reads as the same
     colour in the mix bar, in its legend and in every row of the table. Letting
     the distribution fall back to the categorical series order gave "legible"
     a blue chip and a teal legend swatch on the same screen — which quietly
     teaches the operator that the colours mean nothing. */
  const BAND_COLOUR = {
    opaque:      '#C4573F',
    approaching: '#A89434',
    legible:     '#3D8FD9',
    engineered:  '#1F9077',
  };
  /* Validated as a categorical set against the #131E2E panel surface:
     lightness band PASS, chroma floor PASS, normal-vision separation PASS
     (worst adjacent pair ΔE 15.7), contrast PASS. One WARN stands and is
     accepted deliberately: opaque↔approaching separate by only ΔE 7.6 under
     deuteranopia, because red and gold collapse toward each other there and
     the band scale is ordinal — the two warm steps cannot simply be moved
     apart without breaking the reading order. A warning in the 6–8 band is
     permitted only where a second, non-colour encoding carries the same
     information, so every place these appear carries the band NAME in text:
     the legend beneath the mix bar, and the chip in each table row. Nothing
     on either screen is distinguished by colour alone. */

  const CX = () => window.ConsoleCharts;
  const api = () => window.PathGuruBackend;
  const $ = (id) => document.getElementById(id);

  let _rows = [];
  let _stats = null;   // whole-table counts from the server, or null if it timed out
  let _page = null;    // { returned, limit, truncated }
  let _open = null;
  let _sort = { key: 'created_at', dir: -1 };
  let _timer = null;

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—'
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
    const days = Number($('fiqSince')?.value || 0);
    const since = days ? Date.now() - days * 86400000 : null;

    let out = _rows.filter((r) => {
      if (band && String(r.band || '').toLowerCase() !== band) return false;
      if (stage && String(r.stage || 'captured').toLowerCase() !== stage) return false;
      if (sector && r.sector !== sector) return false;
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
      else { x = String(x ?? '').toLowerCase(); y = String(y ?? '').toLowerCase(); }
      return x < y ? -dir : x > y ? dir : 0;
    });
    return out;
  }

  /* ── Summary ───────────────────────────────────────────────────────── */
  function renderSummary(view) {
    const host = $('fiqTiles');
    if (host) {
      // Three columns each, inside the twelve-column grid — see the note in
      // analytics.js: an unwrapped tile is a one-column sliver.
      host.innerHTML = ['fiqT1', 'fiqT2', 'fiqT3', 'fiqT4']
        .map((id) => `<div class="cx-col-3"><div class="cx-stat" id="${id}"></div></div>`).join('');
      const wk = Date.now() - 7 * 86400000, prevWk = Date.now() - 14 * 86400000;
      const inRange = (r, from, to) => {
        const t = Date.parse(r.created_at || ''); return Number.isFinite(t) && t >= from && (!to || t < to);
      };
      /* The server computes these three against the WHOLE table with count
         queries, for the stated reason that `sessions.length` means "the most
         recent page" and was once labelled "total". Preferring the page length
         here would reintroduce exactly that bug on the screen, so the page
         length is used only when the counts missed their deadline — and then
         it is labelled as a page. */
      const capped = Boolean(_page?.truncated);
      const pageNote = capped ? ` (this page of ${_rows.length}; whole-table count unavailable)` : '';

      CX().stat($('fiqT1'), {
        value: _stats?.total ?? _rows.length,
        label: _stats ? 'Whole register' : `Register${capped ? ' — page only' : ''}`,
        hint: view.length !== _rows.length ? `${view.length} match the current filter` : (_stats ? null : pageNote.trim() || null),
      });

      /* The delta is derived from rows, so it is only honest while the page
         reaches back a fortnight. When it does not, the count shows without a
         comparison rather than against a truncated prior week that would read
         as growth. */
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
         operator thinks a prospect is and an outcome is what actually happened.
         The band priors and the value-per-assessment stay guesses until this
         number reaches ten, so the tile counts down to that rather than
         reporting a pipeline figure nobody acts on. */
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
      : '<span class="cx-band" style="color:var(--cx-dim)"><i></i>—</span>';
  };

  function renderTable(view) {
    const body = $('fiqTableBody');
    if (!body) return;
    if (!view.length) {
      body.innerHTML = `<tr><td colspan="8"><div class="cx-empty">
        <span class="cx-empty-mark"></span>No rows match this filter.</div></td></tr>`;
      return;
    }
    body.innerHTML = view.map((r) => {
      const open = _open === r.token;
      return `<tr data-token="${esc(r.token)}" class="${open ? 'cx-open' : ''}">
        <td class="cx-num">${esc(fmtDate(r.created_at))}</td>
        <td class="cx-num"><b>${esc(fmtScore(r))}</b></td>
        <td>${bandChip(r.band)}</td>
        <td>${esc(r.organisation || '—')}</td>
        <td>${esc(r.sector || '—')}</td>
        <td>${esc(r.country || '—')}</td>
        <td>${r.email ? esc(r.email) : '<span style="color:var(--cx-dim)">no email</span>'}</td>
        <td>${stageSelect(r)}</td>
      </tr>${open ? detailRow(r) : ''}`;
    }).join('');
  }

  const stageSelect = (r) => `<select class="cx-stage" data-stage-for="${esc(r.token)}">
      ${STAGES.map((s) => `<option value="${s}"${String(r.stage || 'captured') === s ? ' selected' : ''}>${s}</option>`).join('')}
    </select>`;

  /* ── Row detail — where the outcome is captured ────────────────────── */
  function detailRow(r) {
    const domains = Array.isArray(r.domains) ? r.domains
      : Array.isArray(r.answers) ? r.answers.map((v, i) => ({ name: `Domain ${i + 1}`, score: v })) : [];
    const maxD = domains.reduce((m, d) => Math.max(m, Number(d.max) || 10), 10);

    const domainHtml = domains.length ? domains.map((d) => {
      const v = Number(d.score);
      const blocked = Number.isFinite(v) && v <= 3;
      const w = Number.isFinite(v) ? Math.max(2, (v / maxD) * 100) : 0;
      return `<div class="cx-domain">
        <span class="${blocked ? 'cx-blocked' : ''}">${esc(d.name)}${blocked ? ' — blocked' : ''}</span>
        <span class="cx-domain-track"><span class="cx-domain-fill"
          style="width:${w}%;background:${blocked ? 'var(--cx-bad)' : 'var(--cx-s1)'}"></span></span>
        <span class="cx-num">${Number.isFinite(v) ? v : '—'}</span>
      </div>`;
    }).join('') : `<div class="cx-empty"><span class="cx-empty-mark"></span>
        Per-domain scores are not in this payload. The list endpoint returns totals only.</div>`;

    return `<tr class="cx-detail"><td colspan="8"><div class="cx-detail-inner">
      <div>
        <h4>Domain scores</h4>${domainHtml}
      </div>
      <div>
        <h4>Session</h4>
        <div class="cx-kv"><span>Taken</span><b>${esc(fmtDate(r.created_at))}</b></div>
        <div class="cx-kv"><span>Role</span><b>${esc(r.role || '—')}</b></div>
        <div class="cx-kv"><span>Headcount</span><b>${esc(r.headcount_band || '—')}</b></div>
        <div class="cx-kv"><span>Instrument</span><b>${r.max === 120 ? 'deep (60q)' : r.max === 24 ? 'standard (12q)' : esc(r.max ? `scale ${r.max}` : 'unknown')}</b></div>
        <div class="cx-kv"><span>Result link</span><b><a href="https://www.digitafusion.com/diagnostic/r/${esc(r.token)}"
          target="_blank" rel="noopener" style="color:var(--cx-s1)">open ↗</a></b></div>

        <h4 style="margin-top:16px">Outcome</h4>
        <div class="cx-outcome">
          <select class="cx-select" data-outcome-for="${esc(r.token)}">
            <option value="">— not yet known —</option>
            <option value="won"${r.outcome === 'won' ? ' selected' : ''}>Became a paid engagement</option>
            <option value="lost"${r.outcome === 'lost' ? ' selected' : ''}>Did not convert</option>
            <option value="pending"${r.outcome === 'pending' ? ' selected' : ''}>Still open</option>
          </select>
          <input class="cx-input" type="text" inputmode="numeric" placeholder="Engagement value, if won"
                 data-value-for="${esc(r.token)}" value="${esc(r.outcome_value ?? '')}">
          <button class="cx-btn cx-btn-primary" data-save-for="${esc(r.token)}">Save outcome</button>
          <p class="cx-outcome-note">This is the field that replaces the guesses. The band priors in
            the Commitment Sizer and the value-per-assessment in the advertising rule are both
            declared priors until ${MIN_BENCHMARK_N} rows here carry a real outcome.</p>
        </div>
      </div>
    </div></td></tr>`;
  }

  /* ── Export ────────────────────────────────────────────────────────── */
  function exportCsv() {
    const view = filtered();
    const cols = ['created_at', 'total', 'max', 'band', 'organisation', 'sector', 'role',
      'country', 'email', 'stage', 'outcome', 'outcome_value', 'token'];
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
    try {
      const data = await api().apiFetch('/api/frictioniq/sessions', { timeoutMs: 15000 });
      /* The route answers with { sessions, stats, band_distribution, page }.
         `sessions`, not `rows` — reading the wrong key yields undefined and
         renders "no rows match this filter" over a register that is full. The
         other two keys are accepted as a courtesy to any future shape, but
         `sessions` is the one this server actually sends. */
      const raw = Array.isArray(data?.sessions) ? data.sessions
        : Array.isArray(data?.rows) ? data.rows
        : Array.isArray(data) ? data : [];
      _stats = data?.stats && typeof data.stats === 'object' ? data.stats : null;
      _page = data?.page && typeof data.page === 'object' ? data.page : null;
      /* The server spells it `organization`; this console reads `organisation`
         throughout — in the cell, the search haystack, the sort key and the CSV
         header. Reconciling it in four places invites the fifth to be missed,
         so it is reconciled once, here, at the boundary. Both spellings stay on
         the row: the console reads British, an export consumer reading the
         server's own field name still finds it. */
      _rows = raw.map((r) => {
        const org = r.organisation ?? r.organization ?? null;
        return { ...r, organisation: org, organization: org };
      });
      if (_page?.truncated) {
        if (status) status.textContent = `showing ${_rows.length} of ${_stats?.total ?? '?'} — server capped this page`;
      } else if (status) {
        status.textContent = `${_rows.length} rows · updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
      }
      populateSectors();
      render();
    } catch (e) {
      if (status) status.textContent = `error: ${e.message}`;
      const body = $('fiqTableBody');
      if (body) body.innerHTML = `<tr><td colspan="8"><div class="cx-empty">
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
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await api().postJson('/api/frictioniq/session', { token, ...body });
      const r = _rows.find((x) => x.token === token);
      if (r) Object.assign(r, body);
      if (btn) btn.textContent = 'Saved';
      setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = 'Save outcome'; } }, 1200);
      render();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = `Failed — ${e.message}`; }
    }
  }

  function render() {
    const view = filtered();
    renderSummary(view);
    renderTable(view);
  }

  /* ── Wiring ────────────────────────────────────────────────────────── */
  function wire() {
    ['fiqSearch', 'fiqBand', 'fiqStage', 'fiqSector', 'fiqSince'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', render);
    });
    $('fiqRefresh')?.addEventListener('click', refresh);
    $('fiqExport')?.addEventListener('click', exportCsv);
    $('fiqClear')?.addEventListener('click', () => {
      ['fiqSearch', 'fiqBand', 'fiqStage', 'fiqSector', 'fiqSince'].forEach((id) => { const e = $(id); if (e) e.value = ''; });
      render();
    });

    document.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
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
           read — and, if the constraint were ever dropped, would quietly
           inflate the mean engagement value that the advertising rule uses. */
        const value = outcome === 'won' && Number.isFinite(num) && num > 0 ? num : null;
        return patch(token, { outcome, outcome_value: value }, save);
      }
      const tr = e.target.closest('tr[data-token]');
      if (tr && !e.target.closest('select,input,button,a')) {
        _open = _open === tr.dataset.token ? null : tr.dataset.token;
        render();
      }
    });

    document.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-stage-for]');
      if (sel) patch(sel.dataset.stageFor, { stage: sel.value });
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
