/* ─────────────────────────────────────────────────────────────────────────
   PathGuru — console chart primitives

   One small SVG library shared by Analytics and the FrictionIQ console, so
   the two screens read as one system rather than two.

   ── DESIGN DECISIONS, AND WHY ──────────────────────────────────────────────

   THE PALETTE LIVES IN CSS, AND IS VALIDATED THERE. It is read from
   --cx-s1..--cx-s5 at load rather than duplicated here, so there is one place
   to change it and no way for the stylesheet and the script to drift apart.
   The first version hardcoded five hues chosen against an invented surface
   colour that this application does not use. The current set is derived from
   the app's own accents and validated against the real --surface; the note
   above the tokens in console.css carries the command and its output. Do not
   substitute a hue by eye, and do not reorder them — the order is what passed.

   COLOUR NEVER CARRIES MEANING ALONE. Every series is direct-labelled or
   legended, every status carries a word, and the funnel prints its own
   numbers. A reader with no colour vision loses nothing.

   NOTHING IS INVENTED TO FILL A GAP. A missing series renders as an explicit
   empty state naming what is missing. A chart that guesses is worse than a
   blank one, because you cannot tell which parts were guessed — which is the
   argument this firm makes to clients about their own dashboards.

   THE PREVIOUS DAILY CHART WAS THE WRONG FORM. Thirty days of a continuous
   series is change-over-time; that is a line, not thirty bars. The bars also
   collapsed to nothing because their container never established a baseline,
   which is why the panel read as an empty strip.
──────────────────────────────────────────────────────────────────────────── */

'use strict';

(function (global) {
  const NS = 'http://www.w3.org/2000/svg';

  /* Read the design tokens rather than restate them. The fallbacks are the
     app's own values and exist only for the case where this file loads before
     its stylesheet — they are not a second source of truth. */
  const token = (name, fallback) => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch { return fallback; }
  };

  /* Validated categorical order. Assign in this order, never cycle. */
  const SERIES = [
    token('--cx-s1', '#1F9E70'), token('--cx-s2', '#2E86D9'), token('--cx-s3', '#A2842C'),
    token('--cx-s4', '#8A6BD6'), token('--cx-s5', '#C4573F'),
  ];
  const INK     = token('--text-primary',   '#f0f4ff');
  const MUTED   = token('--text-muted',     '#4d6280');
  const GRID    = token('--border',         '#263047');
  const SURFACE = token('--surface',        '#111827');

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    return n;
  };

  const fmt = (n) => Number(n ?? 0).toLocaleString();
  const nice = (max) => {
    if (max <= 5) return 5;
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil(max / mag) * mag;
  };

  /* An empty state has to survive being dropped into a grid. #anTiles and
     #fiqTiles are twelve-column grids, so a bare div landed in ONE column and
     the sentence rendered a word per line down the left margin — which read as
     a broken page rather than as an explanation. Span the full row when the
     host is a grid; behave exactly as before when it is not. */
  function emptyState(host, msg) {
    if (!host) return;
    let isGrid = false;
    try { isGrid = getComputedStyle(host).display.includes('grid'); } catch (_) {}
    const body = `<div class="cx-empty"><span class="cx-empty-mark"></span>${esc(msg)}</div>`;
    host.innerHTML = isGrid ? `<div class="cx-col-12">${body}</div>` : body;
  }

  /* ── Tooltip: one per document, moved rather than recreated ───────────── */
  let tip;
  function tooltip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'cx-tip';
      tip.setAttribute('role', 'status');
      document.body.appendChild(tip);
    }
    return tip;
  }
  function showTip(html, x, y) {
    const t = tooltip();
    t.innerHTML = html;
    t.style.display = 'block';
    const r = t.getBoundingClientRect();
    let left = x + 14, top = y - r.height - 10;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top < 8) top = y + 18;
    t.style.left = `${left}px`;
    t.style.top = `${top}px`;
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }
  global.addEventListener('scroll', hideTip, true);

  /* ══ AREA / LINE — change over time ═══════════════════════════════════ */
  function areaChart(host, points, opts = {}) {
    if (!host) return;
    if (!points || !points.length) return emptyState(host, opts.empty || 'No data in this period.');

    const W = host.clientWidth || 720, H = opts.height || 190;
    const padL = 42, padR = 12, padT = 12, padB = 26;
    const iw = Math.max(10, W - padL - padR), ih = H - padT - padB;
    const vals = points.map((p) => Number(p.value) || 0);
    const top = nice(Math.max(1, ...vals));
    const X = (i) => padL + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const Y = (v) => padT + ih - (v / top) * ih;

    host.innerHTML = '';
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img',
      'aria-label': opts.label || 'Time series' });

    /* recessive gridlines + y labels */
    for (let g = 0; g <= 2; g++) {
      const v = (top / 2) * g, y = Y(v);
      svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: GRID, 'stroke-width': 1 }));
      const t = el('text', { x: padL - 8, y: y + 4, fill: MUTED, 'font-size': 10, 'text-anchor': 'end' });
      t.textContent = fmt(v); svg.appendChild(t);
    }

    const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(Number(p.value) || 0)}`).join(' ');
    const grad = el('linearGradient', { id: 'cxGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(el('stop', { offset: '0%', 'stop-color': SERIES[0], 'stop-opacity': 0.30 }));
    grad.appendChild(el('stop', { offset: '100%', 'stop-color': SERIES[0], 'stop-opacity': 0.02 }));
    const defs = el('defs'); defs.appendChild(grad); svg.appendChild(defs);
    svg.appendChild(el('path', { d: `${line} L${X(points.length - 1)},${padT + ih} L${X(0)},${padT + ih} Z`, fill: 'url(#cxGrad)' }));
    svg.appendChild(el('path', { d: line, fill: 'none', stroke: SERIES[0], 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

    /* first / last date labels only — never a label on every point */
    const lab = (i, anchor) => {
      const t = el('text', { x: X(i), y: H - 8, fill: MUTED, 'font-size': 10, 'text-anchor': anchor });
      t.textContent = points[i].label || ''; svg.appendChild(t);
    };
    lab(0, 'start'); if (points.length > 1) lab(points.length - 1, 'end');

    /* crosshair + hover */
    const cross = el('line', { y1: padT, y2: padT + ih, stroke: MUTED, 'stroke-width': 1,
      'stroke-dasharray': '3 3', opacity: 0 });
    const dot = el('circle', { r: 4.5, fill: SERIES[0], stroke: SURFACE, 'stroke-width': 2, opacity: 0 });
    svg.appendChild(cross); svg.appendChild(dot);
    const hit = el('rect', { x: padL, y: padT, width: iw, height: ih, fill: 'transparent', style: 'cursor:crosshair' });
    hit.addEventListener('mousemove', (e) => {
      const box = svg.getBoundingClientRect();
      const rel = ((e.clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(points.length - 1, Math.round(((rel - padL) / iw) * (points.length - 1))));
      const p = points[i];
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
      dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(Number(p.value) || 0)); dot.setAttribute('opacity', 1);
      showTip(`<b>${fmt(p.value)}</b> ${esc(opts.unit || 'views')}<span>${esc(p.label || '')}</span>`, e.clientX, e.clientY);
    });
    hit.addEventListener('mouseleave', () => { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); hideTip(); });
    svg.appendChild(hit);
    host.appendChild(svg);
  }

  /* ══ HORIZONTAL BARS — magnitude across a short list ══════════════════ */
  function barList(host, rows, opts = {}) {
    if (!host) return;
    if (!rows || !rows.length) return emptyState(host, opts.empty || 'Nothing recorded yet.');
    const max = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
    const total = rows.reduce((a, r) => a + (Number(r.value) || 0), 0) || 1;
    host.innerHTML = rows.slice(0, opts.limit || 8).map((r) => {
      const v = Number(r.value) || 0;
      const w = Math.max(2, Math.round((v / max) * 100));
      const share = ((v / total) * 100).toFixed(1);
      return `<div class="cx-row" title="${esc(r.label)} — ${fmt(v)} (${share}%)">
        <span class="cx-row-label">${esc(r.label)}</span>
        <span class="cx-row-track"><span class="cx-row-fill" style="width:${w}%;background:${opts.color || SERIES[0]}"></span></span>
        <span class="cx-row-value">${fmt(v)}</span>
        <span class="cx-row-share">${share}%</span>
      </div>`;
    }).join('');
  }

  /* ══ FUNNEL — the only chart on the analytics page that matters ═══════
     ONE HUE FOR EVERY STEP. The steps of a funnel are a single quantity
     shrinking, not five different things — magnitude, not identity, so the
     categorical ramp does not apply. Painting them in series order also put
     the terminal red on "completed the assessment", which reads as a failure
     state on the one number the page exists to celebrate. */
  function funnel(host, stages, opts = {}) {
    if (!host) return;
    const known = stages.filter((s) => s.value != null);
    if (!known.length) return emptyState(host, 'No funnel data. The steps below need the events endpoint.');
    const first = Number(known[0].value) || 0;
    host.innerHTML = stages.map((s, i) => {
      if (s.value == null) {
        return `<div class="cx-funnel-step cx-unknown">
          <div class="cx-funnel-head"><span>${esc(s.label)}</span><span class="cx-funnel-na">not instrumented</span></div>
          <div class="cx-funnel-track"><div class="cx-funnel-fill cx-fill-na" style="width:100%"></div></div>
          <div class="cx-funnel-note">${esc(s.note || 'no event recorded for this step')}</div>
        </div>`;
      }
      const v = Number(s.value) || 0;
      const w = first ? Math.max(1.5, (v / first) * 100) : 100;
      /* "% of previous" walks back to the nearest step that HAS a value, not
         to i-1. An uninstrumented step in the middle is a gap in measurement,
         not a break in the funnel — treating it as one made the step after it
         report itself as the entry point, so a 15-completion step read as
         100%. The label names which step it is measured against. */
      let j = i - 1;
      while (j >= 0 && stages[j].value == null) j--;
      const prev = j >= 0 ? Number(stages[j].value) : null;
      const step = prev
        ? `${((v / (prev || 1)) * 100).toFixed(1)}% of ${j === i - 1 ? 'previous' : esc(stages[j].label.toLowerCase())}`
        : 'entry';
      return `<div class="cx-funnel-step">
        <div class="cx-funnel-head"><span>${esc(s.label)}</span><b>${fmt(v)}</b></div>
        <div class="cx-funnel-track"><div class="cx-funnel-fill" style="width:${w}%;background:${opts.color || SERIES[1]}"></div></div>
        <div class="cx-funnel-note">${esc(step)}${first && i ? ` · ${((v / first) * 100).toFixed(2)}% of entry` : ''}</div>
        ${s.note ? `<div class="cx-funnel-note cx-sample">${esc(s.note)}</div>` : ''}
      </div>`;
    }).join('');
  }

  /* ══ STACKED DISTRIBUTION — band mix, sector mix ═════════════════════ */
  function distribution(host, rows, opts = {}) {
    if (!host) return;
    if (!rows || !rows.length) return emptyState(host, opts.empty || 'No rows to distribute.');
    const total = rows.reduce((a, r) => a + (Number(r.value) || 0), 0) || 1;
    const bar = rows.map((r, i) => {
      const w = ((Number(r.value) || 0) / total) * 100;
      return `<span class="cx-seg" style="width:${w}%;background:${r.color || SERIES[i % SERIES.length]}"
               title="${esc(r.label)} — ${fmt(r.value)} (${w.toFixed(1)}%)"></span>`;
    }).join('');
    const legend = rows.map((r, i) => `<span class="cx-key">
        <i style="background:${r.color || SERIES[i % SERIES.length]}"></i>${esc(r.label)}
        <b>${fmt(r.value)}</b></span>`).join('');
    host.innerHTML = `<div class="cx-stack">${bar}</div><div class="cx-legend">${legend}</div>`;
  }

  /* ══ STAT TILE — a number is meaningless without its comparison ═══════ */
  function stat(host, { value, label, prev, unit, hint, empty, emptyHint }) {
    if (!host) return;
    if (empty) {
      /* Nothing measured yet: an em dash says "nothing to measure" where a 0
         would claim a measurement.
         The caption is opt-in. Every tile printing "no sessions recorded yet"
         stated one fact four times across one row — the em dashes already say
         it, and the register below says it again in full. */
      host.innerHTML = `<div class="cx-stat-value cx-stat-value--empty">—</div>
        <div class="cx-stat-label">${esc(label)}</div>
        ${emptyHint ? `<div class="cx-stat-hint">${esc(emptyHint)}</div>` : ''}`;
      return;
    }
    const cur = Number(value) || 0;
    let delta = '';
    if (prev != null && Number(prev) > 0) {
      const d = ((cur - prev) / prev) * 100;
      const dir = d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat';
      const word = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'level';
      const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
      delta = `<span class="cx-delta cx-${dir}">${arrow} ${word} ${Math.abs(d).toFixed(1)}%
                 <span class="cx-delta-prev">vs ${fmt(prev)} prior</span></span>`;
    } else if (prev != null) {
      delta = `<span class="cx-delta cx-flat">no prior period to compare</span>`;
    }
    host.innerHTML = `<div class="cx-stat-value">${fmt(cur)}${unit ? `<span class="cx-stat-unit">${esc(unit)}</span>` : ''}</div>
      <div class="cx-stat-label">${esc(label)}</div>${delta}
      ${hint ? `<div class="cx-stat-hint">${esc(hint)}</div>` : ''}`;
  }

  global.ConsoleCharts = { areaChart, barList, funnel, distribution, stat, emptyState, SERIES, esc, fmt };
})(window);
