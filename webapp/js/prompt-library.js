/* ══════════════════════════════════════════════════════════════════════════
   PROMPT LIBRARY — Intelligence › Prompt Library
   ══════════════════════════════════════════════════════════════════════════

   The operator's library, in the console. Search, category chips, cards, and a
   composer that assembles a prompt + an industry block + the clauses the stakes
   justify.

   THREE DECISIONS WORTH KNOWING, BECAUSE EACH ONE WAS A CHOICE.

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
      still standing, above the output, every time.

   OPERATOR-FACING ONLY. Nothing in this room touches any agent's live prompt.
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
    query:    '',
    category: null,
    selected: null,      // prompt object
    vars:     {},        // { NAME: value } for the selected prompt
    industry: '',
    active:   new Set(), // clause ids
    composed: null,      // { text, unfilled, used }
    composeSeq: 0,
    fields:   [],        // variable names with an input box, in order
  };

  const $  = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

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

  async function load() {
    if (state.loaded || state.loading) return;
    state.loading = true;
    const grid = $('plGrid');
    if (grid) grid.innerHTML = '<div class="pl-loading"><div class="agents-spinner"></div><span>Loading library…</span></div>';
    try {
      const data = await window.PathGuruBackend.apiFetch('/api/prompts');
      state.prompts    = data.prompts    || [];
      state.categories = data.categories || [];
      state.industries = data.industries || [];
      state.clauses    = data.clauses    || [];
      state.presets    = data.presets    || {};
      state.loaded = true;
      renderChips();
      renderGrid();
      const count = $('plCount');
      if (count) count.textContent = `${state.prompts.length} prompts · ${state.industries.length} industry blocks · ${state.clauses.length} clauses`;
    } catch (e) {
      if (grid) {
        grid.innerHTML = `<div class="pl-error">Could not load the prompt library — ${esc(e.message)}.<br>
          The backend must be running and this console signed in.</div>`;
      }
    } finally {
      state.loading = false;
    }
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

  function hueOf(catId) {
    return state.categories.find((c) => c.id === catId)?.hue || '#2e3d57';
  }
  function catName(catId) {
    return state.categories.find((c) => c.id === catId)?.name || catId;
  }

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
    return `
      <div class="pl-card ${state.selected?.id === p.id ? 'selected' : ''}"
           style="--pl-hue:${esc(hueOf(p.category))}"
           data-id="${esc(p.id)}" role="button" tabindex="0">
        <span class="pl-card-cat">
          <span class="pl-chip-dot" style="background:${esc(hueOf(p.category))}"></span>
          ${esc(catName(p.category))}
        </span>
        <h4 class="pl-card-title">${esc(p.title)}</h4>
        <p class="pl-card-when">${esc(p.when)}</p>
        <div class="pl-card-foot">
          <span class="pl-var-badge">${vars} variable${vars === 1 ? '' : 's'}</span>
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
      const recentIds = readList(RECENT_KEY);
      /* The prompt currently open is excluded. It is on screen in the
         composer; repeating it under "recently used" directly above the same
         card in the main list reads as a rendering fault, not a shortcut. */
      const recents = recentIds
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

  /* ── Render: composer ─────────────────────────────────────────────────── */

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
    host.parentElement?.removeAttribute('hidden');
    const label = $('plFieldsCount');
    if (label) label.textContent = `${state.fields.length} variable${state.fields.length === 1 ? '' : 's'}`;
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

    const vars = state.fields;
    const presetNames = Object.keys(state.presets || {});

    host.innerHTML = `
      <div class="pl-composer-head">
        <div>
          <p class="pl-composer-eyebrow">${esc(catName(p.category))}</p>
          <h3>${esc(p.title)}</h3>
        </div>
        <button type="button" class="pl-close" id="plCloseComposer" aria-label="Close">&times;</button>
      </div>
      <div class="pl-composer-body">
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
        <p class="pl-output-meta"><span id="plOutMeta"></span><span id="plOutChars"></span></p>
      </div>`;

    composeNow();
  }

  /* ── Compose (debounced) ──────────────────────────────────────────────── */

  let composeTimer = null;
  function composeSoon() {
    clearTimeout(composeTimer);
    composeTimer = setTimeout(composeNow, 300);
  }

  async function composeNow() {
    const p = state.selected;
    if (!p) return;
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
        meta.textContent = bits.length ? bits.join(' · ') : 'prompt only';
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
      if (e.target.closest('#plCopy')) {
        copyText(state.composed?.text || '', 'Assembled prompt'); return;
      }
      if (e.target.closest('#plCopyRaw')) {
        copyText(state.selected?.body || '', 'Raw prompt'); return;
      }
      if (e.target.closest('#plClear')) {
        state.vars = {}; renderComposer(); return;
      }
      const preset = e.target.closest('[data-preset]');
      if (preset) {
        const ids = state.presets[preset.dataset.preset] || [];
        state.active = new Set(ids);
        renderComposer();
        return;
      }
    });

    host?.addEventListener('change', (e) => {
      if (e.target.id === 'plIndustry') {
        state.industry = e.target.value;
        /* Rebuild the field list from the prompt alone and let compose re-add
           whatever the new block needs — otherwise the boxes belonging to the
           block you just swapped out stay on screen forever. Typed values
           survive in state.vars, so switching back restores them. */
        state.fields = [...(state.selected?.variables || [])];
        renderComposer();
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
