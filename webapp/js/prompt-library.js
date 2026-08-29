/* ══════════════════════════════════════════════════════════════════════════
   PROMPT LIBRARY — Intelligence › Prompt Library
   ══════════════════════════════════════════════════════════════════════════

   The operator's library, in the console: search, category chips, cards, and a
   composer that assembles a prompt + an industry block + the clauses the stakes
   justify. Plus the registry — edit a prompt here, keep its history, and see
   which prompts you actually use.

   FOUR DECISIONS WORTH KNOWING, BECAUSE EACH ONE WAS A CHOICE.

   1. THE LIBRARY IS FETCHED ONCE, FILTERED IN THE BROWSER. Seventy-two prompts
      is a few hundred KB and search should feel instant. The API supports ?q=
      for anything that later needs it (Slack), but a round trip per keystroke
      buys nothing here.

   2. COMPOSITION HAPPENS ON THE SERVER, NEVER HERE. It would be four lines to
      concatenate the strings in this file. Then the console and the API would
      each have their own assembler and they would drift — different section
      order, different clause order, and two prompts that look the same but are
      not. One composer, one output. See backend/prompts/compose.js.

   3. UNFILLED VARIABLES ARE SHOWN, NOT HIDDEN. A `{{VAR}}` that reaches a model
      reads as an instruction to invent something. The composer names every one
      still standing, above the output, every time — and gives you a box for it.

   4. USAGE IS RECORDED ON COPY, NOT ON COMPOSE. The composer re-assembles on
      every keystroke; counting that would measure typing. A copy is the moment
      the prompt leaves the console and goes to work.

   OPERATOR-FACING TODAY. Nothing in this room touches any agent's live prompt.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const PIN_KEY    = 'pg_prompt_pins';
  const RECENT_KEY = 'pg_prompt_recent';
  const MAX_RECENT = 6;

  const state = {
    loaded:   false,
    loading:  false,
    prompts:  [],
    categories: [],
    industries: [],
    clauses:  [],
    presets:  {},
    registry: {},        // id → { liveVersion, audience, updatedAt, updatedBy }
    usage:    {},        // id → copies in the window
    usageDays: 60,
    query:    '',
    category: null,
    selected: null,      // prompt object
    vars:     {},        // { NAME: value } for the selected prompt
    industry: '',
    active:   new Set(), // clause ids
    composed: null,      // { text, unfilled, used, version, origin }
    composeSeq: 0,
    fields:   [],        // variable names with an input box, in order
    tab:      'compose', // compose | source | history
    history:  null,      // { versions, live, seedBody } for the selected prompt
    editBody: '',
  };

  const $  = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const when = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  function readSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
    catch { return new Set(); }
  }
  function readList(key) {
    try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
    catch { return []; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  }

  /* ── Load ─────────────────────────────────────────────────────────────── */

  async function load(force = false) {
    if ((state.loaded && !force) || state.loading) return;
    state.loading = true;
    const grid = $('plGrid');
    if (grid && !state.loaded) grid.innerHTML = '<div class="pl-loading"><div class="agents-spinner"></div><span>Loading library…</span></div>';
    try {
      const data = await window.PathGuruBackend.apiFetch('/api/prompts');
      state.prompts    = data.prompts    || [];
      state.categories = data.categories || [];
      state.industries = data.industries || [];
      state.clauses    = data.clauses    || [];
      state.presets    = data.presets    || {};
      state.registry   = data.registry   || {};
      state.usage      = data.usage      || {};
      state.usageDays  = data.usageDays  || 60;
      state.loaded = true;
      renderChips();
      renderGrid();
      renderCount();
    } catch (e) {
      if (grid) {
        grid.innerHTML = `<div class="pl-error">Could not load the prompt library — ${esc(e.message)}.<br>
          The backend must be running and this console signed in.</div>`;
      }
    } finally {
      state.loading = false;
    }
  }

  function renderCount() {
    const count = $('plCount');
    if (!count) return;
    const edited = Object.values(state.registry).filter((r) => r.liveVersion).length;
    const copies = Object.values(state.usage).reduce((a, b) => a + b, 0);
    count.textContent =
      `${state.prompts.length} prompts · ${state.industries.length} blocks · ${state.clauses.length} clauses` +
      (edited ? ` · ${edited} edited` : '') +
      (copies ? ` · ${copies} cop${copies === 1 ? 'y' : 'ies'}/${state.usageDays}d` : '');
  }

  /* ── Filtering ────────────────────────────────────────────────────────── */

  function visible() {
    const q = state.query.trim().toLowerCase();
    return state.prompts.filter((p) => {
      if (state.category && p.category !== state.category) return false;
      if (!q) return true;
      const cat = state.categories.find((c) => c.id === p.category)?.name || '';
      return `${p.title} ${p.when} ${p.note || ''} ${p.body} ${cat}`.toLowerCase().includes(q);
    });
  }

  const hueOf  = (id) => state.categories.find((c) => c.id === id)?.hue || '#2e3d57';
  const catName = (id) => state.categories.find((c) => c.id === id)?.name || id;

  /* ── Render: chips ────────────────────────────────────────────────────── */

  function renderChips() {
    const wrap = $('plChips');
    if (!wrap) return;
    const all = `
      <button type="button" class="pl-chip ${state.category ? '' : 'active'}" data-cat="">
        All <span class="pl-chip-n">${state.prompts.length}</span>
      </button>`;
    wrap.innerHTML = all + state.categories.map((c) => `
      <button type="button" class="pl-chip ${state.category === c.id ? 'active' : ''}" data-cat="${esc(c.id)}">
        <span class="pl-chip-dot" style="background:${esc(c.hue)}"></span>
        ${esc(c.name)} <span class="pl-chip-n">${c.count}</span>
      </button>`).join('');
  }

  /* ── Render: grid ─────────────────────────────────────────────────────── */

  function cardHtml(p, pins) {
    const vars = (p.variables || []).length;
    const reg  = state.registry[p.id];
    const uses = state.usage[p.id] || 0;
    return `
      <div class="pl-card ${state.selected?.id === p.id ? 'selected' : ''}"
           style="--pl-hue:${esc(hueOf(p.category))}"
           data-id="${esc(p.id)}" role="button" tabindex="0">
        <span class="pl-card-cat">
          <span class="pl-chip-dot" style="background:${esc(hueOf(p.category))}"></span>
          ${esc(catName(p.category))}
          ${reg?.liveVersion ? `<span class="pl-edited" title="Overridden in the registry — v${reg.liveVersion}">v${reg.liveVersion}</span>` : ''}
        </span>
        <h4 class="pl-card-title">${esc(p.title)}</h4>
        <p class="pl-card-when">${esc(p.when)}</p>
        <div class="pl-card-foot">
          <span class="pl-var-badge">${vars} variable${vars === 1 ? '' : 's'}</span>
          ${uses ? `<span class="pl-uses" title="Copied ${uses} time${uses === 1 ? '' : 's'} in the last ${state.usageDays} days">${uses}×</span>` : ''}
          <button type="button" class="pl-pin ${pins.has(p.id) ? 'on' : ''}"
                  data-pin="${esc(p.id)}" title="${pins.has(p.id) ? 'Unpin' : 'Pin to the top'}"
                  aria-label="Pin ${esc(p.title)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="${pins.has(p.id) ? 'currentColor' : 'none'}"
                 stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  function renderGrid() {
    const grid = $('plGrid');
    if (!grid) return;
    const pins = readSet(PIN_KEY);
    const list = visible();

    if (!list.length) {
      grid.innerHTML = `<div class="pl-empty">Nothing matches “${esc(state.query)}”. Try a shorter word — the search reads the prompt body too.</div>`;
      return;
    }

    const pinned = list.filter((p) => pins.has(p.id));
    const rest   = list.filter((p) => !pins.has(p.id));

    /* Recents only when the operator is not narrowing — once you have typed a
       query or picked a category, the answer you want is the filtered set, not
       a row of things you happened to open yesterday. */
    let recentHtml = '';
    if (!state.query && !state.category) {
      /* The prompt currently open is excluded. It is on screen in the
         composer; repeating it under "recently used" directly above the same
         card in the main list reads as a rendering fault, not a shortcut. */
      const recents = readList(RECENT_KEY)
        .map((id) => state.prompts.find((p) => p.id === id))
        .filter((p) => p && !pins.has(p.id) && p.id !== state.selected?.id)
        .slice(0, MAX_RECENT);
      if (recents.length) {
        recentHtml = `<p class="pl-section-label">Recently used</p>` +
          recents.map((p) => cardHtml(p, pins)).join('');
      }
    }

    grid.innerHTML =
      (pinned.length ? `<p class="pl-section-label">Pinned</p>` + pinned.map((p) => cardHtml(p, pins)).join('') : '') +
      recentHtml +
      ((pinned.length || recentHtml) ? `<p class="pl-section-label">${state.category ? esc(catName(state.category)) : 'All prompts'}</p>` : '') +
      rest.map((p) => cardHtml(p, pins)).join('');
  }

  /* ── Fields ───────────────────────────────────────────────────────────── */

  /* Long values need a textarea. A one-line input for {{PASTE FULL TRANSCRIPT}}
     is the kind of small wrongness that makes an instrument feel unfinished. */
  const LONG = /(PASTE|TRANSCRIPT|LIST|BODY|THREAD|NOTES|DRAFT|CONTENT|MESSAGE|SUMMARY|DATA|TABLE|EXCERPT|FULL)/i;
  const isLong = (name) => LONG.test(name) || name.length > 22;

  function fieldHtml(name, fromContext) {
    const value = state.vars[name] ?? '';
    const id = `plVar_${name.replace(/[^A-Za-z0-9]/g, '_')}`;
    return `
      <div class="pl-field" data-field="${esc(name)}">
        <label for="${esc(id)}">${esc(name)}${fromContext ? ' <span class="pl-from">from the context block</span>' : ''}</label>
        ${isLong(name)
          ? `<textarea id="${esc(id)}" data-var="${esc(name)}" rows="4" spellcheck="false" placeholder="Paste it here">${esc(value)}</textarea>`
          : `<input id="${esc(id)}" data-var="${esc(name)}" type="text" value="${esc(value)}" spellcheck="false" />`}
      </div>`;
  }

  /**
   * Grow the field list to cover variables the ASSEMBLED text still carries.
   *
   * THE BUG THIS FIXES, because it is worth remembering. The composer used to
   * build one input per variable in the prompt body — and nothing else. But an
   * industry block declares its own ({{NAME}}, {{JURISDICTION}}, {{PRACTICE
   * AREAS}}), and so do some clauses. So attaching the legal-services block
   * produced a warning naming seven unfilled variables the operator had no box
   * to fill them in. A warning with no remedy beside it is worse than no
   * warning: it teaches you to ignore the warning.
   *
   * The fields are appended rather than re-rendered, so a variable arriving
   * mid-composition never steals focus from whatever is being typed.
   */
  function mergeFields(unfilled) {
    const host = $('plFields');
    if (!host || !unfilled?.length) return;
    const added = unfilled.filter((n) => !state.fields.includes(n));
    if (!added.length) return;
    state.fields.push(...added);
    host.insertAdjacentHTML('beforeend', added.map((n) => fieldHtml(n, true)).join(''));
    host.closest('.pl-group')?.removeAttribute('hidden');
    const label = $('plFieldsCount');
    if (label) label.textContent = `${state.fields.length} variable${state.fields.length === 1 ? '' : 's'}`;
  }

  /* ── Render: composer ─────────────────────────────────────────────────── */

  function sourceBadge() {
    const reg = state.registry[state.selected?.id];
    return reg?.liveVersion
      ? `<span class="pl-badge pl-badge--edited" title="Resolving from registry version ${reg.liveVersion}${reg.updatedBy ? `, published by ${reg.updatedBy}` : ''}">v${reg.liveVersion} · edited</span>`
      : `<span class="pl-badge" title="No override published — this resolves from the repo">repo</span>`;
  }

  function renderComposer() {
    const host = $('plComposer');
    const layout = $('plLayout');
    if (!host || !layout) return;

    const p = state.selected;
    if (!p) {
      host.hidden = true;
      layout.classList.remove('has-selection');
      return;
    }
    host.hidden = false;
    layout.classList.add('has-selection');

    host.innerHTML = `
      <div class="pl-composer-head">
        <div>
          <p class="pl-composer-eyebrow">${esc(catName(p.category))} ${sourceBadge()}</p>
          <h3>${esc(p.title)}</h3>
        </div>
        <button type="button" class="pl-close" id="plCloseComposer" aria-label="Close">&times;</button>
      </div>
      <div class="pl-composer-tabs" role="tablist">
        <button type="button" class="pl-tab ${state.tab === 'compose' ? 'active' : ''}" data-ctab="compose">Compose</button>
        <button type="button" class="pl-tab ${state.tab === 'source' ? 'active' : ''}" data-ctab="source">Source</button>
        <button type="button" class="pl-tab ${state.tab === 'history' ? 'active' : ''}" data-ctab="history">History</button>
      </div>
      <div class="pl-composer-body" id="plComposerBody"></div>`;

    renderTabBody();
  }

  function renderTabBody() {
    const body = $('plComposerBody');
    if (!body) return;
    if (state.tab === 'compose') { renderComposeTab(body); composeNow(); return; }
    if (state.tab === 'source')  { renderSourceTab(body);  return; }
    renderHistoryTab(body);
  }

  function renderComposeTab(body) {
    const p = state.selected;
    const vars = state.fields;
    const presetNames = Object.keys(state.presets || {});

    body.innerHTML = `
      <p class="pl-when">${esc(p.when)}</p>
      ${p.note ? `<p class="pl-note"><b>Watch this:</b> ${esc(p.note)}</p>` : ''}

      <div class="pl-group">
        <p class="pl-group-label">Context <span class="pl-group-hint">whose business it is</span></p>
        <div class="pl-field">
          <select id="plIndustry">
            <option value="">No industry block</option>
            ${state.industries.map((i) => `<option value="${esc(i.id)}" ${state.industry === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="pl-group">
        <p class="pl-group-label">Clauses <span class="pl-group-hint">how it behaves when unsure</span></p>
        ${presetNames.length ? `<div class="pl-presets">${presetNames.map((n) => `<button type="button" class="pl-preset" data-preset="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
        <div class="pl-clause-grid">
          ${state.clauses.map((c) => `
            <label class="pl-clause ${state.active.has(c.id) ? 'on' : ''}" title="${esc(c.guards || '')}">
              <input type="checkbox" data-clause="${esc(c.id)}" ${state.active.has(c.id) ? 'checked' : ''}>
              ${esc(c.name)}
            </label>`).join('')}
        </div>
      </div>

      <div class="pl-group" ${vars.length ? '' : 'hidden'}>
        <p class="pl-group-label">Fill in <span class="pl-group-hint" id="plFieldsCount">${vars.length} variable${vars.length === 1 ? '' : 's'}</span></p>
        <div id="plFields">
          ${vars.map((n) => fieldHtml(n, !(p.variables || []).includes(n))).join('')}
        </div>
      </div>

      <div class="pl-actions">
        <button type="button" class="btn-primary btn-sm" id="plCopy">Copy assembled prompt</button>
        <button type="button" class="btn-secondary btn-sm" id="plCopyRaw">Copy raw</button>
        <button type="button" class="btn-secondary btn-sm" id="plClear">Clear fields</button>
      </div>

      <div id="plWarn"></div>
      <pre class="pl-output" id="plOutput">Assembling…</pre>
      <p class="pl-output-meta"><span id="plOutMeta"></span><span id="plOutChars"></span></p>`;
  }

  /* ── Source: edit the body, save a draft, publish it ──────────────────── */

  function renderSourceTab(body) {
    const p = state.selected;
    if (!state.history) {
      body.innerHTML = '<div class="pl-loading"><div class="agents-spinner"></div><span>Loading current source…</span></div>';
      loadHistory().then(renderTabBody).catch((e) => {
        body.innerHTML = `<div class="pl-error">${esc(e.message)}</div>`;
      });
      return;
    }

    const live = state.history.live || {};
    const isOverride = live.origin === 'registry';
    const changed = state.editBody !== (live.body || '');

    body.innerHTML = `
      <p class="pl-when">
        Editing changes what this prompt produces <b>for you</b>. It does not
        touch any agent — nothing in this library is resolved into what Nexus,
        Aria or Atlas send.
      </p>

      <div class="pl-source-state">
        ${isOverride
          ? `Resolving from <b>registry v${live.version}</b>${live.updated_by ? `, published by ${esc(live.updated_by)}` : ''}${live.updated_at ? ` on ${when(live.updated_at)}` : ''}.`
          : `Resolving from the <b>repo</b>. Nothing has been published for this prompt, so it tracks the codebase automatically.`}
      </div>

      <div class="pl-field">
        <label for="plEdit">Prompt body</label>
        <textarea id="plEdit" rows="16" spellcheck="false">${esc(state.editBody)}</textarea>
      </div>

      <div class="pl-field">
        <label for="plEditNote">Why this version exists <span class="pl-from">optional, and worth writing</span></label>
        <input type="text" id="plEditNote" placeholder="e.g. dropped the fixed count, it was producing filler" />
      </div>

      <div class="pl-actions">
        <button type="button" class="btn-primary btn-sm" id="plPublish" ${changed ? '' : 'disabled'}>Save &amp; publish</button>
        <button type="button" class="btn-secondary btn-sm" id="plDraft" ${changed ? '' : 'disabled'}>Save as draft</button>
        <button type="button" class="btn-secondary btn-sm" id="plResetEdit" ${changed ? '' : 'disabled'}>Discard changes</button>
        ${isOverride ? `<button type="button" class="btn-secondary btn-sm" id="plRevert">Revert to repo</button>` : ''}
      </div>

      <p class="pl-output-meta">
        <span>${changed ? 'Unsaved changes' : 'No changes'}</span>
        <span>${state.editBody.length.toLocaleString()} chars</span>
      </p>

      ${isOverride ? `
      <div class="pl-group" style="margin-top:16px">
        <p class="pl-group-label">Repo version <span class="pl-group-hint">what you would get on revert</span></p>
        <pre class="pl-output" style="max-height:180px">${esc(state.history.seedBody || '')}</pre>
      </div>` : ''}`;
  }

  /* ── History ──────────────────────────────────────────────────────────── */

  function renderHistoryTab(body) {
    if (!state.history) {
      body.innerHTML = '<div class="pl-loading"><div class="agents-spinner"></div><span>Loading history…</span></div>';
      loadHistory().then(renderTabBody).catch((e) => {
        body.innerHTML = `<div class="pl-error">${esc(e.message)}</div>`;
      });
      return;
    }

    const { versions, live } = state.history;
    const uses = state.usage[state.selected.id] || 0;

    body.innerHTML = `
      <div class="pl-source-state">
        Copied <b>${uses}</b> time${uses === 1 ? '' : 's'} in the last ${state.usageDays} days.
        ${uses >= 10
          ? 'That is enough to compare one version against another.'
          : 'Below ten it is an impression, not evidence — the same threshold used everywhere else here.'}
      </div>

      ${versions.length ? versions.map((v) => `
        <div class="pl-version ${live.version === v.version ? 'live' : ''}">
          <div class="pl-version-head">
            <span><b>v${v.version}</b>
              <span class="pl-version-status">${live.version === v.version ? 'live' : esc(v.status)}</span>
            </span>
            <span class="pl-version-meta">${v.chars.toLocaleString()} chars · ${when(v.created_at)}${v.created_by ? ` · ${esc(v.created_by)}` : ''}</span>
          </div>
          ${v.note ? `<p class="pl-version-note">${esc(v.note)}</p>` : ''}
          <div class="pl-version-actions">
            <button type="button" class="btn-secondary btn-sm" data-view="${v.version}">View</button>
            ${live.version === v.version
              ? ''
              : `<button type="button" class="btn-secondary btn-sm" data-publish="${v.version}">Make live</button>`}
          </div>
          <pre class="pl-output" data-vbody="${v.version}" hidden>${esc(v.body)}</pre>
        </div>`).join('')
      : `<div class="pl-empty" style="border-style:dashed">No versions saved. This prompt resolves from the repo — edit it under <b>Source</b> to start a history.</div>`}`;
  }

  async function loadHistory() {
    const id = state.selected.id;
    const data = await window.PathGuruBackend.apiFetch(`/api/prompts/${encodeURIComponent(id)}/versions`);
    state.history = data;
    state.editBody = data.live?.body || state.selected.body || '';
    return data;
  }

  /* ── Compose (debounced) ──────────────────────────────────────────────── */

  let composeTimer = null;
  function composeSoon() {
    clearTimeout(composeTimer);
    composeTimer = setTimeout(composeNow, 300);
  }

  async function composeNow() {
    const p = state.selected;
    if (!p || state.tab !== 'compose') return;
    const out  = $('plOutput');
    const warn = $('plWarn');
    if (!out) return;

    /* A sequence number, because a fast typist can have three of these in
       flight and the last one to return is not necessarily the last one sent. */
    const seq = ++state.composeSeq;

    try {
      const data = await window.PathGuruBackend.postJson('/api/prompts/compose', {
        promptId: p.id,
        vars: state.vars,
        industry: state.industry || null,
        clauses: [...state.active],
      });
      if (seq !== state.composeSeq) return;
      state.composed = data;
      out.textContent = data.text;

      const meta = $('plOutMeta');
      const chars = $('plOutChars');
      if (meta) {
        const bits = [];
        if (data.used?.industry) bits.push(state.industries.find((i) => i.id === data.used.industry)?.name || data.used.industry);
        if (data.used?.clauses?.length) bits.push(`${data.used.clauses.length} clause${data.used.clauses.length === 1 ? '' : 's'}`);
        bits.push(data.origin === 'registry' ? `registry v${data.version}` : 'repo');
        meta.textContent = bits.join(' · ');
      }
      if (chars) chars.textContent = `${data.text.length.toLocaleString()} chars · ~${Math.ceil(data.text.length / 4).toLocaleString()} tokens`;

      mergeFields(data.unfilled);

      if (warn) {
        warn.innerHTML = data.unfilled?.length
          ? `<div class="pl-warn"><strong>Still unfilled:</strong> ${data.unfilled.map((v) => `<code>${esc(v)}</code>`).join(' ')}<br>
             A placeholder that reaches the model reads as permission to invent something. Fill these, or delete them from the pasted text.</div>`
          : '';
      }
    } catch (e) {
      if (seq !== state.composeSeq) return;
      out.textContent = `Could not assemble — ${e.message}`;
    }
  }

  /* ── Selection ────────────────────────────────────────────────────────── */

  function select(id) {
    const p = state.prompts.find((x) => x.id === id);
    if (!p) return;
    state.selected = p;
    state.vars = {};
    state.composed = null;
    state.fields = [...(p.variables || [])];
    state.tab = 'compose';
    state.history = null;
    state.editBody = '';

    const recents = readList(RECENT_KEY).filter((x) => x !== id);
    recents.unshift(id);
    write(RECENT_KEY, recents.slice(0, MAX_RECENT * 2));

    renderComposer();
    renderGrid();
    if (window.innerWidth <= 1080) {
      $('plComposer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      window.pgToast?.(`${label} copied`, 'success');
    } catch {
      /* Clipboard API needs a secure context. A textarea + execCommand still
         works on http://localhost, which is where this console often runs. */
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); window.pgToast?.(`${label} copied`, 'success'); }
      catch { window.pgToast?.('Copy failed — select the text and copy manually', 'error'); }
      ta.remove();
    }
  }

  /* The one event worth counting. Never awaited by the copy itself — a
     telemetry write must not be able to make a successful copy look failed. */
  function recordCopy() {
    const d = state.composed;
    const p = state.selected;
    if (!d || !p) return;
    window.PathGuruBackend.postJson('/api/prompts/used', {
      promptId: p.id,
      version:  d.version ?? null,
      industry: d.used?.industry || null,
      clauses:  d.used?.clauses || [],
      chars:    d.text.length,
      unfilled: d.unfilled?.length || 0,
      surface:  'console',
    }).then(() => {
      state.usage[p.id] = (state.usage[p.id] || 0) + 1;
      renderCount();
      renderGrid();
    }).catch(() => { /* counted or not, the copy already happened */ });
  }

  /* ── Registry writes ──────────────────────────────────────────────────── */

  async function saveDraft(publish) {
    const id = state.selected.id;
    const note = $('plEditNote')?.value?.trim() || null;
    try {
      const draft = await window.PathGuruBackend.postJson(
        `/api/prompts/${encodeURIComponent(id)}/draft`, { body: state.editBody, note });
      if (publish) {
        await window.PathGuruBackend.postJson(
          `/api/prompts/${encodeURIComponent(id)}/publish`, { version: draft.version });
        window.pgToast?.(`v${draft.version} is live`, 'success');
      } else {
        window.pgToast?.(`Saved as draft v${draft.version}`, 'success');
      }
      state.history = null;
      await load(true);
      await loadHistory();
      state.tab = publish ? 'compose' : 'history';
      renderComposer();
    } catch (e) {
      window.pgToast?.(e.message, 'error');
    }
  }

  async function publishVersion(version) {
    const id = state.selected.id;
    try {
      await window.PathGuruBackend.postJson(
        `/api/prompts/${encodeURIComponent(id)}/publish`, { version });
      window.pgToast?.(`v${version} is live`, 'success');
      state.history = null;
      await load(true);
      await loadHistory();
      renderComposer();
    } catch (e) {
      window.pgToast?.(e.message, 'error');
    }
  }

  async function revertToRepo() {
    const id = state.selected.id;
    try {
      await window.PathGuruBackend.postJson(`/api/prompts/${encodeURIComponent(id)}/revert`, {});
      window.pgToast?.('Back to the repo version', 'success');
      state.history = null;
      await load(true);
      await loadHistory();
      renderComposer();
    } catch (e) {
      window.pgToast?.(e.message, 'error');
    }
  }

  /* ── Blocks modal ─────────────────────────────────────────────────────── */

  let blocksCache = null;
  async function openBlocks() {
    const modal = $('plBlocksModal');
    const body  = $('plBlocksBody');
    if (!modal || !body) return;
    modal.hidden = false;
    if (!blocksCache) {
      body.innerHTML = '<div class="pl-loading"><div class="agents-spinner"></div><span>Loading blocks…</span></div>';
      try {
        blocksCache = await window.PathGuruBackend.apiFetch('/api/prompts/blocks');
      } catch (e) {
        body.innerHTML = `<div class="pl-error">${esc(e.message)}</div>`;
        return;
      }
    }
    const block = (kind, x) => `
      <details class="pl-block">
        <summary><span>${esc(x.name)}</span><span class="pl-block-kind">${kind}</span></summary>
        <pre>${esc(x.body)}</pre>
      </details>`;
    body.innerHTML =
      `<p class="pl-section-label">Industry blocks — whose business it is</p>` +
      (blocksCache.industries || []).map((i) => block('industry', i)).join('') +
      `<p class="pl-section-label" style="margin-top:16px">Clauses — how it behaves when unsure</p>` +
      (blocksCache.clauses || []).map((c) => block('clause', c)).join('');
  }

  /* ── Wiring ───────────────────────────────────────────────────────────── */

  function wire() {
    const root = $('tab-agents-prompts');
    if (!root || root.dataset.wired) return;
    root.dataset.wired = '1';

    $('plSearch')?.addEventListener('input', (e) => {
      state.query = e.target.value;
      renderGrid();
    });

    $('plChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-cat]');
      if (!chip) return;
      state.category = chip.dataset.cat || null;
      renderChips();
      renderGrid();
    });

    $('plGrid')?.addEventListener('click', (e) => {
      const pin = e.target.closest('[data-pin]');
      if (pin) {
        e.stopPropagation();
        const pins = readSet(PIN_KEY);
        pins.has(pin.dataset.pin) ? pins.delete(pin.dataset.pin) : pins.add(pin.dataset.pin);
        write(PIN_KEY, [...pins]);
        renderGrid();
        return;
      }
      const card = e.target.closest('.pl-card');
      if (card) select(card.dataset.id);
    });

    $('plGrid')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.pl-card');
      if (!card) return;
      e.preventDefault();
      select(card.dataset.id);
    });

    /* One delegated listener on the composer host, because its inner markup is
       replaced wholesale on every selection and per-element listeners would
       have to be re-attached each time. */
    const host = $('plComposer');
    host?.addEventListener('click', (e) => {
      if (e.target.closest('#plCloseComposer')) {
        state.selected = null; renderComposer(); renderGrid(); return;
      }

      const tab = e.target.closest('[data-ctab]');
      if (tab) { state.tab = tab.dataset.ctab; renderComposer(); return; }

      if (e.target.closest('#plCopy')) {
        copyText(state.composed?.text || '', 'Assembled prompt');
        recordCopy();
        return;
      }
      if (e.target.closest('#plCopyRaw')) {
        /* The RESOLVED body, not the repo one — copying repo text out of a
           prompt you have overridden would hand you the version you replaced. */
        const raw = state.history?.live?.body || state.selected?.body || '';
        copyText(raw, 'Raw prompt');
        return;
      }
      if (e.target.closest('#plClear')) {
        state.vars = {}; renderTabBody(); return;
      }
      const preset = e.target.closest('[data-preset]');
      if (preset) {
        state.active = new Set(state.presets[preset.dataset.preset] || []);
        renderTabBody();
        return;
      }

      if (e.target.closest('#plPublish'))   { saveDraft(true);  return; }
      if (e.target.closest('#plDraft'))     { saveDraft(false); return; }
      if (e.target.closest('#plRevert'))    { revertToRepo();   return; }
      if (e.target.closest('#plResetEdit')) {
        state.editBody = state.history?.live?.body || '';
        renderTabBody();
        return;
      }

      const view = e.target.closest('[data-view]');
      if (view) {
        const pre = host.querySelector(`[data-vbody="${view.dataset.view}"]`);
        if (pre) { pre.hidden = !pre.hidden; view.textContent = pre.hidden ? 'View' : 'Hide'; }
        return;
      }
      const pub = e.target.closest('[data-publish]');
      if (pub) { publishVersion(parseInt(pub.dataset.publish, 10)); return; }
    });

    host?.addEventListener('change', (e) => {
      if (e.target.id === 'plIndustry') {
        state.industry = e.target.value;
        /* Rebuild the field list from the prompt alone and let compose re-add
           whatever the new block needs — otherwise the boxes belonging to the
           block you just swapped out stay on screen forever. Typed values
           survive in state.vars, so switching back restores them. */
        state.fields = [...(state.selected?.variables || [])];
        renderTabBody();
        return;
      }
      const clause = e.target.closest('[data-clause]');
      if (clause) {
        clause.checked ? state.active.add(clause.dataset.clause) : state.active.delete(clause.dataset.clause);
        clause.closest('.pl-clause')?.classList.toggle('on', clause.checked);
        composeSoon();
      }
    });

    host?.addEventListener('input', (e) => {
      if (e.target.id === 'plEdit') {
        state.editBody = e.target.value;
        /* Enable the buttons without re-rendering — re-rendering would take
           the caret with it, which makes a textarea unusable. */
        const changed = state.editBody !== (state.history?.live?.body || '');
        ['plPublish', 'plDraft', 'plResetEdit'].forEach((id) => {
          const b = $(id); if (b) b.disabled = !changed;
        });
        return;
      }
      const name = e.target.dataset?.var;
      if (!name) return;
      state.vars[name] = e.target.value;
      composeSoon();
    });

    $('plBlocksBtn')?.addEventListener('click', openBlocks);
    $('plBlocksModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget || e.target.closest('#plBlocksClose')) {
        $('plBlocksModal').hidden = true;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (window.PathGuruState?.get('activeTab') !== 'agents-prompts') return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if (e.key === '/' && !typing) { e.preventDefault(); $('plSearch')?.focus(); }
      if (e.key === 'Escape') {
        const modal = $('plBlocksModal');
        if (modal && !modal.hidden) { modal.hidden = true; return; }
        if (state.selected) { state.selected = null; renderComposer(); renderGrid(); }
      }
    });
  }

  document.addEventListener('pg:tab-change', (e) => {
    if (e.detail?.tab !== 'agents-prompts') return;
    wire();
    load();
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (window.PathGuruState?.get('activeTab') === 'agents-prompts') { wire(); load(); }
  });

  window.PathGuruPromptLibrary = { load, select };
})();
