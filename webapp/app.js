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
  // Publishing module
  brief: 'publishing', assets: 'publishing', compile: 'publishing',
  // Blog module
  blog: 'blog', 'blog-assets': 'blog',
  // Shop module
  'shop-subs': 'shop', 'shop-bookings': 'shop', 'shop-payments': 'shop',
  'shop-terms': 'shop', 'shop-shipping': 'shop', 'shop-analytics': 'shop',
};
const DEFAULT_TAB_OF_MODULE = {
  publishing: 'brief',
  blog: 'blog',
  shop: 'shop-subs',
};

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

    set (key, value) {
      _data[key] = value;
      // When the sub-tab changes, derive and update activeModule so
      // sidebar highlighting stays in sync without callers having to
      // touch both pieces of state.
      if (key === 'activeTab') {
        const mod = MODULE_OF_TAB[value];
        if (mod && mod !== _data.activeModule) {
          _data.activeModule = mod;
          _listeners.forEach(fn => fn('activeModule', mod));
          UI.render('activeModule');
        }
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

  /* Sidebar modules — show only the active shell */
  function renderModules () {
    const mod = State.get('activeModule');
    document.querySelectorAll('.module-shell').forEach(s => {
      s.classList.toggle('active', s.dataset.module === mod);
    });
    document.querySelectorAll('.nav-btn[data-module]').forEach(b => {
      b.classList.toggle('active', b.dataset.module === mod);
    });
  }

  /* Sub-tabs — show the matching tab-panel and highlight the module-tab */
  function renderTabs () {
    const tab = State.get('activeTab');
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tab}`);
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
    $('downloadPdfBtn').disabled  = !r.pdfUrl && !r.html;
    $('downloadEpubBtn').disabled = !r.epubUrl;
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
    const fields = ['brandLogoUrl','brandPrimaryColor','brandSecondaryColor','brandFontStack'];
    fields.forEach(f => {
      const el = document.getElementById(f);
      if (el) el.value = s[f] || '';
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
async function runGenerate (formData) {
  State.set('isGenerating', true);
  State.set('error', null);
  State.set('progress', 5);
  State.set('statusMessage', 'Connecting to PathGuru backend…');

  const steps = [
    [15, 'Running Tavily research…'],
    [35, 'Editorial agents drafting manuscript…'],
    [60, 'Design agent applying layout…'],
    [78, 'Formatting for KDP spec…'],
    [90, 'Running compliance checks…'],
    [97, 'Compiling output files…'],
  ];

  let stepIndex = 0;
  const ticker = setInterval(() => {
    if (stepIndex < steps.length) {
      const [pct, msg] = steps[stepIndex++];
      State.set('progress', pct);
      State.set('statusMessage', msg);
    }
  }, 3200);

  try {
    const res = await fetch(`${getBackendUrl()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    clearInterval(ticker);

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(body.error || `Server returned ${res.status}`);
    }

    const data = await res.json();
    State.set('progress', 100);
    State.set('statusMessage', 'Draft complete!');
    State.set('result', data);
    State.set('activeTab', 'compile');
    toast('Draft generated successfully', 'success');

    // Suggest asset keywords if research came back
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
function collectFormData () {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const trimParts = get('trimSize').split('x');

  return {
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
    format:             get('format'),
    kdpFormat:          'paperback',
    trimWidthIn:        parseFloat(trimParts[0]) || 6,
    trimHeightIn:       parseFloat(trimParts[1]) || 9,
    length:             get('length'),
    brandLogoUrl:       State.get('settings').brandLogoUrl || '',
    brandPrimaryColor:  State.get('settings').brandPrimaryColor || '',
    brandSecondaryColor:State.get('settings').brandSecondaryColor || '',
    brandFontStack:     State.get('settings').brandFontStack || '',
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
  // Fallback: print the preview iframe
  const frame = document.getElementById('previewFrame');
  if (frame?.contentWindow) {
    frame.contentWindow.print();
  } else {
    toast('No PDF available yet. Generate a draft first.', 'error');
  }
}

function downloadEpub () {
  const r = State.get('result');
  if (!r?.epubUrl) { toast('No EPUB available.', 'error'); return; }
  window.open(r.epubUrl, '_blank');
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
  // Sidebar — pick a module (jumps to that module's default sub-tab).
  document.querySelectorAll('.nav-btn[data-module]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mod = btn.dataset.module;
      const defaultTab = DEFAULT_TAB_OF_MODULE[mod];
      // Remember last-visited sub-tab per module so the user comes back to it.
      const remembered = State.get(`lastTab_${mod}`);
      State.set('activeTab', remembered || defaultTab);
    });
  });

  // Top-tab strip — switch the sub-tab within the active module.
  document.querySelectorAll('.module-tab[data-subtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.subtab;
      const mod = MODULE_OF_TAB[tab];
      // Remember per-module last sub-tab.
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

  // Brief form submit
  document.getElementById('briefForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = collectFormData();
    if (!fd.topic) { toast('Please enter a topic prompt.', 'error'); return; }
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
    const fields = ['backendUrl','brandLogoUrl','brandPrimaryColor','brandSecondaryColor','brandFontStack'];
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

  // Initial render
  UI.render('settings');
  UI.render('activeModule');
  UI.render('activeTab');
  UI.render('selectedAssets');
  UI.render('result');
});
