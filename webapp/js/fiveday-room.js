/* ══════════════════════════════════════════════════════════════════════════
   FIVE-DAY ASSESSMENT — Intelligence › Five-Day
   ══════════════════════════════════════════════════════════════════════════

   The published board, rendered in the console, with the register living
   inside it rather than beside it.

   HOW THE TWO JOIN. The board's arc has six steps. Five of them map onto a
   stage of an assessment record; Step 0 maps onto the readiness gate, which is
   its own register. So when a client is open, each step card grows a second
   half — that client's state for that step, and the inputs to change it. Step 2
   shows the three tests AND their candidate list. Step 3 shows the formula AND
   their figure. Nothing is in two places.

   With no client open the board is just the board: the method, readable
   end to end, which is what you want the night before a call.

   The playbook text lives in fiveday-playbook.js, verbatim from the board.
   This file renders it and never rewords it.

   The verdict on a candidate is computed by the server from the three tests.
   This file never sends one.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const state = { loaded: false, rows: [], life: null, open: null, busy: false, showStart: false, regError: null };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const api = () => window.PathGuruBackend;
  const pb = () => window.FIVE_DAY_PLAYBOOK;

  const money = (n, ccy) => {
    try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'USD', maximumFractionDigits: 0 }).format(n); }
    catch { return `${ccy || 'USD'} ${Math.round(n).toLocaleString('en-GB')}`; }
  };
  const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');

  /* ── Data ─────────────────────────────────────────────────────────────── */

  async function loadRegister(quiet) {
    try {
      const [d, life] = await Promise.all([
        api().apiFetch('/api/frictioniq/assessments', { timeoutMs: 15000 }),
        /* The lifecycle is the register an operator actually wants: every small
           business from the gate onward, not only the ones that reached an
           assessment. It is allowed to fail on its own without taking the
           assessment list with it. */
        api().apiFetch('/api/frictioniq/lifecycle', { timeoutMs: 15000 }).catch(() => null),
      ]);
      state.rows = d.assessments || [];
      state.life = life;
      state.regError = null;
      state.loaded = true;
      if (!quiet) render();
    } catch (e) {
      /* The board is static content and must still draw. A failed register
         read is one strip reporting a problem, not a blank room — the method
         is readable whether or not the database is reachable, and the night
         before a call that is the half you actually need. */
      state.regError = e.message;
      if (!quiet) render();
    }
  }

  async function openAssessment(id) {
    try {
      state.open = await api().apiFetch(`/api/frictioniq/assessment?id=${encodeURIComponent(id)}`, { timeoutMs: 15000 });
      render();
      $('fdTop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { window.pgToast?.(e.message, 'error'); }
  }

  async function op(body) {
    if (state.busy) return;
    state.busy = true;
    try {
      state.open = await api().postJson('/api/frictioniq/assessment/op', { ...body, id: state.open.assessment.id });
      void loadRegister(true);
      render();
    } catch (e) { window.pgToast?.(e.message, 'error'); }
    finally { state.busy = false; }
  }

  /* ── Render ───────────────────────────────────────────────────────────── */

  function render() {
    const host = $('fdBody');
    if (!host || !pb()) return;
    const p = pb();
    host.innerHTML =
      `<div id="fdTop"></div>` +
      headerHtml(p) +
      registerStripHtml() +
      arcHtml(p) +
      filterHtml(p) +
      toolchainHtml(p) +
      commitHtml(p) +
      ladderHtml(p) +
      retainerHtml(p) +
      demandHtml(p) +
      recordHtml(p) +
      changedHtml(p) +
      footerHtml(p);
  }

  function headerHtml(p) {
    return `<header class="fd-masthead">
      <div>
        <h2 class="fd-title">${esc(p.title)}</h2>
        <p class="fd-lede">${esc(p.lede)}</p>
        <p class="fd-attrib">${esc(p.attribution)}</p>
      </div>
      <aside class="fd-guarantee">
        <p class="fd-guarantee-label">${esc(p.guarantee.label)}</p>
        <p class="fd-guarantee-body">${esc(p.guarantee.body)}</p>
      </aside>
    </header>`;
  }

  /* The register, as a strip rather than a screen. Open a client and the arc
     below fills with their work; close it and the board reads as the method. */
  function registerStripHtml() {
    const a = state.open?.assessment;
    const f = state.open?.finding;

    if (state.regError) {
      return `<div class="fd-strip fd-strip--bad">
        <span class="fd-strip-label">The register</span>
        <span class="fd-strip-meta">unavailable — ${esc(state.regError)}${
          /table|relation|schema/i.test(state.regError) ? '. Run 0024_assessment_5d.sql.' : ''}</span>
        <button class="cx-btn" id="fdRetry">Retry</button>
      </div>`;
    }

    if (a) {
      return `<div class="fd-strip fd-strip--open">
        <div>
          <span class="fd-strip-client">${esc(a.client_name)}</span>
          <span class="fd-strip-meta">${[a.sector, a.headcount_band, a.country, a.currency].filter(Boolean).map(esc).join(' · ')}</span>
        </div>
        <span class="fd-strip-finding">${f.listed
          ? `${f.listed} listed · <b>${f.survived}</b> survived · ${f.killed} killed${
              f.priced ? ` · ${esc(money(f.low, a.currency))}–${esc(money(f.high, a.currency))}` : ''}`
          : 'no candidates yet'}</span>
        <button class="cx-btn" id="fdClose">Close client</button>
      </div>`;
    }

    const rows = state.rows;
    return `<div class="fd-strip">
      <span class="fd-strip-label">The register</span>
      <span class="fd-strip-meta">${lifecycleSummary(rows)}</span>
      <button class="cx-btn" id="fdToggleStart">${state.showStart ? 'Cancel' : 'Start one'}</button>
    </div>

    ${lifecycleHtml()}

    ${state.showStart ? `<div class="fd-panel fd-start">
      <div class="fd-grid">
        <label>Client<input type="text" id="fdNewName" placeholder="Who"></label>
        <label>Sector<input type="text" id="fdNewSector"></label>
        <label>Country<input type="text" id="fdNewCountry"></label>
        <label>Currency<input type="text" id="fdNewCurrency" value="USD"></label>
        <label>Gate token <span class="fd-hint">if they passed Step 0</span><input type="text" id="fdNewGate"></label>
      </div>
      <button class="cx-btn cx-btn-primary" id="fdCreate">Start · Step 1</button>
    </div>` : ''}`;
  }


  /* ── The lifecycle register ─────────────────────────────────────────────
     Every small business from the gate onward, not only the ones that reached
     an assessment. The gate is served exclusively to firms under fifty staff, so
     this cannot fill with mid-market prospects — they are a different
     instrument with a different register. */

  function lifecycleSummary(rows) {
    const l = state.life;
    if (!l) return rows.length ? `${rows.length} assessment${rows.length === 1 ? '' : 's'}` : 'nothing in flight';
    const f = l.funnel;
    if (!f.took && !rows.length) return 'nothing in the funnel yet';
    /* Counts, not rates. A percentage on four rows is theatre; the ratio is
       shown only once there are ten passes to divide by. */
    const rate = l.enoughToRate && f.passed
      ? ` · ${Math.round((f.booked / f.passed) * 100)}% of passes booked`
      : '';
    return `${f.took} took the gate · ${f.passed} passed · ${f.booked} booked · ${f.assessed} assessed · ${f.proceeded} proceeding${rate}`;
  }

  function lifecycleHtml() {
    const l = state.life;
    if (!l) return '';
    if (!l.rows.length) {
      return `<p class="fd-live-text fd-dim">Nothing in the funnel yet. It fills from
        <a href="https://www.digitafusion.com/diagnostic" target="_blank" rel="noopener">the three questions</a>
        — a business under fifty staff answers them, and the row appears here whether they pass or not.</p>`;
    }

    const degraded = Object.entries(l.degraded || {}).filter(([, bad]) => bad).map(([k]) => k);

    return `${degraded.length ? `<p class="fd-live-text fd-warn">Could not read: ${degraded.join(', ')} —
      those columns are blank rather than wrong.</p>` : ''}
      <div class="fd-table-wrap"><table class="cx-table fd-table">
      <thead><tr>
        <th>Business</th><th>Stage</th><th>Gate</th><th>Booked</th><th>Assessment</th><th>Finding</th><th>Agent</th><th>Framework</th><th>Amount</th><th>Last</th><th></th>
      </tr></thead>
      <tbody>${l.rows.map((r) => `
        <tr class="${r.assessmentId ? 'fd-row' : ''}" ${r.assessmentId ? `data-open="${esc(r.assessmentId)}"` : ''}>
          <td>${r.anonymous
            ? `<span class="fd-dim">unnamed</span> <span class="fd-tag">${esc(r.enteredVia)}</span>`
            : `<span class="fd-client">${esc(r.name)}</span>`}
            ${r.sector ? `<span class="fd-sub">${esc(r.sector)}</span>` : ''}</td>
          <td><span class="fd-stage fd-stage--${esc(r.stage)}">${esc(stageLabel(r.stage))}</span></td>
          <td>${r.gateVerdict
            ? `${esc(r.gateVerdict)} <span class="fd-dim">${esc(r.gateTotal)}</span>${
                r.gateBlocked.length ? `<span class="fd-sub">missing: ${r.gateBlocked.map(esc).join(', ')}</span>` : ''}`
            : '<span class="fd-dim">direct</span>'}</td>
          <td>${r.bookedAt ? esc(day(r.bookedAt)) : '<span class="fd-dim">—</span>'}</td>
          <td>${r.assessmentStage ? esc(stepLabelFor(r.assessmentStage)) : '<span class="fd-dim">—</span>'}</td>
          <td>${r.finding && r.finding.listed
            ? `${r.finding.listed} / <span class="fd-ok">${r.finding.survived}</span> / ${r.finding.killed}${
                r.finding.priced ? `<span class="fd-sub">${esc(money(r.finding.low, r.currency))}–${esc(money(r.finding.high, r.currency))}</span>` : ''}`
            : '<span class="fd-dim">—</span>'}
            ${r.decision ? `<span class="fd-sub">${esc(r.decision)}</span>` : ''}</td>
          <td>${r.assignedAgent ? esc(r.assignedAgent) : '<span class="fd-dim">—</span>'}</td>
          <td>${r.frameworkId ? esc(r.frameworkId) : '<span class="fd-dim">—</span>'}</td>
          <td>${r.serviceAmount ? esc(money(r.serviceAmount, r.serviceCurrency)) : '<span class="fd-dim">—</span>'}</td>
          <td>${esc(day(r.lastAt))}</td>
          <td>${r.assessmentId ? `<button class="cx-btn cx-btn-danger cx-btn-sm" data-del="${esc(r.assessmentId)}" title="Delete this five-day assessment record">Delete</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>

      <div class="fd-stagekey">${l.stages.map((st) =>
        `<span title="${esc(st.blurb)}"><b>${l.byStage[st.id] || 0}</b> ${esc(st.label.toLowerCase())}</span>`).join('')}</div>`;
  }

  function stageLabel(id) {
    return (state.life?.stages || []).find((s) => s.id === id)?.label || id;
  }

  function stepLabelFor(stage) {
    const s = pb().arc.steps.find((x) => x.stage === stage);
    return s ? `${s.n} · ${s.title}` : (stage === 'closed' ? 'Closed' : stage || '—');
  }

  /* ── The arc ──────────────────────────────────────────────────────────── */

  function arcHtml(p) {
    const a = state.open?.assessment;
    return band(p.arc.label, p.arc.sub, `<div class="fd-arc">
      ${p.arc.steps.map((s) => {
        const isNow = a && s.stage && a.stage === s.stage;
        return `<article class="fd-step ${isNow ? 'now' : ''}">
          <div class="fd-step-head">
            <span class="fd-step-n">${esc(s.n)}</span>
            <span class="fd-step-time">${esc(s.time)}</span>
          </div>
          <h4 class="fd-step-title">${esc(s.title)}</h4>
          <p class="fd-step-line">${esc(s.line)}</p>
          ${s.blocks.map(blockHtml).join('')}
          ${a ? clientHalf(s, a) : ''}
        </article>`;
      }).join('')}
    </div>`);
  }

  function blockHtml(b) {
    if (b.formula) return `<p class="fd-formula">${esc(b.formula)}</p>`;
    /* OUT is what the step produces and WATCH is how it fails. The board gives
       each its own treatment — one boxed, one in the page's only red — because
       an operator mid-call is scanning for exactly those two. */
    const kind = /^out$/i.test(b.label) ? ' fd-block--out'
      : /^watch$/i.test(b.label) ? ' fd-block--watch' : '';
    return `<div class="fd-block${kind}">
      <p class="fd-block-label">${esc(b.label)}</p>
      ${b.items ? `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
                : `<p class="fd-block-text">${esc(b.text)}</p>`}
    </div>`;
  }

  /* The client's own half of a step card — state, then the inputs that change
     it. Absent entirely when no client is open, so the board stays a board. */
  function clientHalf(s, a) {
    const f = state.open.finding;
    const act = (op, label, extra = '') =>
      `<div class="fd-live-actions">${extra}<button class="cx-btn cx-btn-primary" data-op="${op}">${label}</button></div>`;

    if (!s.stage) {
      /* Step 0 — the gate is its own register; shown, never edited here. */
      return `<div class="fd-live">
        <p class="fd-live-label">This client</p>
        ${a.gate_token
          ? `<p class="fd-live-text">Came through the gate ·
             <a href="https://www.digitafusion.com/diagnostic/g/${esc(a.gate_token)}" target="_blank" rel="noopener">see their answers</a></p>`
          : `<p class="fd-live-text fd-dim">No gate token on this record. If they passed the three questions, paste the token when starting — it is what makes the gate's conversion rate mean anything.</p>`}
      </div>`;
    }

    const head = `<p class="fd-live-label">This client${a.stage === s.stage ? ' · current step' : ''}</p>`;

    if (s.stage === 'observe') return `<div class="fd-live">${head}
      <div class="fd-grid">
        <label>Interviewed<input type="text" data-f="interviewee" value="${esc(a.interviewee || '')}"></label>
        <label>Their role<input type="text" data-f="interviewee_role" value="${esc(a.interviewee_role || '')}"></label>
        <label class="fd-wide">Recording link<input type="text" data-f="recording_url" value="${esc(a.recording_url || '')}"></label>
        <label class="fd-wide">What you saw<textarea data-f="observation_note" rows="4">${esc(a.observation_note || '')}</textarea></label>
      </div>${act('observe', 'Save')}</div>`;

    if (s.stage === 'analyse') return `<div class="fd-live">${head}
      ${a.candidates.length ? `<div class="fd-cands">${a.candidates.map((c, i) => candHtml(c, i, a)).join('')}</div>`
        : '<p class="fd-live-text fd-dim">No candidates listed yet. No target number — the count has to be free to come out at zero.</p>'}
      ${f.byTest?.length ? `<p class="fd-live-text">Killed by: ${f.byTest.map((t) => `${esc(t.label.toLowerCase())} ${t.count}`).join(' · ')}.</p>` : ''}
      <details class="fd-add"><summary>Add a candidate</summary>
        <div class="fd-grid">
          <label class="fd-wide">Candidate<input type="text" data-f="name"></label>
          <label class="fd-wide">Their exact words<textarea data-f="quote" rows="2"></textarea></label>
          <label>Who does it<input type="text" data-f="who"></label>
          <label>What triggers it<input type="text" data-f="trigger"></label>
          <label>Times per week<input type="text" data-f="frequency_per_week"></label>
          <label>Elapsed minutes<input type="text" data-f="minutes_each"></label>
          <label>Loaded rate<input type="text" data-f="loaded_rate"></label>
          <label>What it produces<input type="text" data-f="output"></label>
        </div>
        <div class="fd-tests">${pb().filter.tests.map(testInput).join('')}</div>
        <label class="fd-wide">Note <span class="fd-hint">for an unknown, write the question to ask</span>
          <textarea data-f="note" rows="2"></textarea></label>
        ${act('candidate', 'Add candidate')}
        <p class="fd-note">The verdict is computed from the three tests, not chosen.</p>
      </details></div>`;

    if (s.stage === 'price') return `<div class="fd-live">${head}
      ${f.survived === 0
        ? '<p class="fd-live-text fd-dim">Nothing has survived the filter, so there is nothing to price. That is a finding.</p>'
        : f.priced
          ? `<p class="fd-figure">${esc(money(f.low, a.currency))} – ${esc(money(f.high, a.currency))}</p>
             <p class="fd-figure-sub">across ${f.survived} survivor${f.survived === 1 ? '' : 's'} · ±${a.band_pct}%${
               f.suggestedCeiling !== null ? ` · a quarter is <b>${esc(money(f.suggestedCeiling, a.currency))}</b>` : ''}</p>`
          : `<p class="fd-warnbox">${f.unpriced} survivor${f.unpriced === 1 ? '' : 's'} missing frequency, elapsed minutes or a rate — no figure yet. A partial sum would look like an estimate and be one short.</p>`}
      <div class="fd-grid">
        <label>Band ±%<input type="text" data-f="band_pct" value="${esc(a.band_pct)}"></label>
        <label class="fd-wide">Rates and assumptions<textarea data-f="rates_note" rows="3">${esc(a.rates_note || '')}</textarea></label>
      </div>${act('price', 'Save')}</div>`;

    if (s.stage === 'report') return `<div class="fd-live">${head}
      <div class="fd-grid">
        <label class="fd-wide">The first build — one, not five<textarea data-f="first_build" rows="3">${esc(a.first_build || '')}</textarea></label>
        <label>What it costs<input type="text" data-f="first_build_cost" value="${esc(a.first_build_cost ?? '')}"></label>
        <label>Ceiling <span class="fd-hint">${f.suggestedCeiling !== null ? `a quarter is ${esc(money(f.suggestedCeiling, a.currency))}` : 'zero where a prerequisite is missing'}</span>
          <input type="text" data-f="ceiling" value="${esc(a.ceiling ?? '')}"></label>
        <label class="fd-wide">Report notes<textarea data-f="report_note" rows="4">${esc(a.report_note || '')}</textarea></label>
      </div>${act('report', 'Save')}</div>`;

    if (s.stage === 'decide') return `<div class="fd-live">${head}
      <label class="fd-wide">What they said<textarea data-f="decision_note" rows="3">${esc(a.decision_note || '')}</textarea></label>
      <div class="fd-decide">${['proceed', 'later', 'declined'].map((d) =>
        `<button class="cx-btn ${a.decision === d ? 'cx-btn-primary' : ''}" data-decide="${d}">${d}</button>`).join('')}</div>
      ${a.decided_at ? `<p class="fd-note">Decided ${esc(day(a.decided_at))}</p>` : ''}
      <details class="fd-add"><summary>Day 90 · outcome, and the public track record</summary>
        <div class="fd-grid">
          <label>Realised value<input type="text" data-f="realised_value" value="${esc(a.realised_value ?? '')}"></label>
          <label class="fd-wide">What actually happened<textarea data-f="outcome_note" rows="3">${esc(a.outcome_note || '')}</textarea></label>
        </div>${act('outcome', 'Save outcome')}
      </details>
      <details class="fd-add"><summary>Consent and the public count</summary>
        <label class="fd-check"><input type="checkbox" data-f="is_public" ${a.is_public ? 'checked' : ''}>
          <span>Count this on the site. Adds one business and its industry to the public numbers — no name is published.</span></label>
        <label class="fd-wide">Reference quote<textarea data-f="quote" rows="3">${esc(a.reference_quote || '')}</textarea></label>
        <div class="fd-grid">
          <label>Who said it<input type="text" data-f="person" value="${esc(a.reference_person || '')}"></label>
          <label>Their role<input type="text" data-f="role" value="${esc(a.reference_role || '')}"></label>
        </div>
        <label class="fd-check"><input type="checkbox" data-f="consent" ${a.reference_consent_at ? 'checked' : ''}>
          <span>They agreed it may be published. Nothing appears without this; unticking takes it down.</span></label>
        <label class="fd-wide">Who confirmed it, and how<input type="text" data-f="consent_by" value="${esc(a.reference_consent_by || '')}"></label>
        ${act('reference', 'Save')}
      </details></div>`;

    return '';
  }

  function candHtml(c, i, a) {
    const cost = costOf(c);
    const tone = c.verdict === 'pass' ? 'ok' : c.verdict === 'unknown' ? 'dim' : 'bad';
    return `<div class="fd-cand fd-cand--${tone}">
      <div class="fd-cand-head">
        <span class="fd-cand-name">${esc(c.name)}</span>
        <span class="fd-cand-verdict">${esc(String(c.verdict).replace('fails-', 'fails '))}</span>
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

  /* Yes / no / unknown. Not a checkbox: "we did not ask" and "no" are
     different findings, and only one of them declines a candidate. */
  function testInput(t) {
    return `<fieldset class="fd-test">
      <legend>${esc(t.name)}</legend>
      <p>${esc(t.q)}</p>
      <span>
        <label><input type="radio" name="fd_${t.id}" data-t="${t.id}" value="yes"> Yes</label>
        <label><input type="radio" name="fd_${t.id}" data-t="${t.id}" value="no"> No</label>
        <label><input type="radio" name="fd_${t.id}" data-t="${t.id}" value="" checked> Unknown</label>
      </span>
    </fieldset>`;
  }

  /* ── The reference bands ──────────────────────────────────────────────── */

  /* The board opens every band with a monospaced marker, its subtitle beside
     it, and a rule running out to the right margin. A serif headline instead
     reads as a chapter of a book; this reads as an instrument, which is what
     the thing is. */
  const band = (label, sub, inner) => `<section class="fd-band">
    <div class="fd-band-head">
      <span class="fd-band-label">${esc(label)}</span>
      ${sub ? `<span class="fd-band-sub">${esc(sub)}</span>` : ''}
      <span class="fd-band-rule" aria-hidden="true"></span>
    </div>
    ${inner}</section>`;

  const cardGrid = (cards, cols) => `<div class="fd-cards${cols === 4 ? ' fd-cards--4' : ''}">${cards.map((c) => `
    <div class="fd-card">
      <p class="fd-card-kicker">${esc(c.kicker)}</p>
      <h4>${esc(c.title)}</h4>
      ${c.body ? `<p>${esc(c.body)}</p>` : ''}
      ${c.items ? `<ul>${c.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
      ${c.note ? `<p class="fd-card-note">${esc(c.note)}</p>` : ''}
      ${c.watch ? `<p class="fd-card-watch"><b>Watch</b> ${esc(c.watch)}</p>` : ''}
    </div>`).join('')}</div>`;

  const table = (head, rows) => `<div class="fd-table-wrap"><table class="cx-table fd-table">
    <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) =>
      `<td${i === 0 ? ' class="fd-td-lead"' : ''}>${esc(c) || '<span class="fd-dim">—</span>'}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;

  function filterHtml(p) {
    return band(p.filter.label, p.filter.sub, `<div class="fd-cards">
      ${p.filter.tests.map((t) => `<div class="fd-card fd-card--test">
        <p class="fd-card-kicker">${esc(t.n)}</p>
        <h4>${esc(t.name)}</h4>
        <p>${esc(t.q)}</p>
        <p class="fd-card-watch"><b>On failure</b> ${esc(t.fail)}</p>
      </div>`).join('')}</div>`);
  }

  function toolchainHtml(p) {
    return band(p.toolchain.label, p.toolchain.sub, `<div class="fd-cards fd-cards--4">
      ${p.toolchain.items.map((t) => `<div class="fd-card">
        <p class="fd-card-kicker">${esc(t.phase)}<span>${esc(t.step)}</span></p>
        <h4>${esc(t.name)}</h4>
        <p>${esc(t.line)}</p>
        ${t.note ? `<p class="fd-card-note">${esc(t.note)}</p>` : ''}
        ${t.watch ? `<p class="fd-card-watch"><b>Watch</b> ${esc(t.watch)}</p>` : ''}
      </div>`).join('')}</div>`);
  }

  const commitHtml = (p) => band(p.commit.label, p.commit.sub, cardGrid(p.commit.cards));

  function ladderHtml(p) {
    return band(p.ladder.label, p.ladder.sub,
      table(p.ladder.head, p.ladder.rows) + cardGrid(p.ladder.cards));
  }

  const retainerHtml = (p) => band(p.retainer.label, p.retainer.sub, cardGrid(p.retainer.cards));

  /* Four across, the way the board ranks them. A vertical list buries the
     point, which is that the two highest-leverage channels are the two almost
     nobody works — you only see that when all seven are on screen together. */
  function demandHtml(p) {
    return band(p.demand.label, p.demand.sub, `<ol class="fd-demand">
      ${p.demand.rows.map((r) => `<li class="${r.beware ? 'beware' : ''}">
        <div class="fd-demand-head">
          <span class="fd-rank">${esc(r.rank)}</span>
          <span class="fd-tier">${esc(r.tier)}</span>
        </div>
        <h4>${esc(r.name)}</h4>
        <p class="fd-demand-line">${esc(r.line)}</p>
        <p class="fd-demand-body">${esc(r.body)}</p>
      </li>`).join('')}</ol>`);
  }

  function recordHtml(p) {
    return band(p.record.label, p.record.sub,
      table(p.record.head, p.record.rows) + cardGrid(p.record.cards));
  }

  function changedHtml(p) {
    return band(p.changed.label, p.changed.sub, `<ul class="fd-changed">
      ${p.changed.rows.map((r) => `<li class="fd-changed--${esc(r.kind.toLowerCase())}">
        <h4><span class="fd-changed-kind">${esc(r.kind)}</span> · ${esc(r.title)}</h4>
        <p>${esc(r.body)}</p></li>`).join('')}</ul>`);
  }

  const footerHtml = (p) => `<footer class="fd-footer">${p.footer.map((l) => `<p>${esc(l)}</p>`).join('')}</footer>`;

  /* ── Wiring ───────────────────────────────────────────────────────────── */

  function collect(scope) {
    const out = {};
    scope.querySelectorAll('[data-f]').forEach((el) => {
      out[el.dataset.f] = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value;
    });
    scope.querySelectorAll('[data-t]:checked').forEach((el) => { out[el.dataset.t] = el.value || null; });
    return out;
  }

  function wire() {
    const root = $('tab-frictioniq-fiveday');
    if (!root || root.dataset.wired) return;
    root.dataset.wired = '1';

    root.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        if (!window.confirm('Delete this five-day assessment record? This cannot be undone.')) return;
        try {
          await api().apiFetch(`/api/frictioniq/assessment?id=${encodeURIComponent(del.dataset.del)}`, { method: 'DELETE' });
          window.pgToast?.('Assessment deleted', 'success');
          state.open = null;
          await loadRegister(true);
          render();
        } catch (err) { window.pgToast?.(err.message, 'error'); }
        return;
      }
      const openRow = e.target.closest('[data-open]');
      if (openRow) { void openAssessment(openRow.dataset.open); return; }
      if (e.target.closest('#fdClose')) { state.open = null; render(); return; }
      if (e.target.closest('#fdRetry')) { void loadRegister(); return; }
      if (e.target.closest('#fdToggleStart')) { state.showStart = !state.showStart; render(); return; }

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
          state.showStart = false;
          await loadRegister(true);
          if (d.id) void openAssessment(d.id);
        } catch (err) { window.pgToast?.(err.message, 'error'); }
        return;
      }

      const decide = e.target.closest('[data-decide]');
      if (decide) {
        void op({ op: 'decide', decision: decide.dataset.decide, ...collect(decide.closest('.fd-live')) });
        return;
      }
      const drop = e.target.closest('[data-drop]');
      if (drop) { void op({ op: 'drop', index: Number(drop.dataset.drop) }); return; }

      const save = e.target.closest('[data-op]');
      if (save) {
        /* Scope to the nearest details block when there is one, so the
           consent form and the outcome form do not post each other's fields. */
        const scope = save.closest('details') || save.closest('.fd-live');
        void op({ op: save.dataset.op, ...collect(scope) });
      }
    });

    /* Clicking a step card moves the client to that step — the rail and the
       board are the same object, so there is no separate stage control. */
    root.addEventListener('dblclick', (e) => {
      const card = e.target.closest('.fd-step');
      if (!card || !state.open) return;
      const idx = [...root.querySelectorAll('.fd-step')].indexOf(card);
      const stage = pb().arc.steps[idx]?.stage;
      if (stage && stage !== state.open.assessment.stage) void op({ op: 'stage', stage });
    });
  }

  document.addEventListener('pg:tab-change', (e) => {
    if (e.detail?.tab !== 'frictioniq-fiveday') return;
    wire();
    if (!state.loaded) void loadRegister(); else render();
  });

  window.PathGuruFiveDay = { loadRegister, openAssessment };
})();
