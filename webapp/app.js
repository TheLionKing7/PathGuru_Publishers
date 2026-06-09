/* ─────────────────────────────────────────────
   PathGuru Publishers — App State Engine
   Single source of truth. No direct DOM writes
   inside API callbacks. State → render → DOM.
───────────────────────────────────────────── */

'use strict';

/* ── State ─────────────────────────────────── */
/* Sub-tab → parent module map. Drives sidebar highlighting when a
   sub-tab is activated, and lets us pick the module's default sub-tab
   when the user clicks a sidebar module icon. */
const MODULE_OF_TAB = {
  // Publisher department
  brief: 'publishing', assets: 'publishing', compile: 'publishing',
  // Intelligence Studio — blog derivatives (separate shell, same department)
  blog: 'blog', 'blog-assets': 'blog',
  // Storefront department
  'shop-products': 'shop', 'shop-services': 'shop', 'shop-payments': 'shop',
  'shop-analytics': 'shop', 'shop-settings': 'shop',
  // Analytics department
  analytics: 'analytics',
  // Network + Intelligence Studio (shared agents shell, different tabs)
  'agents-command': 'agents', 'agents-workflow': 'agents',
  'agents-activity': 'agents', 'agents-network': 'agents',
  'agents-console': 'agents', 'agents-tasks': 'agents',
  'agents-leads': 'agents', 'agents-ip': 'agents',
  'agents-content': 'agents',
};
const DEFAULT_TAB_OF_MODULE = {
  publishing: 'brief',
  blog: 'blog',
  shop: 'shop-products',
  analytics: 'analytics',
  agents: 'agents-command',
};

function notifyTabChange (tab, mod) {
  document.dispatchEvent(new CustomEvent('pg:tab-change', { detail: { tab, module: mod } }));
}

/** Called by shell.js for cross-department navigation */
function setActiveTab (tab, moduleOverride) {
  const mod = moduleOverride || MODULE_OF_TAB[tab] || 'publishing';
  _dataDirectSet('activeModule', mod);
  _dataDirectSet('activeTab', tab);
  // Persist per-department last tab
  if (window.PathGuruShell) {
    const dept = window.PathGuruShell.deptForModule(mod, tab);
    if (dept) localStorage.setItem(`pg_lastTab_${dept.id}`, tab);
  }
  UI.render('activeModule');
  UI.render('activeTab');
  if (window.PathGuruShell) {
    window.PathGuruShell.updateChrome(tab, mod);
  }
  notifyTabChange(tab, mod);
}

function _dataDirectSet (key, value) {
  // Bypass State.set listener loop for batch updates
  const _data = State._internals();
  _data[key] = value;
}

const State = (() => {
  const _data = {
    activeTab: 'brief',
    activeModule: 'publishing',
    isGenerating: false,
    progress: 0,
    statusMessage: '',
    error: null,
    result: null,
    selectedAssets: [],
    importedManuscriptText: '',
    settings: loadSettings(),
  };

  const _listeners = [];

  function loadSettings () {
    try {
      return JSON.parse(localStorage.getItem('pg_settings') || '{}');
    } catch { return {}; }
  }

  return {
    get (key) { return _data[key]; },
    _internals () { return _data; },

    set (key, value) {
      _data[key] = value;
      if (key === 'activeTab') {
        const mod = MODULE_OF_TAB[value];
        if (mod && mod !== _data.activeModule) {
          _data.activeModule = mod;
          _listeners.forEach(fn => fn('activeModule', mod));
          UI.render('activeModule');
        }
        if (window.PathGuruShell) {
          window.PathGuruShell.updateChrome(value, _data.activeModule);
        }
        notifyTabChange(value, _data.activeModule);
      }
      if (key === 'activeModule' && window.PathGuruShell) {
        window.PathGuruShell.updateChrome(_data.activeTab, value);
      }
      _listeners.forEach(fn => fn(key, value));
      UI.render(key);
    },

    saveSettings () {
      localStorage.setItem('pg_settings', JSON.stringify(_data.settings));
    },

    patch (key, partial) {
      _data[key] = { ..._data[key], ...partial };
      UI.render(key);
    },
  };
})();

/* ── UI Renderer ────────────────────────────── */
const UI = (() => {
  const $ = id => document.getElementById(id);

  function render (key) {
    switch (key) {
      case 'activeTab':     renderTabs();     break;
      case 'activeModule':  renderModules();  break;
      case 'isGenerating':  renderGenerating(); break;
      case 'progress':      renderProgress(); break;
      case 'statusMessage': renderStatus();   break;
      case 'error':         renderError();    break;
      case 'result':        renderResult();   break;
      case 'selectedAssets':renderTray();     break;
      case 'settings':      renderSettings(); break;
    }
  }

  /* Department modules — show only the active shell */
  function renderModules () {
    const mod = State.get('activeModule');
    document.querySelectorAll('.module-shell').forEach(s => {
      s.classList.toggle('active', s.dataset.module === mod);
    });
    // Sidebar highlighting is owned by shell.js (dept-aware)
    if (window.PathGuruShell) {
      window.PathGuruShell.updateChrome(State.get('activeTab'), mod);
    }
  }

  /* Sub-tabs — show the matching tab-panel, swap the visible panel-header,
     and highlight the module-tab button. */
  function renderTabs () {
    const tab = State.get('activeTab');
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tab}`);
    });
    // Toggle the matching .panel-header[data-for] (lifted out of tab-panels
    // so the header sits ABOVE the topnav at module level).
    document.querySelectorAll('.panel-header[data-for]').forEach(h => {
      h.classList.toggle('active', h.dataset.for === tab);
    });
    document.querySelectorAll('.module-tab[data-subtab]').forEach(b => {
      const isActive = b.dataset.subtab === tab;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  /* Generating state */
  function renderGenerating () {
    const gen = State.get('isGenerating');
    const btn = $('generateBtn');
    const idle = $('statusIdle');
    const loading = $('statusLoading');
    const errEl = $('statusError');

    btn.disabled = gen;
    btn.textContent = gen ? 'Generating…' : '';
    if (!gen) {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('width', '18'); icon.setAttribute('height', '18');
      icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '2');
      icon.setAttribute('stroke-linecap', 'round'); icon.setAttribute('stroke-linejoin', 'round');
      icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      btn.prepend(icon);
      const span = document.createElement('span');
      span.textContent = 'Generate Draft';
      btn.appendChild(span);
    }
    idle.classList.toggle('hidden', gen);
    loading.classList.toggle('hidden', !gen);
    errEl.classList.toggle('hidden', true);
  }

  function renderProgress () {
    $('progressBar').style.width = State.get('progress') + '%';
  }

  function renderStatus () {
    $('statusMessage').textContent = State.get('statusMessage');
  }

  function renderError () {
    const err = State.get('error');
    if (!err) return;
    $('statusIdle').classList.add('hidden');
    $('statusLoading').classList.add('hidden');
    $('statusError').classList.remove('hidden');
    $('errorMessage').textContent = err;
    toast(err, 'error');
  }

  /* Result — populate compile tab */
  function renderResult () {
    const r = State.get('result');
    if (!r) return;

    /* Compliance checks */
    const compliance = r.compliance;
    if (compliance?.checks) {
      const list = $('complianceChecks');
      list.innerHTML = '';
      compliance.checks.forEach(c => {
        const item = document.createElement('div');
        item.className = 'compliance-item animate-in';
        const iconMap = { pass: '✓', warning: '!', fail: '✕' };
        const cls = c.status === 'warning' ? 'warn' : c.status;
        item.innerHTML = `
          <div class="compliance-icon ${cls}">${iconMap[c.status] || '?'}</div>
          <div class="compliance-text">
            <span class="compliance-name">${esc(c.name)}</span>
            <span class="compliance-msg">${esc(c.message)}</span>
          </div>`;
        list.appendChild(item);
      });
    }

    /* Strategy */
    const ms = r.manuscript;
    if (ms) {
      const sl = $('strategyList');
      sl.innerHTML = '';
      const pairs = [
        ['Title', ms.title],
        ['Subtitle', ms.subtitle],
        ['Positioning', ms.positioning],
        ['Writing voice', ms.writingPersonality],
        ['Sections', ms.sections?.length + ' sections'],
      ];
      pairs.forEach(([k, v]) => {
        if (!v) return;
        const div = document.createElement('div');
        div.className = 'strategy-item animate-in';
        div.innerHTML = `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
        sl.appendChild(div);
      });
    }

    /* Generation report */
    const gr = r.generationReport;
    const grEl = $('generationReport');
    if (grEl && gr) {
      grEl.innerHTML = '';
      const budget = r.pageBudget || gr.pageBudget;
      const pairs = [
        ['Status', gr.passed ? 'Passed validation' : 'Needs review'],
        ['Page budget', budget ? `${budget.targetPagesMin}–${budget.targetPagesMax} pages · ${budget.targetChapterCount} chapters` : ''],
        ['Word count', gr.wordCount != null ? `${gr.wordCount} words` : ''],
        ['Est. pages', gr.estimatedPages != null ? `~${gr.estimatedPages} pages` : ''],
        ['Chapters', gr.chapterCount != null ? `${gr.chapterCount} chapters` : ''],
        ['Feedback passes', gr.feedbackPass != null ? String(gr.feedbackPass) : ''],
      ];
      pairs.forEach(([k, v]) => {
        if (!v) return;
        const div = document.createElement('div');
        div.className = 'strategy-item animate-in';
        div.innerHTML = `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
        grEl.appendChild(div);
      });
      if (gr.issues?.length) {
        const div = document.createElement('div');
        div.className = 'strategy-item animate-in';
        div.innerHTML = `<dt>Issues</dt><dd>${esc(gr.issues.slice(0, 5).join('; '))}</dd>`;
        grEl.appendChild(div);
      }
    }

    /* Proofreader notes */
    const notes = ms?.proofreaderNotes || [];
    const nl = $('proofreaderNotes');
    nl.innerHTML = '';
    if (notes.length) {
      notes.forEach(n => {
        const li = document.createElement('li');
        li.className = 'note-item animate-in';
        li.textContent = n;
        nl.appendChild(li);
      });
    } else {
      nl.innerHTML = '<li class="notes-empty">No notes from proofreader.</li>';
    }

    /* Storage */
    if (r.pdfUrl || r.epubUrl) {
      $('storageCard').style.display = '';
      const su = $('storageUrls');
      su.innerHTML = '';
      if (r.pdfUrl) su.innerHTML += `<div class="storage-url-item"><span class="storage-label">PDF</span><a href="${esc(r.pdfUrl)}" target="_blank">${esc(r.pdfUrl)}</a></div>`;
      if (r.epubUrl) su.innerHTML += `<div class="storage-url-item"><span class="storage-label">EPUB</span><a href="${esc(r.epubUrl)}" target="_blank">${esc(r.epubUrl)}</a></div>`;
    }

    /* Document preview */
    if (r.html) {
      const frame = $('previewFrame');
      const empty = $('previewEmpty');
      frame.style.display = '';
      empty.style.display = 'none';
      const blob = new Blob([r.html], { type: 'text/html' });
      frame.src = URL.createObjectURL(blob);
    }

    /* Enable download buttons */
    $('downloadPdfBtn').disabled  = !r.pdfUrl && !r.pdfBase64 && !r.html;
    $('downloadEpubBtn').disabled = !r.epubUrl && !r.epubBase64;
    $('downloadDocxBtn').disabled = !r.docxBase64 && !r.html;
    $('downloadHtmlBtn').disabled = !r.html;
    $('downloadJsonBtn').disabled = !r.manuscript;
  }

  /* Assets tray */
  function renderTray () {
    const assets = State.get('selectedAssets');
    const tray = $('selectedAssetsTray');
    tray.style.display = assets.length ? 'flex' : 'none';
    $('selectedCount').textContent = assets.length;
    const trayItems = $('trayItems');
    trayItems.innerHTML = '';
    assets.forEach(a => {
      const img = document.createElement('img');
      img.className = 'tray-thumb';
      img.src = a.thumb;
      img.alt = a.alt || 'selected asset';
      trayItems.appendChild(img);
    });
  }

  /* Settings */
  function renderSettings () {
    const s = State.get('settings');
    const urlEl = document.getElementById('backendUrl');
    if (urlEl) urlEl.value = s.backendUrl || '';
    const displayEl = document.getElementById('backendUrlDisplay');
    if (displayEl) displayEl.textContent = s.backendUrl || 'No backend configured';
    const fields = ['cmsToken','brandLogoUrl','brandPrimaryColor','brandSecondaryColor','brandFontStack'];
    fields.forEach(f => {
      const el = document.getElementById(f);
      if (el) el.value = s[f] || '';
    });
    // Sync colour text inputs
    ['brandPrimaryColor','brandSecondaryColor'].forEach(f => {
      const textEl = document.getElementById(f + 'Text');
      if (textEl) textEl.value = s[f] || '';
    });
  }

  return { render, renderSettings };
})();

/* ── Toast ──────────────────────────────────── */
function toast (msg, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-dot"></div><span>${esc(msg)}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

/* ── Escape helper ──────────────────────────── */
function esc (s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Backend URL ────────────────────────────── */
function getBackendUrl () {
  const s = State.get('settings');
  return (s.backendUrl || '').replace(/\/$/, '') || window.location.origin;
}

/* ── API: Generate ──────────────────────────── */
async function pollGenerateJob (jobId) {
  const maxAttempts = 600; // ~40 min at 4s — standard books need 15–30 min
  let tick = 0;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await fetch(`${getBackendUrl()}/api/generate/status/${jobId}`);
    if (!res.ok) throw new Error(`Job poll failed: HTTP ${res.status}`);
    const job = await res.json();
    // Creep progress while running so the bar doesn't freeze at 15%
    const base = Math.max(10, job.progress || 10);
    const creep = job.status === 'running' ? Math.min(94, base + Math.floor(tick / 3)) : base;
    tick++;
    State.set('progress', creep);
    State.set('statusMessage', job.message || 'Generating in background…');
    if (job.status === 'complete' && job.result) return job.result;
    if (job.status === 'failed') throw new Error(job.error || 'Generation failed');
  }
  throw new Error('Generation timed out — check backend logs');
}

async function runGenerate (formData) {
  State.set('isGenerating', true);
  State.set('error', null);
  State.set('progress', 5);
  State.set('statusMessage', 'Connecting to PathGuru backend…');

  const steps = [
    [15, 'Running Tavily + Firecrawl research…'],
    [30, 'Chunked editorial — outline + chapters…'],
    [50, 'Applying PathFinda imprint pack…'],
    [65, 'Design agent applying layout…'],
    [80, 'Formatting for KDP spec…'],
    [92, 'Validation + feedback loop…'],
    [97, 'Compiling PDF / DOCX…'],
  ];

  let stepIndex = 0;
  const ticker = setInterval(() => {
    if (stepIndex < steps.length) {
      const [pct, msg] = steps[stepIndex++];
      State.set('progress', pct);
      State.set('statusMessage', msg);
    }
  }, 4500);

  try {
    const payload = {
      ...formData,
      async: formData.length !== 'concise',
      assetBaseUrl: getBackendUrl(),
    };
    const res = await fetch(`${getBackendUrl()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      clearInterval(ticker);
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(body.error || `Server returned ${res.status}`);
    }

    let data = await res.json();
    if (data.async && data.jobId) {
      clearInterval(ticker);
      State.set('progress', 12);
      State.set('statusMessage', 'Long-form generation running — this can take 15–30 minutes…');
      data = await pollGenerateJob(data.jobId);
    } else {
      clearInterval(ticker);
    }
    State.set('progress', 100);
    State.set('statusMessage', 'Draft complete!');
    State.set('result', data);
    State.set('activeTab', 'compile');
    toast('Draft generated successfully', 'success');

    const topic = formData.title || formData.topic || '';
    if (topic) {
      document.getElementById('pexelsQuery').value = topic.split(' ').slice(0, 3).join(' ');
    }

  } catch (err) {
    clearInterval(ticker);
    State.set('isGenerating', false);
    State.set('error', err.message);
    return;
  }

  State.set('isGenerating', false);
}

/* ── API: Pexels search ─────────────────────── */
async function searchAssets (query, aspect) {
  const grid = document.getElementById('assetsGrid');
  // Show skeletons
  grid.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const sk = document.createElement('div');
    sk.className = 'asset-skeleton';
    grid.appendChild(sk);
  }

  try {
    const params = new URLSearchParams({ query, ...(aspect ? { orientation: aspect } : {}) });
    const res = await fetch(`${getBackendUrl()}/api/assets?${params}`);
    if (!res.ok) throw new Error(`Assets API returned ${res.status}`);
    const data = await res.json();
    renderAssets(data.images || [], grid);
  } catch (err) {
    grid.innerHTML = `<div class="assets-empty"><p>Could not load images: ${esc(err.message)}</p></div>`;
  }
}

function renderAssets (images, grid) {
  grid.innerHTML = '';
  if (!images.length) {
    grid.innerHTML = '<div class="assets-empty"><p>No images found. Try a different keyword.</p></div>';
    return;
  }
  images.forEach(img => {
    const card = document.createElement('div');
    card.className = 'asset-card animate-in';
    card.dataset.id = img.id;

    const imgEl = document.createElement('img');
    imgEl.src = img.src?.medium || img.src?.small || '';
    imgEl.alt = img.alt || '';
    imgEl.loading = 'lazy';

    const overlay = document.createElement('div');
    overlay.className = 'asset-card-overlay';

    const coverBtn = document.createElement('button');
    coverBtn.className = 'asset-action-btn cover';
    coverBtn.textContent = '⬆ Use as cover';
    coverBtn.addEventListener('click', e => {
      e.stopPropagation();
      selectAsset(img, 'cover');
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'asset-action-btn add';
    addBtn.textContent = '+ Add to book';
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      selectAsset(img, 'interior');
    });

    overlay.append(coverBtn, addBtn);
    card.append(imgEl, overlay);
    card.addEventListener('click', () => selectAsset(img, 'interior'));
    grid.appendChild(card);
  });
}

function selectAsset (img, role) {
  const assets = [...State.get('selectedAssets')];
  const idx = assets.findIndex(a => a.id === img.id);
  if (idx > -1) {
    assets.splice(idx, 1);
  } else {
    assets.push({ id: img.id, thumb: img.src?.small, full: img.src?.large, alt: img.alt, role });
  }
  State.set('selectedAssets', assets);

  // Update card visual
  document.querySelectorAll('.asset-card').forEach(c => {
    c.classList.toggle('selected', assets.some(a => a.id == c.dataset.id));
  });
  toast(idx > -1 ? 'Asset removed' : `Asset added (${role})`, 'info');
}

/* ── Form helpers ───────────────────────────── */
function libFolderSlug (folder) {
  return String(folder || '').replace(/\//g, '--');
}

function getImportedManuscriptText () {
  const paste = document.getElementById('manuscriptPaste')?.value?.trim() || '';
  if (paste) return paste;
  return State.get('importedManuscriptText') || '';
}

function collectFormData () {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const trimParts = get('trimSize').split('x');
  const logoPreview = document.getElementById('logoPreview');
  const logoFromUpload = logoPreview?.src?.startsWith('data:') ? logoPreview.src : '';
  const bulletsRaw = document.getElementById('backCoverBullets')?.value || '';
  const fmt = get('format');
  const includeDocx = fmt === 'docx' || fmt === 'pdf+docx';
  const jobMode = get('jobMode') || 'generate';
  const manuscriptText = jobMode === 'refine' ? getImportedManuscriptText() : '';

  return {
    jobMode,
    topic:              get('topic'),
    title:              get('title'),
    subtitle:           get('subtitle'),
    audience:           get('audience'),
    outcome:            get('outcome'),
    writingMode:        get('writingMode'),
    writingPersonality: get('writingPersonality'),
    tone:               get('tone'),
    style:              get('style'),
    author:             get('author'),
    publisher:          get('publisher') || 'PathGuru Publishers',
    publisherProfile:   get('publisherProfile'),
    copyright:          get('copyright') || `Copyright ${new Date().getFullYear()} ${get('author') || 'Author'}. All rights reserved.`,
    publishingIntent:   get('publishingIntent') || 'ebook',
    ebookGenre:         get('ebookGenre') || 'non-fiction',
    refineInstructions: get('refineInstructions'),
    sourceManuscript:   manuscriptText ? { text: manuscriptText } : undefined,
    manuscriptText:     manuscriptText || undefined,
    format:             includeDocx && fmt === 'pdf+docx' ? 'pdf' : (fmt === 'docx' ? 'pdf' : fmt),
    includeDocx,
    kdpFormat:          'paperback',
    trimWidthIn:        parseFloat(trimParts[0]) || 6,
    trimHeightIn:       parseFloat(trimParts[1]) || 9,
    length:             get('length') || 'standard',
    backCoverBlurb:     get('backCoverBlurb'),
    backCoverBullets:   bulletsRaw.split('\n').map(s => s.trim()).filter(Boolean),
    backCoverAuthorBio: get('backCoverAuthorBio'),
    bisacCodes:         get('bisacCodes'),
    keywords:           get('keywords'),
    brandLogoUrl:       logoFromUpload || State.get('settings').brandLogoUrl || '',
    brandPrimaryColor:  State.get('settings').brandPrimaryColor || '',
    brandSecondaryColor:State.get('settings').brandSecondaryColor || '',
    brandFontStack:     State.get('settings').brandFontStack || '',
    brandPalette:       get('projBrandPalette') || '',
    selectedTemplate:   get('projTemplate') || '',
  };
}

/* ── Downloads ──────────────────────────────── */
function downloadHtml () {
  const r = State.get('result');
  if (!r?.html) return;
  const blob = new Blob([r.html], { type: 'text/html' });
  triggerDownload(URL.createObjectURL(blob), `pathguru-${Date.now()}.html`);
}

function downloadJson () {
  const r = State.get('result');
  if (!r?.manuscript) return;
  const blob = new Blob([JSON.stringify(r.manuscript, null, 2)], { type: 'application/json' });
  triggerDownload(URL.createObjectURL(blob), `pathguru-manuscript-${Date.now()}.json`);
}

function downloadPdf () {
  const r = State.get('result');
  if (r?.pdfUrl) { window.open(r.pdfUrl, '_blank'); return; }
  if (r?.pdfBase64) {
    const bytes = Uint8Array.from(atob(r.pdfBase64), c => c.charCodeAt(0));
    triggerDownload(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), `pathguru-${Date.now()}.pdf`);
    return;
  }
  const frame = document.getElementById('previewFrame');
  if (frame?.contentWindow) {
    frame.contentWindow.print();
  } else {
    toast('No PDF available yet. Generate a draft first.', 'error');
  }
}

function downloadEpub () {
  const r = State.get('result');
  if (r?.epubUrl) { window.open(r.epubUrl, '_blank'); return; }
  if (r?.epubBase64) {
    const bytes = Uint8Array.from(atob(r.epubBase64), c => c.charCodeAt(0));
    triggerDownload(URL.createObjectURL(new Blob([bytes], { type: 'application/epub+zip' })), `pathguru-${Date.now()}.epub`);
    return;
  }
  toast('No EPUB available.', 'error');
}

async function downloadDocx () {
  const r = State.get('result');
  if (r?.docxBase64) {
    const bytes = Uint8Array.from(atob(r.docxBase64), c => c.charCodeAt(0));
    triggerDownload(
      URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })),
      `pathguru-${Date.now()}.docx`,
    );
    return;
  }
  if (!r?.html) { toast('No manuscript HTML — generate a draft first.', 'error'); return; }
  try {
    toast('Building DOCX…', 'info');
    const res = await fetch(`${getBackendUrl()}/api/docx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: r.html, project: r.project || {} }),
    });
    if (!res.ok) throw new Error(`DOCX export failed: HTTP ${res.status}`);
    const blob = await res.blob();
    triggerDownload(URL.createObjectURL(blob), `pathguru-${Date.now()}.docx`);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function triggerDownload (href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

/* ── Upload selected assets to R2 ───────────── */
async function uploadAssetsToR2 () {
  const assets = State.get('selectedAssets');
  if (!assets.length) { toast('No assets selected', 'error'); return; }

  document.getElementById('uploadToR2Btn').disabled = true;
  toast('Uploading to Cloudflare R2…', 'info');

  try {
    const res = await fetch(`${getBackendUrl()}/api/upload-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assets }),
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const data = await res.json();
    toast(`Uploaded ${data.uploaded || assets.length} assets to R2`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    document.getElementById('uploadToR2Btn').disabled = false;
  }
}

/* ── Event wiring ───────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Expose for shell.js cross-department navigation
  window.__pgSetTab = setActiveTab;

  // Top-tab strip — switch the sub-tab within the active module.
  document.querySelectorAll('.module-tab[data-subtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.subtab;
      const mod = MODULE_OF_TAB[tab];
      if (mod) State.set(`lastTab_${mod}`, tab);
      State.set('activeTab', tab);
    });
  });

  // Blog > Assets sub-sub-tabs (Brand identity / Voice / Style guide).
  document.querySelectorAll('.assets-subtab[data-asubtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.asubtab;
      // Toggle siblings within the same assets-subnav strip.
      btn.parentElement.querySelectorAll('.assets-subtab').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      // Toggle the matching panel in the sibling .assets-subpanels container.
      const panels = btn.closest('section').querySelector('.assets-subpanels');
      if (panels) {
        panels.querySelectorAll('.assets-subpanel').forEach(p => {
          p.classList.toggle('active', p.id === target);
        });
      }
    });
  });

  // Publisher profile → imprint name sync
  const profileEl = document.getElementById('publisherProfile');
  const publisherEl = document.getElementById('publisher');
  if (profileEl && publisherEl) {
    const PROFILE_NAMES = {
      pathfinda: 'PathFinda Publishers',
      digitalNation: 'Digital Nation Inc.',
    };
    profileEl.addEventListener('change', () => {
      const name = PROFILE_NAMES[profileEl.value];
      if (name) publisherEl.value = name;
    });
  }

  // Job mode — generate vs refine existing manuscript
  const jobModeEl = document.getElementById('jobMode');
  const importSection = document.getElementById('manuscriptImportSection');
  const conceptSection = document.getElementById('bookConceptSection');
  const topicRequired = document.getElementById('topicRequired');
  const generateBtnLabel = document.querySelector('#generateBtn span');

  function syncJobModeUi () {
    const refine = jobModeEl?.value === 'refine';
    importSection?.classList.toggle('hidden', !refine);
    conceptSection?.classList.toggle('hidden', false);
    topicRequired?.classList.toggle('hidden', refine);
    document.getElementById('refineStyleHint')?.classList.toggle('hidden', !refine);
    const topicLabel = document.querySelector('label[for="topic"]');
    const topicField = document.getElementById('topic');
    if (topicLabel) {
      topicLabel.innerHTML = refine
        ? 'Editorial brief <span class="field-hint">(optional)</span>'
        : 'Topic prompt <span class="required" id="topicRequired">*</span>';
    }
    if (topicField) {
      topicField.placeholder = refine
        ? 'Optional: describe the book promise, angle, or what the finished edition should feel like.'
        : 'Example: A conversion-focused guide for salon owners who want to use Instagram Reels to book more high-ticket clients — without dancing or going viral.';
    }
    if (generateBtnLabel) {
      generateBtnLabel.textContent = refine ? 'Refine & Export Book' : 'Generate Draft';
    }
  }
  jobModeEl?.addEventListener('change', syncJobModeUi);
  syncJobModeUi();

  // eBook genre sub-category
  const intentEl = document.getElementById('publishingIntent');
  const genreField = document.getElementById('ebookGenreField');
  function syncEbookGenre () {
    genreField?.classList.toggle('hidden', intentEl?.value !== 'ebook');
  }
  intentEl?.addEventListener('change', syncEbookGenre);
  syncEbookGenre();

  // Manuscript file upload → parse via API or read as text
  (function wireManuscriptImport () {
    const zone = document.getElementById('manuscriptZone');
    const input = document.getElementById('manuscriptFile');
    const paste = document.getElementById('manuscriptPaste');
    const stats = document.getElementById('manuscriptStats');
    const clear = document.getElementById('manuscriptClear');
    if (!zone || !input) return;

    async function applyManuscriptFile (file) {
      if (!file) return;
      zone.classList.add('has-file');
      document.getElementById('manuscriptFilename').textContent = file.name;
      const isText = /\.(txt|md|markdown)$/i.test(file.name) || file.type.startsWith('text/');

      try {
        if (isText) {
          const text = await file.text();
          State.set('importedManuscriptText', text);
          if (paste) paste.value = text;
        } else {
          toast('Parsing manuscript…', 'info');
          const res = await fetch(
            `${getBackendUrl()}/api/manuscript/parse?filename=${encodeURIComponent(file.name)}`,
            { method: 'POST', body: file },
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          const text = (data.sections || []).map(s => `${s.title}\n\n${s.body}`).join('\n\n') || '';
          State.set('importedManuscriptText', text);
          if (paste) paste.value = text;
          if (!document.getElementById('title')?.value && data.title) {
            document.getElementById('title').value = data.title;
          }
        }
        updateStats();
        toast('Manuscript loaded', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    }

    function updateStats () {
      const text = getImportedManuscriptText();
      if (!stats) return;
      if (!text) { stats.textContent = ''; return; }
      const words = text.split(/\s+/).filter(Boolean).length;
      const chapters = (text.match(/^(?:chapter|part|section)\s+[\dIVX]+/gim) || []).length;
      stats.textContent = `${words.toLocaleString()} words${chapters ? ` · ~${chapters} detected sections` : ''}`;
    }

    zone.addEventListener('click', e => {
      if (clear && e.target === clear) return;
      input.click();
    });
    input.addEventListener('change', () => applyManuscriptFile(input.files[0]));
    paste?.addEventListener('input', () => {
      State.set('importedManuscriptText', paste.value);
      updateStats();
    });
    clear?.addEventListener('click', e => {
      e.stopPropagation();
      input.value = '';
      if (paste) paste.value = '';
      State.set('importedManuscriptText', '');
      zone.classList.remove('has-file');
      document.getElementById('manuscriptFilename').textContent = '';
      updateStats();
    });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) applyManuscriptFile(file);
    });
  })();

  // Brief form submit
  document.getElementById('briefForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = collectFormData();
    if (fd.jobMode === 'refine') {
      if (!fd.manuscriptText) {
        toast('Upload or paste your manuscript first.', 'error');
        return;
      }
    } else if (!fd.topic) {
      toast('Please enter a topic prompt.', 'error');
      return;
    }
    if (!getBackendUrl().startsWith('http')) {
      toast('Configure your backend URL in Settings first.', 'error');
      document.getElementById('settingsModal').style.display = 'flex';
      return;
    }
    await runGenerate(fd);
  });

  // Assets search
  document.getElementById('searchAssetsBtn').addEventListener('click', () => {
    const q = document.getElementById('pexelsQuery').value.trim();
    const aspect = document.getElementById('aspectFilter').value;
    if (!q) { toast('Enter a search keyword', 'error'); return; }
    searchAssets(q, aspect);
  });
  document.getElementById('pexelsQuery').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('searchAssetsBtn').click();
  });

  // Upload R2
  document.getElementById('uploadToR2Btn').addEventListener('click', uploadAssetsToR2);

  // Download buttons
  document.getElementById('downloadHtmlBtn').addEventListener('click', downloadHtml);
  document.getElementById('downloadJsonBtn').addEventListener('click', downloadJson);
  document.getElementById('downloadPdfBtn').addEventListener('click', downloadPdf);
  document.getElementById('downloadEpubBtn').addEventListener('click', downloadEpub);
  document.getElementById('downloadDocxBtn').addEventListener('click', downloadDocx);

  // Settings modal
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').style.display = 'flex';
    UI.renderSettings();
  });
  document.getElementById('closeSettings').addEventListener('click', () => {
    document.getElementById('settingsModal').style.display = 'none';
  });
  document.getElementById('cancelSettings').addEventListener('click', () => {
    document.getElementById('settingsModal').style.display = 'none';
  });
  document.getElementById('saveSettings').addEventListener('click', () => {
    const fields = ['backendUrl','cmsToken','brandLogoUrl','brandPrimaryColor','brandSecondaryColor','brandFontStack'];
    const updated = {};
    fields.forEach(f => { updated[f] = document.getElementById(f)?.value?.trim() || ''; });
    State.patch('settings', updated);
    State.saveSettings();
    document.getElementById('settingsModal').style.display = 'none';
    UI.render('settings');
    toast('Settings saved', 'success');
  });
  document.getElementById('settingsModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  // Colour swatch ↔ text input sync in settings modal
  ['brandPrimaryColor','brandSecondaryColor'].forEach(id => {
    const swatch = document.getElementById(id);
    const text   = document.getElementById(id + 'Text');
    if (!swatch || !text) return;
    swatch.addEventListener('input', () => { text.value = swatch.value; });
    text.addEventListener('input', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(text.value)) swatch.value = text.value;
    });
  });

  // Auto-expand textareas
  document.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    });
  });

  // Clip from extension: ?clip=URL&topic=TITLE pre-fills brief
  const params = new URLSearchParams(window.location.search);
  if (params.get('clip')) {
    const topicEl = document.getElementById('topic');
    topicEl.value = `Research and publish: ${params.get('topic') || params.get('clip')}`;
    topicEl.dispatchEvent(new Event('input'));
    toast('Topic pre-filled from browser clipper', 'info');
  }

  // ── Assets tab: colour swatches ──────────────────────────────────────────
  (function wireSwatches () {
    const swatches   = [
      document.getElementById('swatch1'),
      document.getElementById('swatch2'),
      document.getElementById('swatch3'),
    ];
    const hexRow     = document.getElementById('paletteHexRow');
    const hiddenText = document.getElementById('projBrandPalette');
    if (!swatches[0] || !hexRow || !hiddenText) return;

    function updatePaletteUi () {
      const vals = swatches.map(s => s.value);
      // Rebuild hex chip spans
      hexRow.innerHTML = vals.map(v =>
        `<span class="palette-hex-chip"><span class="palette-hex-dot" style="background:${v}"></span>${v}</span>`
      ).join('');
      // Keep hidden input in sync for collectFormData
      hiddenText.value = vals.join(', ');
    }

    swatches.forEach(s => s.addEventListener('input', updatePaletteUi));
  })();

  // ── Assets tab: upload zones ──────────────────────────────────────────────
  (function wireUploadZones () {

    // Generic single-file zone helper
    function setupSingleZone ({ zoneId, inputId, previewId, filenameId, clearId }) {
      const zone     = document.getElementById(zoneId);
      const input    = document.getElementById(inputId);
      const preview  = document.getElementById(previewId);
      const filename = document.getElementById(filenameId);
      const clear    = document.getElementById(clearId);
      if (!zone || !input) return;

      function applyFile (file) {
        if (!file) return;
        zone.classList.add('has-file');
        if (filename) filename.textContent = file.name;
        if (preview && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = e => { preview.src = e.target.result; };
          reader.readAsDataURL(file);
        }
      }

      function clearFile () {
        input.value = '';
        zone.classList.remove('has-file');
        if (preview)  { preview.src = ''; }
        if (filename) { filename.textContent = ''; }
      }

      // Click anywhere on the zone (except the clear btn) triggers file pick
      zone.addEventListener('click', e => {
        if (clear && e.target === clear) return;
        input.click();
      });
      input.addEventListener('change', () => applyFile(input.files[0]));
      if (clear) clear.addEventListener('click', e => { e.stopPropagation(); clearFile(); });

      // Drag-and-drop
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        // Assign to the hidden file input via DataTransfer
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        applyFile(file);
      });
    }

    // Multi-file zone helper (refs)
    function setupMultiZone ({ zoneId, inputId, countId, clearId }) {
      const zone  = document.getElementById(zoneId);
      const input = document.getElementById(inputId);
      const count = document.getElementById(countId);
      const clear = document.getElementById(clearId);
      if (!zone || !input) return;

      function applyFiles (files) {
        if (!files || files.length === 0) return;
        zone.classList.add('has-file');
        if (count) count.textContent = files.length === 1
          ? '1 file selected'
          : `${files.length} files selected`;
      }

      function clearFiles () {
        input.value = '';
        zone.classList.remove('has-file');
        if (count) count.textContent = '';
      }

      zone.addEventListener('click', e => {
        if (clear && e.target === clear) return;
        input.click();
      });
      input.addEventListener('change', () => applyFiles(input.files));
      if (clear) clear.addEventListener('click', e => { e.stopPropagation(); clearFiles(); });

      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const dt2 = new DataTransfer();
        Array.from(e.dataTransfer.files).forEach(f => dt2.items.add(f));
        input.files = dt2.files;
        applyFiles(input.files);
      });
    }

    setupSingleZone({ zoneId: 'logoZone',  inputId: 'projBrandLogo',    previewId: 'logoPreview',  filenameId: 'logoFilename', clearId: 'logoClear'  });
    setupSingleZone({ zoneId: 'coverZone', inputId: 'projCoverImage',   previewId: 'coverPreview', filenameId: 'coverFilename', clearId: 'coverClear' });
    setupMultiZone ({ zoneId: 'refsZone',  inputId: 'projCharacterRefs', countId: 'refsCount',      clearId: 'refsClear' });
  })();

  // ── Assets tab: PDF template selection ───────────────────────────────────
  (function wireTemplateCards () {
    const grid = document.getElementById('templateGrid');
    if (!grid) return;
    grid.addEventListener('click', e => {
      const card = e.target.closest('.template-card');
      if (!card) return;
      grid.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      // Reflect choice in a hidden input if present (for form collection)
      let hidden = document.getElementById('projTemplate');
      if (!hidden) {
        hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.id   = 'projTemplate';
        document.getElementById('briefForm')?.appendChild(hidden);
      }
      if (hidden) hidden.value = card.dataset.template || '';
    });
  })();

  // ── Assets tab: learning library — 3 persistent folders ─────────────────
  (function wireLibrary () {
    const FOLDERS = [
      'playbooks', 'research', 'case-studies', 'frameworks',
      'ebook/non-fiction', 'ebook/fiction', 'ebook/back-cover',
    ];

    function fmtSize (bytes) {
      if (!bytes) return '';
      return bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(0)} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function fmtDate (iso) {
      if (!iso) return '';
      try { return new Date(iso).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' }); }
      catch { return ''; }
    }

    // Show a status message inside the folder card — persists until replaced
    function setStatus (folder, msg, type) {
      const el = document.getElementById(`libStatus-${libFolderSlug(folder)}`);
      if (!el) return;
      el.textContent = msg;
      el.className   = 'lib-folder-status' + (type ? ' lib-status-' + type : '');
    }

    // Render the file list for a folder given an array of file objects
    function renderFiles (folder, files) {
      const listEl = document.getElementById(`libList-${libFolderSlug(folder)}`);
      if (!listEl) return;
      if (!files.length) {
        listEl.innerHTML = '<div class="library-empty">No examples yet — upload PDFs to train the agent.</div>';
        return;
      }
      listEl.innerHTML = files.map(f => `
        <div class="library-item">
          <svg class="library-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="library-item-name" title="${f.name}">${f.name}</span>
          <span class="library-item-size">${fmtSize(f.size)}</span>
          <span class="library-item-date">${fmtDate(f.uploaded)}</span>
          <button type="button" class="library-item-remove" data-key="${encodeURIComponent(f.key)}" data-folder="${folder}" title="Delete">×</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.library-item-remove').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          const name = decodeURIComponent(btn.dataset.key).split('/').pop();
          if (!confirm(`Delete "${name}"?`)) return;
          btn.disabled = true; btn.textContent = '…';
          const fldr = btn.dataset.folder;
          const key  = decodeURIComponent(btn.dataset.key);
          try {
            const res = await fetch(`/api/library-file/${encodeURIComponent(key)}`, { method: 'DELETE' });
            if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error || `HTTP ${res.status}`); }
            setStatus(fldr, `✓ "${name}" deleted.`, 'success');
            await loadFolder(fldr);
          } catch (err) {
            btn.disabled = false; btn.textContent = '×';
            setStatus(fldr, `⚠ Delete failed: ${err.message}`, 'error');
          }
        });
      });
    }

    // Fetch the file list from the server and render it
    async function loadFolder (folder, keepStatus) {
      const listEl = document.getElementById(`libList-${libFolderSlug(folder)}`);
      if (!listEl) return;
      if (!keepStatus) setStatus(folder, '', '');
      listEl.innerHTML = '<div class="library-empty lib-loading">Loading…</div>';
      try {
        const res = await fetch(`/api/library/${encodeURIComponent(folder)}`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data  = await res.json();
        const files = data.files || [];
        renderFiles(folder, files);
        // Update the folder header badge
        const badge = document.getElementById(`libCount-${libFolderSlug(folder)}`);
        if (badge) badge.textContent = files.length ? `${files.length} file${files.length > 1 ? 's' : ''}` : '';
      } catch (e) {
        listEl.innerHTML = `<div class="library-empty lib-error">⚠ Could not load files: ${e.message}</div>`;
      }
    }

    async function uploadFiles (folder, files) {
      const pdfs = Array.from(files).filter(f =>
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
      if (!pdfs.length) {
        setStatus(folder, '⚠ Only PDF files are accepted.', 'error');
        return;
      }

      const label = document.querySelector(`label[for="libUpload-${libFolderSlug(folder)}"]`);
      if (label) { label.style.opacity = '0.5'; label.style.pointerEvents = 'none'; }

      const succeeded = [];
      const failed    = [];

      for (let i = 0; i < pdfs.length; i++) {
        const file = pdfs[i];
        setStatus(folder, `Uploading ${i + 1} of ${pdfs.length}: "${file.name}"…`, 'uploading');
        try {
          const res = await fetch(
            `/api/library/${encodeURIComponent(folder)}/upload?filename=${encodeURIComponent(file.name)}`,
            { method: 'POST', body: file, headers: { 'Content-Type': 'application/pdf' } }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
          succeeded.push(file.name);
        } catch (err) {
          failed.push(`"${file.name}": ${err.message}`);
        }
      }

      if (label) { label.style.opacity = ''; label.style.pointerEvents = ''; }

      // Show result — stays visible until next action
      if (failed.length && !succeeded.length) {
        setStatus(folder, `⚠ Upload failed — ${failed.join(' · ')}`, 'error');
      } else if (failed.length) {
        setStatus(folder, `⚠ ${succeeded.length} uploaded, ${failed.length} failed: ${failed.join(' · ')}`, 'error');
      } else {
        setStatus(folder,
          succeeded.length === 1
            ? `✓ "${succeeded[0]}" saved to library.`
            : `✓ ${succeeded.length} files saved to library.`,
          'success');
      }

      // Reload file list — keepStatus=true so the message above stays visible
      await loadFolder(folder, true);
    }

    FOLDERS.forEach(folder => {
      const input = document.getElementById(`libUpload-${libFolderSlug(folder)}`);
      if (!input) return;
      input.addEventListener('change', async () => {
        const files = Array.from(input.files);
        input.value = '';
        await uploadFiles(folder, files);
      });
      loadFolder(folder);
    });
  })();

  // Initial render
  UI.render('settings');
  UI.render('activeModule');
  UI.render('activeTab');
  UI.render('selectedAssets');
  UI.render('result');
  if (window.PathGuruShell) {
    window.PathGuruShell.updateChrome(State.get('activeTab'), State.get('activeModule'));
  }
});
