/* ══════════════════════════════════════════════════════════════════════════
   FIVE-DAY ASSESSMENT — Intelligence › Five-Day
   ══════════════════════════════════════════════════════════════════════════

   ONE ROOM, NOT TWO. The playbook and the register are the same screen: the
   method sits beside the day you are working, and the day you are working
   writes to the record. Splitting them would mean reading the method in one
   tab and typing into another during a live call, which is precisely when
   nobody does it.

   Two states. With nothing selected it is the register — every assessment with
   its finding, and the form that starts one. With an assessment open it is the
   playbook: a rail of the six days, the method text for the day you are on,
   and the inputs for that day. The finding sits at the top throughout, because
   the count that survived is the point of the instrument and should never
   require scrolling.

   The verdict on a candidate is computed by the SERVER from the three tests.
   This file never sends one. See backend/skills/assessment5d.js.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const state = {
    loaded: false,
    rows: [],
    open: null,        // { assessment, finding, stages, verdicts }
    busy: false,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const api = () => window.PathGuruBackend;

  const money = (n, ccy) => {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'USD', maximumFractionDigits: 0 }).format(n);
    } catch { return `${ccy || 'USD'} ${Math.round(n).toLocaleString('en-GB')}`; }
  };
  const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');

  /* ── Load ─────────────────────────────────────────────────────────────── */

  async function loadRegister() {
    const host = $('fdBody');
    if (host && !state.loaded) host.innerHTML = '<div class="fd-loading"><div class="agents-spinner"></div><span>Loading the register…</span></div>';
    try {
      const d = await api().apiFetch('/api/frictioniq/assessments', { timeoutMs: 15000 });
      state.rows = d.assessments || [];
      state.loaded = true;
      render();
    } catch (e) {
      if (host) host.innerHTML = `<div class="fd-error">Could not read the register — ${esc(e.message)}.<br>
        If this says the table is missing, run <code>0024_assessment_5d.sql</code>.</div>`;
    }
  }

  async function openAssessment(id) {
    const host = $('fdBody');
    if (host) host.innerHTML = '<div class="fd-loading"><div class="agents-spinner"></div><span>Opening…</span></div>';
    try {
      state.open = await api().apiFetch(`/api/frictioniq/assessment?id=${encodeURIComponent(id)}`, { timeoutMs: 15000 });
      render();
    } catch (e) {
      if (host) host.innerHTML = `<div class="fd-error">${esc(e.message)}</div>`;
    }
  }

  /** Every write goes through one op, and the server answers with the whole
      record — so the finding on screen is always the server's, never a local
      guess about what the edit probably did. */
  async function op(body) {
    if (state.busy) return;
    state.busy = true;
    try {
      state.open = await api().postJson('/api/frictioniq/assessment/op',
        { ...body, id: state.open.assessment.id });
      /* The register behind it is now stale in exactly one row. Refresh it
         quietly rather than leaving a list that disagrees with the thing the
         operator just changed. */
      void loadRegisterQuiet();
      render();
    } catch (e) {
      window.pgToast?.(e.message, 'error');
    } finally {
      state.busy = false;
    }
  }

  async function loadRegisterQuiet() {
    try {
      const d = await api().apiFetch('/api/frictioniq/assessments', { timeoutMs: 15000 });
      state.rows = d.assessments || [];
    } catch { /* the open record is what matters here */ }
  }

  /* ── Render ───────────────────────────────────────────────────────────── */

  function render() {
    const host = $('fdBody');
    if (!host) return;
    host.innerHTML = state.open ? assessmentHtml() : registerHtml();
  }

  function registerHtml() {
    const rows = state.rows;
    return `
      <!-- No pitch here. What stood in this space was copy written for a
           prospect — "built so it can return nothing" and the rest — which
           belongs on digitafusion, not in the console the work is done in. An
           operator opening this room needs to know what is in flight, not to
           be sold the method they are about to run. -->

      ${rows.length ? `
      <table class="cx-table fd-table">
        <thead><tr>
          <th>Client</th><th>Day</th><th>Candidates</th><th>Finding</th><th>Sector</th><th>Started</th>
        </tr></thead>
        <tbody>
          ${rows.map((a) => {
            const f = a.finding || {};
            return `<tr class="fd-row" data-open="${esc(a.id)}">
              <td><span class="fd-client">${esc(a.client_name)}</span></td>
              <td>${esc(dayLabel(a.stage))}</td>
              <td>${f.listed ? `${f.listed} listed · <span class="fd-ok">${f.survived}</span> survived · ${f.killed} killed` : '—'}</td>
              <td>${f.priced ? `${esc(money(f.low, a.currency))}–${esc(money(f.high, a.currency))}` :
                    f.survived ? '<span class="fd-warn">not priced</span>' : '—'}</td>
              <td>${esc(a.sector || '—')}</td>
              <td>${esc(day(a.created_at))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : `
      <div class="fd-empty">No assessments yet. Start one below — usually from a gate that passed.</div>`}

      <div class="fd-panel fd-start">
        <h3>Start an assessment</h3>
        <div class="fd-grid">
          <label>Client<input type="text" id="fdNewName" placeholder="Who"></label>
          <label>Sector<input type="text" id="fdNewSector"></label>
          <label>Country<input type="text" id="fdNewCountry"></label>
          <label>Currency<input type="text" id="fdNewCurrency" value="USD"></label>
          <label>Gate token <span class="fd-hint">if they passed the three questions</span>
            <input type="text" id="fdNewGate"></label>
        </div>
        <button class="cx-btn cx-btn-primary" id="fdCreate">Start · Day 1</button>
      </div>`;
  }

  function dayLabel(stage) {
    const s = (state.open?.stages || DEFAULT_STAGES).find((x) => x.id === stage);
    if (!s) return stage || '—';
    return s.day === '—' ? s.label : `${s.day} · ${s.label}`;
  }

  /* Used before an assessment has been opened, so the register can label days
     without waiting for the playbook to arrive. Ids must match the server's. */
  const DEFAULT_STAGES = [
    { id: 'observe', day: 'Day 1', label: 'Observe' },
    { id: 'analyse', day: 'Day 2', label: 'Analyse' },
    { id: 'price',   day: 'Day 3', label: 'Price' },
    { id: 'report',  day: 'Day 4', label: 'Report' },
    { id: 'decide',  day: 'Day 5', label: 'Decide' },
    { id: 'closed',  day: '—',     label: 'Closed' },
  ];

  function assessmentHtml() {
    const { assessment: a, finding: f, stages } = state.open;
    const stage = stages.find((s) => s.id === a.stage) || stages[0];

    return `
      <div class="fd-head">
        <button class="cx-btn" id="fdBack">← Register</button>
        <div>
          <h3>${esc(a.client_name)}</h3>
          <p class="fd-meta">${[a.sector, a.headcount_band, a.country, a.currency].filter(Boolean).map(esc).join(' · ')}</p>
        </div>
      </div>

      ${findingHtml(a, f)}

      <div class="fd-rail">
        ${stages.map((s) => `
          <button class="fd-day ${s.id === a.stage ? 'on' : ''}" data-stage="${esc(s.id)}">
            <span class="fd-day-n">${esc(s.day)}</span>
            <span class="fd-day-l">${esc(s.label)}</span>
          </button>`).join('')}
      </div>

      <div class="fd-split">
        <!-- The playbook, for the day being worked. Beside the inputs, not in
             another tab — a method you have to go and find during a live call
             is a method nobody follows. -->
        <aside class="fd-playbook">
          <p class="fd-playbook-day">${esc(stage.day === '—' ? '' : stage.day)} ${esc(stage.label)}</p>
          <p class="fd-playbook-blurb">${esc(stage.blurb)}</p>
          <ul class="fd-prompts">
            ${(stage.prompts || []).map((p) => `<li>${esc(p)}</li>`).join('')}
          </ul>
        </aside>

        <div class="fd-work">${workHtml(a, f, stage.id)}</div>
      </div>`;
  }

  function findingHtml(a, f) {
    if (!f.listed) {
      return `<div class="fd-panel fd-finding">
        <h3>The finding</h3>
        <p class="fd-intro-dim">No candidates yet. Day 2 fills this in — with no target number, because a
        count that is free to come out at zero is the only reason to believe it when it does not.</p>
      </div>`;
    }
    const tiles = [
      [f.listed, 'listed'], [f.survived, 'survived all three'],
      [f.killed, 'killed'], [f.unknown, 'unknown'],
    ];
    return `<div class="fd-panel fd-finding">
      <h3>The finding</h3>
      <div class="fd-tiles">
        ${tiles.map(([n, l], i) => `<div><span class="fd-tile-n ${i === 1 ? 'fd-ok' : ''}">${n}</span><span class="fd-tile-l">${esc(l)}</span></div>`).join('')}
      </div>
      ${f.byTest?.length ? `<p class="fd-killed">Killed by: ${f.byTest.map((t) => `${esc(t.label.toLowerCase())} ${t.count}`).join(' · ')}.</p>` : ''}
      ${f.survived === 0
        ? `<p class="fd-verdict">Nothing survived. That is a finding, and the report is one page: not yet,
           and here is the order to fix it in. It is the one they remember when they are ready.</p>`
        : f.priced
          ? `<p class="fd-figure">${esc(money(f.low, a.currency))} – ${esc(money(f.high, a.currency))}</p>
             <p class="fd-figure-sub">annual cost of doing nothing · ±${a.band_pct}% band${
               f.suggestedCeiling !== null ? ` · sizing rule suggests committing no more than <b>${esc(money(f.suggestedCeiling, a.currency))}</b>` : ''}</p>`
          : `<p class="fd-warnbox">${f.unpriced} survivor${f.unpriced === 1 ? '' : 's'} missing frequency,
             elapsed minutes or a rate — so there is no figure yet. A partial sum would look like an
             estimate and be one short.</p>`}
    </div>`;
  }

  function workHtml(a, f, stageId) {
    if (stageId === 'observe') return `
      <div class="fd-panel">
        <div class="fd-grid">
          <label>Who you interviewed<input type="text" data-f="interviewee" value="${esc(a.interviewee || '')}"></label>
          <label>Their role<input type="text" data-f="interviewee_role" value="${esc(a.interviewee_role || '')}"></label>
          <label class="fd-wide">Recording link <span class="fd-hint">a pointer, not a paste</span>
            <input type="text" data-f="recording_url" value="${esc(a.recording_url || '')}"></label>
          <label class="fd-wide">What you saw <span class="fd-hint">in their words where you can</span>
            <textarea data-f="observation_note" rows="5">${esc(a.observation_note || '')}</textarea></label>
        </div>
        <button class="cx-btn cx-btn-primary" data-op="observe">Save</button>
      </div>`;

    if (stageId === 'analyse') return `
      ${a.candidates.length ? `<div class="fd-cands">${a.candidates.map((c, i) => candHtml(c, i, a)).join('')}</div>` : ''}
      <div class="fd-panel">
        <h3>Add a candidate</h3>
        <div class="fd-grid">
          <label class="fd-wide">Candidate<input type="text" data-f="name"></label>
          <label class="fd-wide">Their exact words <span class="fd-hint">quoted, not paraphrased</span>
            <textarea data-f="quote" rows="2"></textarea></label>
          <label>Who does it<input type="text" data-f="who"></label>
          <label>What triggers it<input type="text" data-f="trigger"></label>
          <label>Times per week<input type="text" data-f="frequency_per_week"></label>
          <label>Elapsed minutes each <span class="fd-hint">not touch time</span><input type="text" data-f="minutes_each"></label>
          <label>Loaded hourly rate<input type="text" data-f="loaded_rate"></label>
          <label>What it produces<input type="text" data-f="output"></label>
        </div>
        <div class="fd-tests">
          ${test('repeatable', 'Repeatable', 'Weekly or more, on a schedule or trigger?')}
          ${test('legible', 'Legible', 'Rules fit one page a new hire could follow?')}
          ${test('bounded', 'Bounded', 'A wrong output caught before a customer or a ledger?')}
        </div>
        <label class="fd-wide">Note <span class="fd-hint">for an unknown, write the question to ask</span>
          <textarea data-f="note" rows="2"></textarea></label>
        <button class="cx-btn cx-btn-primary" data-op="candidate">Add candidate</button>
        <p class="fd-note">The verdict is computed from the three tests, not chosen.</p>
      </div>`;

    if (stageId === 'price') return `
      <div class="fd-panel">
        <div class="fd-grid">
          <label>Confidence band ±% <span class="fd-hint">a range survives a finance director</span>
            <input type="text" data-f="band_pct" value="${esc(a.band_pct)}"></label>
          <label class="fd-wide">Rates and assumptions <span class="fd-hint">whose rates, supplied by whom</span>
            <textarea data-f="rates_note" rows="4">${esc(a.rates_note || '')}</textarea></label>
        </div>
        <button class="cx-btn cx-btn-primary" data-op="price">Save</button>
      </div>`;

    if (stageId === 'report') return `
      <div class="fd-panel">
        <div class="fd-grid">
          <label class="fd-wide">The first build — one, not five
            <span class="fd-hint">if you cannot choose one, Day 2 is not finished</span>
            <textarea data-f="first_build" rows="3">${esc(a.first_build || '')}</textarea></label>
          <label>What it costs<input type="text" data-f="first_build_cost" value="${esc(a.first_build_cost ?? '')}"></label>
          <label>Recommended ceiling
            <span class="fd-hint">${f.suggestedCeiling !== null ? `a quarter is ${esc(money(f.suggestedCeiling, a.currency))}` : 'zero where a prerequisite is missing'}</span>
            <input type="text" data-f="ceiling" value="${esc(a.ceiling ?? '')}"></label>
          <label class="fd-wide">Report notes<textarea data-f="report_note" rows="5">${esc(a.report_note || '')}</textarea></label>
        </div>
        <button class="cx-btn cx-btn-primary" data-op="report">Save</button>
      </div>`;

    if (stageId === 'decide') return `
      <div class="fd-panel">
        <label class="fd-wide">What they said<textarea data-f="decision_note" rows="3">${esc(a.decision_note || '')}</textarea></label>
        <div class="fd-decide">
          ${['proceed', 'later', 'declined'].map((d) => `
            <button class="cx-btn ${a.decision === d ? 'cx-btn-primary' : ''}" data-decide="${d}">${d}</button>`).join('')}
        </div>
        ${a.decided_at ? `<p class="fd-note">Decided ${esc(day(a.decided_at))}</p>` : ''}
      </div>`;

    return `
      <div class="fd-panel">
        <div class="fd-grid">
          <label>Realised value<input type="text" data-f="realised_value" value="${esc(a.realised_value ?? '')}"></label>
          <label class="fd-wide">What actually happened<textarea data-f="outcome_note" rows="4">${esc(a.outcome_note || '')}</textarea></label>
        </div>
        <button class="cx-btn cx-btn-primary" data-op="outcome">Save outcome</button>
      </div>

      <div class="fd-panel">
        <h3>Public track record</h3>
        <label class="fd-check"><input type="checkbox" data-f="is_public" ${a.is_public ? 'checked' : ''}>
          <span>Count this on the site. Adds one business and its industry to the public numbers — no name is published.</span></label>
        <label class="fd-wide">Reference quote<textarea data-f="quote" rows="3">${esc(a.reference_quote || '')}</textarea></label>
        <div class="fd-grid">
          <label>Who said it<input type="text" data-f="person" value="${esc(a.reference_person || '')}"></label>
          <label>Their role<input type="text" data-f="role" value="${esc(a.reference_role || '')}"></label>
        </div>
        <label class="fd-check"><input type="checkbox" data-f="consent" ${a.reference_consent_at ? 'checked' : ''}>
          <span>They agreed it may be published. Nothing appears without this, and unticking takes it down.</span></label>
        <label class="fd-wide">Who confirmed it, and how<input type="text" data-f="consent_by" value="${esc(a.reference_consent_by || '')}"></label>
        <button class="cx-btn cx-btn-primary" data-op="reference">Save</button>
      </div>`;
  }

  function candHtml(c, i, a) {
    const cost = costOf(c);
    const tone = c.verdict === 'pass' ? 'ok' : c.verdict === 'unknown' ? 'dim' : 'bad';
    return `<div class="fd-cand fd-cand--${tone}">
      <div class="fd-cand-head">
        <span class="fd-cand-name">${esc(c.name)}</span>
        <span class="fd-cand-verdict">${esc(c.verdict.replace('fails-', 'fails '))}</span>
        ${cost ? `<span class="fd-cand-cost">${esc(money(cost, a.currency))}/yr</span>` : ''}
        <button class="fd-drop" data-drop="${i}" title="Remove">×</button>
      </div>
      ${c.quote ? `<p class="fd-cand-quote">“${esc(c.quote)}”</p>` : ''}
      ${c.note ? `<p class="fd-cand-note">${esc(c.note)}</p>` : ''}
    </div>`;
  }

  function costOf(c) {
    const f = Number(c.frequency_per_week), m = Number(c.minutes_each), r = Number(c.loaded_rate);
    if (![f, m, r].every(Number.isFinite) || f <= 0 || m <= 0 || r <= 0) return 0;
    return f * 52 * (m / 60) * r;
  }

  /* Yes / no / unknown — never a two-state checkbox. "We did not ask" and "no"
     are different findings, and only one of them is a reason to decline. */
  function test(name, label, q) {
    return `<fieldset class="fd-test">
      <legend>${esc(label)}</legend>
      <p>${esc(q)}</p>
      <span>
        <label><input type="radio" name="fd_${name}" data-t="${name}" value="yes"> Yes</label>
        <label><input type="radio" name="fd_${name}" data-t="${name}" value="no"> No</label>
        <label><input type="radio" name="fd_${name}" data-t="${name}" value="" checked> Unknown</label>
      </span>
    </fieldset>`;
  }

  /* ── Wiring ───────────────────────────────────────────────────────────── */

  function collect(scope) {
    const out = {};
    scope.querySelectorAll('[data-f]').forEach((el) => {
      out[el.dataset.f] = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value;
    });
    scope.querySelectorAll('[data-t]:checked').forEach((el) => {
      out[el.dataset.t] = el.value || null;
    });
    return out;
  }

  function wire() {
    const root = $('tab-agents-fiveday');
    if (!root || root.dataset.wired) return;
    root.dataset.wired = '1';

    root.addEventListener('click', async (e) => {
      const openRow = e.target.closest('[data-open]');
      if (openRow) { void openAssessment(openRow.dataset.open); return; }

      if (e.target.closest('#fdBack')) { state.open = null; render(); return; }

      if (e.target.closest('#fdCreate')) {
        const name = $('fdNewName')?.value.trim();
        if (!name) { window.pgToast?.('A client name is required', 'error'); return; }
        try {
          const d = await api().postJson('/api/frictioniq/assessment', {
            client_name: name,
            sector: $('fdNewSector')?.value.trim() || null,
            country: $('fdNewCountry')?.value.trim() || null,
            currency: $('fdNewCurrency')?.value.trim() || 'USD',
            gate_token: $('fdNewGate')?.value.trim() || null,
          });
          await loadRegisterQuiet();
          if (d.id) void openAssessment(d.id);
        } catch (err) { window.pgToast?.(err.message, 'error'); }
        return;
      }

      const stage = e.target.closest('[data-stage]');
      if (stage) { void op({ op: 'stage', stage: stage.dataset.stage }); return; }

      const decide = e.target.closest('[data-decide]');
      if (decide) {
        const panel = decide.closest('.fd-panel');
        void op({ op: 'decide', decision: decide.dataset.decide, ...collect(panel) });
        return;
      }

      const drop = e.target.closest('[data-drop]');
      if (drop) { void op({ op: 'drop', index: Number(drop.dataset.drop) }); return; }

      const save = e.target.closest('[data-op]');
      if (save) {
        const panel = save.closest('.fd-panel');
        void op({ op: save.dataset.op, ...collect(panel) });
      }
    });
  }

  document.addEventListener('pg:tab-change', (e) => {
    if (e.detail?.tab !== 'agents-fiveday') return;
    wire();
    if (!state.loaded) void loadRegister();
  });

  window.PathGuruFiveDay = { loadRegister, openAssessment };
})();
