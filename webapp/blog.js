/**
 * PathGuru Publishers — Blog Publisher Logic (Phase 3)
 */
'use strict';
(function () {
  let currentBlogResult = null;
  let mediaFiles = []; // { file, name, type } — reference files for writer agent

  function getBackendUrl() {
    return window.PathGuruBackend?.getBackendUrl?.() || window.location.origin.replace(/\/$/, '');
  }

  function blogToast(msg, type = 'info') {
    let c = document.querySelector('.toast-container');
    if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<div class="toast-dot"></div><span>${msg.replace(/</g, '&lt;')}</span>`;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }

  function setBlogLoading(on) {
    const idle    = document.getElementById('blogStatusIdle');
    const loading = document.getElementById('blogStatusLoading');
    const errEl   = document.getElementById('blogStatusError');
    const btn     = document.getElementById('blogGenerateBtn');
    if (idle)   idle.classList.toggle('hidden', on);
    if (loading) loading.classList.toggle('hidden', !on);
    if (errEl)  errEl.classList.add('hidden');
    if (btn)    btn.disabled = on;
  }

  function setBlogProgress(pct, msg) {
    const bar = document.getElementById('blogProgressBar');
    const txt = document.getElementById('blogStatusMsg');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = msg;
  }

  function setResultButtons(_on) {
    // Preview / SEO tabs are now in the sub-menu bar; nothing to enable/disable here.
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Persona pickers ────────────────────────────────────────────────
  // Populates BOTH the Compose section picker AND the Assets > Voice picker.
  async function loadPersonas() {
    const pickers = [
      document.getElementById('blogComposePicker'), // in Generate / Compose tab
      document.getElementById('blogPersonaPicker'),  // in Assets > Voice & Persona
    ].filter(Boolean);
    if (!pickers.length) return;
    const backendUrl = getBackendUrl();
    if (!backendUrl.startsWith('http')) return;
    try {
      const res = await fetch(`${backendUrl}/api/personas`);
      if (!res.ok) return;
      const { personas = [] } = await res.json();
      if (!personas.length) return;
      pickers.forEach(picker => {
        const blank = picker.querySelector('option[value=""]');
        picker.innerHTML = '';
        if (blank) picker.appendChild(blank);
        personas.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.displayName} — ${p.title}`;
          picker.appendChild(opt);
        });
      });
    } catch {}
  }

  // ── Preview tab switching ───────────────────────────────────────────
  function switchPreviewTab(tabName) {
    document.querySelectorAll('.blog-preview-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.previewtab === tabName);
    });
    document.querySelectorAll('.blog-preview-pane').forEach(pane => {
      pane.classList.remove('active');
    });
    const target = tabName === 'preview' ? 'blogPreviewPane' : 'blogSeoPane';
    document.getElementById(target)?.classList.add('active');
  }

  // ── Contenteditable preview ────────────────────────────────────────
  function showBlogPreview(html) {
    const content = document.getElementById('blogPostContent');
    const empty   = document.getElementById('blogPreviewEmpty');
    if (!content) return;
    content.innerHTML = html;
    content.style.display = 'block';
    empty.style.display   = 'none';
    // Show edit toggle
    const editToggle = document.getElementById('blogEditToggle');
    if (editToggle) editToggle.style.display = '';
    // Switch to preview tab automatically
    switchPreviewTab('preview');
  }

  function setEditMode(on) {
    const content = document.getElementById('blogPostContent');
    const btn     = document.getElementById('blogEditToggle');
    if (!content) return;
    content.contentEditable = on ? 'true' : 'false';
    content.style.cursor = on ? 'text' : 'default';
    if (btn) btn.textContent = on ? '✅ Done editing' : '✏️ Edit draft';
  }

  // ── Render result ──────────────────────────────────────────────────
  function renderBlogResult(data) {
    currentBlogResult = data;
    const { seo, socialCaptions, publishResults, html, persona } = data;

    // --- SEO list ---
    const seoList = document.getElementById('blogSeoList');
    seoList.innerHTML = '';
    const pairs = [
      ['Written by',       persona ? `${persona.displayName} — ${persona.title}` : null],
      ['Title',            seo.title],
      ['Slug',             seo.slug],
      ['Meta description', seo.metaDescription],
      ['Focus keyword',    seo.focusKeyword],
      ['Reading time',     seo.readingTime ? `${seo.readingTime} min read` : null],
    ];
    pairs.forEach(([k, v]) => {
      if (!v) return;
      const div = document.createElement('div');
      div.className = 'strategy-item animate-in';
      div.innerHTML = `<dt>${k}</dt><dd>${String(v).slice(0, 160)}</dd>`;
      seoList.appendChild(div);
    });

    // --- Social captions ---
    const sc = document.getElementById('blogSocialCaptions');
    sc.innerHTML = '';
    if (socialCaptions?.twitter)  sc.innerHTML += `<span class="social-platform-label">Twitter / X</span><div class="social-caption-box">${socialCaptions.twitter}</div>`;
    if (socialCaptions?.linkedin) sc.innerHTML += `<span class="social-platform-label">LinkedIn</span><div class="social-caption-box">${socialCaptions.linkedin}</div>`;

    // --- Reveal SEO & Social cards (they start with `hidden` attr) ---
    document.getElementById('blogSeoCard')?.removeAttribute('hidden');
    document.getElementById('blogSocialCard')?.removeAttribute('hidden');

    // --- Show preview (switches to Preview tab automatically) ---
    showBlogPreview(html);
    setResultButtons(true);

    // --- Show Approve & Publish button ---
    const approveBtn = document.getElementById('blogApproveBtn');
    if (approveBtn) approveBtn.style.display = '';
  }

  function renderPublishResults(results) {
    const card = document.getElementById('blogPublishCard');
    const list = document.getElementById('blogPublishResults');
    if (!card || !list) return;
    card.removeAttribute('hidden');
    list.innerHTML = '';
    results.forEach(r => {
      const div = document.createElement('div');
      div.className = `publish-result ${r.error ? 'err' : 'ok'}`;
      if (r.error) {
        div.innerHTML = `
          <div class="pub-result-header">
            <span class="pub-platform">${escapeHtml(r.platform)}</span>
            <span class="pub-badge err">Failed</span>
          </div>
          <p class="pub-error-msg">${escapeHtml(r.error)}</p>`;
      } else {
        const label = r.platform === 'digifusion' ? 'DigiFusion CMS' : r.platform;
        const statusBadge = r.status === 'published' ? 'Live' : (r.status || 'Sent');
        div.innerHTML = `
          <div class="pub-result-header">
            <span class="pub-platform">${escapeHtml(label)}</span>
            <span class="pub-badge ok">${escapeHtml(statusBadge)}</span>
          </div>
          ${r.url ? `
          <a class="pub-live-link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            ${escapeHtml(r.url)}
          </a>` : ''}
          ${r.editUrl ? `<a class="pub-edit-link" href="${escapeHtml(r.editUrl)}" target="_blank" rel="noopener">Edit in CMS ↗</a>` : ''}`;
      }
      list.appendChild(div);
    });
    // Auto-switch to SEO & Social tab to show the result
    switchPreviewTab('seo');
  }

  // ── Collect form input ─────────────────────────────────────────────
  function collectBlogInput() {
    const g = id => document.getElementById(id)?.value?.trim() || '';
    // Prefer Compose section picker, fall back to Assets persona picker
    const personaId = g('blogComposePicker') || g('blogPersonaPicker');
    const aiProvider = g('blogAiProvider') || null;
    const researchBrief = g('blogResearchBrief');
    const playbookSlug  = g('blogPlaybookSlug');
    const input = {
      topic:          g('blogTopic'),
      researchBrief,
      playbookSlug,
      frameworkId:    g('blogFrameworkId'),
      postType:       g('blogPostType'),
      audience:       g('blogAudience'),
      goal:           g('blogGoal'),
      tone:           g('blogTone'),
      wordCount:      g('blogWordCount'),
      seoKeyword:     g('blogSeoKeyword'),
      ctaGoal:        g('blogCtaGoal'),
      author:         g('blogAuthor'),
      personaId:      personaId || null,
      aiProvider:     aiProvider,
      platforms:      [],
    };
    if (document.getElementById('wpEnabled')?.checked)
      input.platforms.push({ type: 'wordpress', siteUrl: g('wpUrl'), username: g('wpUser'), appPassword: g('wpPass'), status: g('wpStatus') });
    if (document.getElementById('ghostEnabled')?.checked)
      input.platforms.push({ type: 'ghost', siteUrl: g('ghostUrl'), adminApiKey: g('ghostKey'), status: g('ghostStatus') });
    if (document.getElementById('wfEnabled')?.checked)
      input.platforms.push({ type: 'webflow', apiKey: g('wfKey'), collectionId: g('wfCollection'), siteId: g('wfSite') });
    if (document.getElementById('dfEnabled')?.checked) {
      const rawSiteUrl = g('dfApiUrl');
      // Normalise: ensure https:// prefix so bare "digitafusion.com" still works
      const siteUrl = rawSiteUrl
        ? (rawSiteUrl.startsWith('http') ? rawSiteUrl : `https://${rawSiteUrl}`)
        : '';
      input.platforms.push({ type: 'digifusion', status: 'published', siteUrl });
    }
    return input;
  }

  // ── Collect platform destinations only (used by publish step) ─────
  function collectPlatforms() {
    const g = id => document.getElementById(id)?.value?.trim() || '';
    const platforms = [];
    if (document.getElementById('wpEnabled')?.checked)
      platforms.push({ type: 'wordpress', siteUrl: g('wpUrl'), username: g('wpUser'), appPassword: g('wpPass'), status: 'published' });
    if (document.getElementById('ghostEnabled')?.checked)
      platforms.push({ type: 'ghost', siteUrl: g('ghostUrl'), adminApiKey: g('ghostKey'), status: 'published' });
    if (document.getElementById('wfEnabled')?.checked)
      platforms.push({ type: 'webflow', apiKey: g('wfToken'), collectionId: g('wfCollectionId'), status: 'published' });
    if (document.getElementById('dfEnabled')?.checked) {
      const rawSiteUrl = g('dfApiUrl');
      const siteUrl = rawSiteUrl
        ? (rawSiteUrl.startsWith('http') ? rawSiteUrl : `https://${rawSiteUrl}`)
        : 'https://www.digitafusion.com';
      platforms.push({ type: 'digifusion', status: 'published', siteUrl });
    }
    return platforms;
  }

  // ── Approve & Publish ──────────────────────────────────────────────
  async function runPublish() {
    if (!currentBlogResult) { blogToast('Generate a post first.', 'error'); return; }
    const platforms = collectPlatforms();
    if (!platforms.length) {
      blogToast('Tick at least one Publish Destination in the form.', 'error');
      return;
    }
    const backendUrl = getBackendUrl();
    const approveBtn = document.getElementById('blogApproveBtn');
    if (approveBtn) { approveBtn.disabled = true; approveBtn.textContent = 'Publishing…'; }

    try {
      const res = await fetch(`${backendUrl}/api/blog/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post:             currentBlogResult.post,
          html:             currentBlogResult.html,
          platforms,
          postId:           currentBlogResult.dbResult?.id || null,
          featuredImageUrl: currentBlogResult.post?.featuredImageUrl || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Server returned ${res.status}`);
      }
      const data = await res.json();
      renderPublishResults(data.publishResults || []);
      blogToast('Post published!', 'success');
      if (approveBtn) approveBtn.style.display = 'none';
    } catch (e) {
      blogToast(e.message, 'error');
      if (approveBtn) { approveBtn.disabled = false; approveBtn.textContent = '🚀 Approve & Publish'; }
    }
  }

  // ── Generate ───────────────────────────────────────────────────────
  async function runBlogGenerate() {
    const input = collectBlogInput();
    if (!input.topic) { blogToast('Enter a derivative angle / headline.', 'error'); return; }
    const backendUrl = getBackendUrl();
    if (!backendUrl.startsWith('http')) {
      blogToast('Configure your backend URL in Settings first.', 'error');
      document.getElementById('settingsModal').style.display = 'flex';
      return;
    }
    setBlogLoading(true);
    currentBlogResult = null;
    setResultButtons(false);
    // Hide approve button and publish results from any previous run
    const approveBtn = document.getElementById('blogApproveBtn');
    if (approveBtn) { approveBtn.style.display = 'none'; approveBtn.disabled = false; approveBtn.textContent = '🚀 Approve & Publish'; }
    const pubCard = document.getElementById('blogPublishCard');
    if (pubCard) pubCard.setAttribute('hidden', '');
    // Hide SEO/Social cards so stale content from previous run isn't shown
    document.getElementById('blogSeoCard')?.setAttribute('hidden', '');
    document.getElementById('blogSocialCard')?.setAttribute('hidden', '');
    // Reset preview
    const content   = document.getElementById('blogPostContent');
    const emptyPane = document.getElementById('blogPreviewEmpty');
    if (content)   { content.innerHTML = ''; content.style.display = 'none'; }
    if (emptyPane) emptyPane.style.display = '';
    const editToggle = document.getElementById('blogEditToggle');
    if (editToggle) { editToggle.style.display = 'none'; setEditMode(false); }

    const steps = [
      [18, 'Researching topic...'],
      [35, 'Copywriter drafting hook + sections...'],
      [55, 'SEO-optimising headings + meta...'],
      [72, 'Writing social captions...'],
      [88, 'Sourcing featured image...'],
      [96, 'Finalising post...'],
    ];
    let si = 0;
    const ticker = setInterval(() => {
      if (si < steps.length) { const [p, m] = steps[si++]; setBlogProgress(p, m); }
    }, 2800);

    try {
      const res = await fetch(`${backendUrl}/api/blog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      clearInterval(ticker);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Server returned ${res.status}`);
      }
      const data = await res.json();
      setBlogProgress(100, 'Post ready!');
      renderBlogResult(data);
      blogToast('Blog post generated!', 'success');
    } catch (e) {
      clearInterval(ticker);
      document.getElementById('blogStatusIdle')?.classList.add('hidden');
      document.getElementById('blogStatusLoading')?.classList.add('hidden');
      const errEl = document.getElementById('blogStatusError');
      if (errEl) errEl.classList.remove('hidden');
      const errMsg = document.getElementById('blogErrorMsg');
      if (errMsg) errMsg.textContent = e.message;
      blogToast(e.message, 'error');
    } finally {
      setBlogLoading(false);
    }
  }

  // ── Media file list (reference files for writer agent) ─────────────
  function renderMediaList() {
    const list = document.getElementById('blogMediaList');
    if (!list) return;
    list.innerHTML = '';
    mediaFiles.forEach((item, i) => {
      const isPdf = item.file.type === 'application/pdf';
      const li = document.createElement('li');
      li.className = 'blog-media-item';
      li.innerHTML = `
        <span class="blog-media-type">${isPdf ? 'PDF' : 'IMG'}</span>
        <span>${escapeHtml(item.name)}</span>
        <button class="media-remove" data-index="${i}" title="Remove" aria-label="Remove file">×</button>
      `;
      list.appendChild(li);
    });
    list.querySelectorAll('.media-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        mediaFiles.splice(Number(btn.dataset.index), 1);
        renderMediaList();
      });
    });
  }


  /* ═══════════════════════════════════════════════════════════
     MEDIA LIBRARY — Blog Assets tab (R2 blog-media/ prefix)
  ═══════════════════════════════════════════════════════════ */
  let mediaLibAssets   = [];
  let mediaLibUploading = false;

  async function loadMediaLibrary () {
    const grid   = document.getElementById('mediaLibGrid');
    const count  = document.getElementById('mediaLibCount');
    if (!grid) return;
    grid.innerHTML = '<div class="media-lib-loading">Loading assets…</div>';
    try {
      const res  = await fetch(`${getBackendUrl()}/api/media/list`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      mediaLibAssets = data.assets || [];
      renderMediaGrid();
    } catch (e) {
      grid.innerHTML = `<div class="media-lib-empty"><p style="color:var(--red)">Error: ${escapeHtml(e.message)}</p></div>`;
    }
  }

  function renderMediaGrid () {
    const grid    = document.getElementById('mediaLibGrid');
    const count   = document.getElementById('mediaLibCount');
    const search  = document.getElementById('mediaLibSearch')?.value?.trim().toLowerCase() || '';
    const typeFilter = document.getElementById('mediaLibType')?.value || '';
    if (!grid) return;

    let assets = mediaLibAssets;
    if (search) assets = assets.filter(a => (a.key || '').toLowerCase().includes(search));
    if (typeFilter === 'image')  assets = assets.filter(a => /\.(jpe?g|png|gif|webp|svg)$/i.test(a.key));
    if (typeFilter === 'pdf')    assets = assets.filter(a => /\.pdf$/i.test(a.key));
    if (typeFilter === 'other')  assets = assets.filter(a => !/\.(jpe?g|png|gif|webp|svg|pdf)$/i.test(a.key));

    if (count) count.textContent = `${assets.length} asset${assets.length !== 1 ? 's' : ''}`;

    if (!assets.length) {
      grid.innerHTML = '<div class="media-lib-empty"><p>No assets found. Drop files above to upload.</p></div>';
      return;
    }

    grid.innerHTML = assets.map((a, i) => {
      const filename = (a.key || '').split('/').pop();
      const isImage  = /\.(jpe?g|png|gif|webp|svg)$/i.test(a.key);
      const isPdf    = /\.pdf$/i.test(a.key);
      const icon     = isPdf ? '📄' : '📎';
      const sizeKb   = a.size ? `${Math.round(a.size / 1024)} KB` : '';
      const thumb    = isImage
        ? `<img class="media-lib-thumb" src="${escapeHtml(a.url)}" alt="${escapeHtml(filename)}" loading="lazy">`
        : `<div class="media-lib-thumb-placeholder">${icon}</div>`;

      return `<div class="media-lib-item" data-index="${i}">
        ${thumb}
        <div class="media-lib-item-info">
          <span class="media-lib-item-name" title="${escapeHtml(filename)}">${escapeHtml(filename)}</span>
          ${sizeKb ? `<span class="media-lib-item-meta">${sizeKb}</span>` : ''}
        </div>
        <div class="media-lib-item-actions">
          <button class="media-lib-action-btn media-lib-copy-btn" title="Copy URL" data-url="${escapeHtml(a.url)}">⎘</button>
          <button class="media-lib-action-btn media-lib-delete-btn" title="Delete" data-key="${escapeHtml(a.key)}">🗑</button>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.media-lib-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.url).then(() => {
          blogToast('URL copied to clipboard!', 'success');
        }).catch(() => {
          blogToast(btn.dataset.url, 'info');
        });
      });
    });

    grid.querySelectorAll('.media-lib-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteMediaAsset(btn.dataset.key));
    });
  }

  function uploadMediaFile (file) {
    if (mediaLibUploading) { blogToast('Upload already in progress, please wait.', 'info'); return; }
    const MAX_MB = 20;
    if (file.size > MAX_MB * 1024 * 1024) {
      blogToast(`File too large (max ${MAX_MB} MB).`, 'error');
      return;
    }
    mediaLibUploading = true;

    const progressWrap  = document.getElementById('mediaLibProgress');
    const progressFill  = document.getElementById('mediaLibProgressFill');
    const progressLabel = document.getElementById('mediaLibProgressLabel');

    if (progressWrap)  progressWrap.classList.add('visible');
    if (progressFill)  progressFill.style.width = '0%';
    if (progressLabel) progressLabel.textContent = `Uploading ${file.name}…`;

    const params = new URLSearchParams({ filename: file.name, type: file.type || 'application/octet-stream' });
    const xhr    = new XMLHttpRequest();
    xhr.open('POST', `${getBackendUrl()}/api/media/upload?${params.toString()}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        if (progressFill)  progressFill.style.width  = `${pct}%`;
        if (progressLabel) progressLabel.textContent = `${pct}% — ${file.name}`;
      }
    });

    xhr.addEventListener('load', () => {
      mediaLibUploading = false;
      if (progressWrap) progressWrap.classList.remove('visible');
      if (xhr.status === 201) {
        blogToast(`${file.name} uploaded!`, 'success');
        loadMediaLibrary();
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
        blogToast(msg, 'error');
      }
    });

    xhr.addEventListener('error', () => {
      mediaLibUploading = false;
      if (progressWrap) progressWrap.classList.remove('visible');
      blogToast('Upload failed — network error.', 'error');
    });

    xhr.send(file);
  }

  async function deleteMediaAsset (key) {
    if (!confirm(`Delete ${key.split('/').pop()}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/media/${encodeURIComponent(key)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      blogToast('Asset deleted.', 'success');
      mediaLibAssets = mediaLibAssets.filter(a => a.key !== key);
      renderMediaGrid();
    } catch (e) { blogToast(e.message, 'error'); }
  }

  function wireMediaLibrary () {
    const dropZone = document.getElementById('mediaLibDropZone');
    const input    = document.getElementById('mediaLibInput');
    const refresh  = document.getElementById('mediaLibRefresh');
    const search   = document.getElementById('mediaLibSearch');
    const typeEl   = document.getElementById('mediaLibType');

    if (dropZone && input) {
      dropZone.addEventListener('click', () => input.click());
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) uploadMediaFile(files[0]); // upload one at a time
      });
      input.addEventListener('change', () => {
        if (input.files?.length) uploadMediaFile(input.files[0]);
        input.value = '';
      });
    }

    if (refresh) refresh.addEventListener('click', loadMediaLibrary);
    if (search)  search.addEventListener('input',  () => renderMediaGrid());
    if (typeEl)  typeEl.addEventListener('change', () => renderMediaGrid());

    // Auto-load when the blog-assets tab is clicked
    document.querySelectorAll('.module-tab[data-subtab="blog-assets"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!mediaLibAssets.length) loadMediaLibrary();
      });
    });
  }

    function wireMediaUpload() {
    const addBtn   = document.getElementById('blogMediaAddBtn');
    const fileInput = document.getElementById('blogMediaFiles');
    if (!addBtn || !fileInput) return;
    addBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      Array.from(fileInput.files).forEach(f => {
        if (!mediaFiles.find(m => m.name === f.name)) {
          mediaFiles.push({ file: f, name: f.name, type: f.type });
        }
      });
      fileInput.value = ''; // reset so same file can be re-added after removal
      renderMediaList();
    });
  }

  // ── Dashboard ──────────────────────────────────────────────────────
  function sortPosts(posts, mode) {
    const arr = posts.slice();
    if      (mode === 'oldest') arr.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    else if (mode === 'title')  arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else                        arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return arr;
  }

  function setBlogPanelMode(mode) {
    const tab = document.getElementById('tab-blog');
    if (!tab) return;
    tab.classList.remove('blog-mode-generate', 'blog-mode-dashboard', 'blog-mode-editor');
    if (mode) tab.classList.add(`blog-mode-${mode}`);
  }

  async function loadDashboard() {
    const listEl    = document.getElementById('blogDashList');
    const loadingEl = document.getElementById('blogDashLoading');
    const status    = document.getElementById('blogDashStatus')?.value   || '';
    const postType  = document.getElementById('blogDashType')?.value     || '';
    const sortMode  = document.getElementById('blogDashSort')?.value     || 'newest';
    const search    = document.getElementById('blogDashSearch')?.value?.trim() || '';
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (listEl) listEl.innerHTML = '';
    try {
      const backendUrl = getBackendUrl();
      const params = new URLSearchParams();
      if (status)   params.set('status', status);
      if (postType) params.set('postType', postType);
      params.set('limit', '100');
      const res = await fetch(`${backendUrl}/api/posts?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load posts (${res.status})`);
      const data  = await res.json();
      const posts = data.posts || [];
      const subCount = document.getElementById('blogSubtabCount');
      if (subCount) { subCount.textContent = String(posts.length); subCount.hidden = posts.length === 0; }
      if (loadingEl) loadingEl.classList.add('hidden');
      if (!posts.length) {
        listEl.innerHTML = `<div class="blog-dash-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity=".3"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><p>No posts found.</p><p style="font-size:11px;color:var(--text-muted);margin-top:4px">Try clearing filters, or generate a new post.</p></div>`;
        return;
      }
      const filtered = search ? posts.filter(p => (p.title || '').toLowerCase().includes(search.toLowerCase())) : posts;
      if (!filtered.length) { listEl.innerHTML = `<div class="blog-dash-empty"><p>No posts matching &ldquo;${escapeHtml(search)}&rdquo;.</p></div>`; return; }
      const sorted = sortPosts(filtered, sortMode);
      const eyeIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      const checkIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
      const unpublishIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
      const editIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      const deleteIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
      listEl.innerHTML = sorted.map(post => {
        const typeLabel   = (post.post_type || 'article').replace(/-/g, ' ');
        const isPublished = post.status === 'published';
        const date = new Date(post.created_at || post.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const publishedUrl = post.published_url || (isPublished && post.slug ? `/blog/${post.slug}` : '');
        return `<article class="blog-dash-card blog-dash-item" data-id="${post.id}">
          <div class="blog-dash-card-head">
            <span class="dash-status-pill ${isPublished ? 'published' : 'draft'}">${isPublished ? 'Published' : 'Draft'}</span>
            <span class="blog-dash-card-date">${date}</span>
          </div>
          <h3 class="dash-item-title">${escapeHtml(post.title || 'Untitled')}</h3>
          <div class="dash-item-meta">
            <span class="dash-type-badge">${escapeHtml(typeLabel)}</span>
            ${post.reading_time_minutes ? `<span>${post.reading_time_minutes} min read</span>` : ''}
            ${post.slug ? `<span class="dash-slug">/${escapeHtml(post.slug)}</span>` : ''}
          </div>
          <div class="dash-item-actions">
            ${publishedUrl ? `<a class="dash-icon-btn dash-icon-preview" href="${escapeHtml(publishedUrl)}" target="_blank" rel="noopener" title="View live post" aria-label="View live post">${eyeIcon}</a>` : `<button type="button" class="dash-icon-btn dash-icon-preview dash-preview" data-id="${post.id}" title="Preview post" aria-label="Preview post">${eyeIcon}</button>`}
            ${isPublished
              ? `<button type="button" class="dash-icon-btn dash-icon-unpublish dash-unpublish" data-id="${post.id}" title="Set to draft" aria-label="Set to draft">${unpublishIcon}</button>`
              : `<button type="button" class="dash-icon-btn dash-icon-publish dash-publish" data-id="${post.id}" title="Publish post" aria-label="Publish post">${checkIcon}</button>`}
            <button type="button" class="dash-icon-btn dash-icon-edit dash-edit" data-id="${post.id}" data-slug="${escapeHtml(post.slug || '')}" title="Edit post" aria-label="Edit post">${editIcon}</button>
            <button type="button" class="dash-icon-btn dash-icon-delete dash-delete" data-id="${post.id}" title="Delete post" aria-label="Delete post">${deleteIcon}</button>
          </div>
        </article>`;
      }).join('');
      listEl.querySelectorAll('.dash-publish').forEach(btn   => btn.addEventListener('click', () => handlePublishAction(btn.dataset.id, 'publish')));
      listEl.querySelectorAll('.dash-unpublish').forEach(btn => btn.addEventListener('click', () => handlePublishAction(btn.dataset.id, 'unpublish')));
      listEl.querySelectorAll('.dash-preview').forEach(btn   => btn.addEventListener('click', () => handlePreviewAction(btn.dataset.id)));
      listEl.querySelectorAll('.dash-delete').forEach(btn    => btn.addEventListener('click', () => handleDeleteAction(btn.dataset.id)));
      listEl.querySelectorAll('.dash-edit').forEach(btn      => btn.addEventListener('click', () => handleEditAction(btn.dataset.id, btn.dataset.slug)));
    } catch (e) {
      if (loadingEl) loadingEl.classList.add('hidden');
      if (listEl) listEl.innerHTML = `<div class="blog-dash-empty"><p style="color:var(--red)">Error: ${escapeHtml(e.message)}</p></div>`;
    }
  }

  async function handlePublishAction(id, action) {
    try {
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/posts/${id}/${action}`, { method: 'PATCH' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Failed to ${action} post`); }
      blogToast(`Post ${action === 'publish' ? 'published' : 'unpublished'}!`, 'success');
      loadDashboard();
    } catch (e) { blogToast(e.message, 'error'); }
  }

  async function handlePreviewAction(id) {
    try {
      const backendUrl = getBackendUrl();
      const res  = await fetch(`${backendUrl}/api/posts/${id}`);
      if (!res.ok) throw new Error('Failed to load post');
      const post = await res.json();
      document.querySelector('[data-blogtab="generate"]').click();
      if (post.content) { showBlogPreview(post.content); setResultButtons(true); }
    } catch (e) { blogToast(e.message, 'error'); }
  }

  async function handleDeleteAction(id) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/posts/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to delete post'); }
      blogToast('Post deleted.', 'success');
      loadDashboard();
    } catch (e) { blogToast(e.message, 'error'); }
  }

  // ── Editor ─────────────────────────────────────────────────────────
  let _editorSourceMode = false;

  function switchBlogView(viewId) {
    document.querySelectorAll('.blog-view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    if (viewId === 'blogViewDashboard') {
      setBlogPanelMode('dashboard');
      document.querySelectorAll('.blog-subtab').forEach(b => b.classList.remove('active'));
      document.querySelector('.blog-subtab[data-blogtab="dashboard"]')?.classList.add('active');
      loadDashboard();
    } else if (viewId === 'blogViewEditor') {
      setBlogPanelMode('editor');
    } else if (viewId === 'blogViewGenerate') {
      setBlogPanelMode('generate');
    }
  }

  async function handleEditAction(id, slug) {
    try {
      const backendUrl = getBackendUrl();
      const res  = await fetch(`${backendUrl}/api/posts/${encodeURIComponent(slug || id)}`);
      if (!res.ok) throw new Error('Could not load post');
      const post = await res.json();

      // Populate meta fields
      document.getElementById('blogEditorPostId').value    = post.id    || id;
      document.getElementById('blogEditorPostSlug').value  = post.slug  || slug || '';
      document.getElementById('blogEditorTitle').value     = post.title || '';
      document.getElementById('blogEditorSlug').value      = post.slug  || '';
      document.getElementById('blogEditorAuthor').value    = post.author_name || '';
      document.getElementById('blogEditorMeta').value      = post.meta_description || '';
      document.getElementById('blogEditorKeyword').value   = post.focus_keyword    || '';

      // Status badge
      const badge = document.getElementById('blogEditorStatusBadge');
      const isPublished = post.status === 'published';
      badge.textContent  = isPublished ? 'Published' : 'Draft';
      badge.className    = `blog-editor-status-badge ${isPublished ? 'published' : 'draft'}`;

      // Populate editor
      const area   = document.getElementById('blogEditorArea');
      const source = document.getElementById('blogEditorSource');
      area.innerHTML = post.content || '';
      source.value   = post.content || '';

      // Reset source mode
      _editorSourceMode = false;
      area.removeAttribute('hidden');
      source.classList.remove('visible');
      source.hidden = true;
      document.getElementById('editorSourceToggle')?.classList.remove('active');

      switchBlogView('blogViewEditor');
    } catch (e) { blogToast(e.message, 'error'); }
  }

  async function handleSaveEdit() {
    const id      = document.getElementById('blogEditorPostId').value;
    const oldSlug = document.getElementById('blogEditorPostSlug').value;
    if (!id) return;

    // Sync source textarea → editor area if in source mode
    if (_editorSourceMode) {
      document.getElementById('blogEditorArea').innerHTML =
        document.getElementById('blogEditorSource').value;
    }

    const content = document.getElementById('blogEditorArea').innerHTML;
    const title   = document.getElementById('blogEditorTitle').value.trim();
    const slug    = document.getElementById('blogEditorSlug').value.trim() || oldSlug;

    const payload = {
      title,
      slug,
      content,
      authorName:      document.getElementById('blogEditorAuthor').value.trim(),
      metaDescription: document.getElementById('blogEditorMeta').value.trim(),
      focusKeyword:    document.getElementById('blogEditorKeyword').value.trim(),
      status:          document.getElementById('blogEditorStatusBadge')?.classList.contains('published')
        ? 'published' : 'draft',
    };

    const saveBtn = document.getElementById('blogEditorSave');
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    try {
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/posts/${encodeURIComponent(id)}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Save failed');
      }
      blogToast('Post saved!', 'success');
      document.getElementById('blogEditorPostSlug').value = slug;
    } catch (e) {
      blogToast(e.message, 'error');
    } finally {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save changes';
    }
  }

  function execEditorCmd(cmd, value) {
    document.getElementById('blogEditorArea').focus();
    document.execCommand(cmd, false, value !== undefined ? value : null);
  }

  function updateToolbarState() {
    document.querySelectorAll('.editor-tool-btn[data-cmd]').forEach(btn => {
      try { btn.classList.toggle('active', document.queryCommandState(btn.dataset.cmd)); }
      catch (_) {}
    });
  }

  function wireEditorToolbar() {
    // Inline command buttons (Bold, Italic, etc.)
    document.querySelectorAll('.editor-tool-btn[data-cmd]').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        execEditorCmd(btn.dataset.cmd);
      });
    });

    // Font family
    const fontFamilyEl = document.getElementById('editorFontFamily');
    if (fontFamilyEl) fontFamilyEl.addEventListener('change', () => {
      if (fontFamilyEl.value) execEditorCmd('fontName', fontFamilyEl.value);
    });

    // Font size
    const fontSizeEl = document.getElementById('editorFontSize');
    if (fontSizeEl) fontSizeEl.addEventListener('change', () => {
      if (fontSizeEl.value) execEditorCmd('fontSize', fontSizeEl.value);
    });

    // Block format (H1-H4, p, blockquote, pre)
    const blockFmtEl = document.getElementById('editorBlockFormat');
    if (blockFmtEl) blockFmtEl.addEventListener('change', () => {
      if (blockFmtEl.value) execEditorCmd('formatBlock', blockFmtEl.value);
    });

    // Text colour
    const textColorEl = document.getElementById('editorTextColor');
    if (textColorEl) textColorEl.addEventListener('input', () => execEditorCmd('foreColor', textColorEl.value));

    // Highlight colour
    const bgColorEl = document.getElementById('editorBgColor');
    if (bgColorEl) bgColorEl.addEventListener('input', () => execEditorCmd('hiliteColor', bgColorEl.value));

    // Insert link
    const linkBtn = document.getElementById('editorInsertLink');
    if (linkBtn) linkBtn.addEventListener('click', () => {
      const url = prompt('Enter URL:');
      if (url) execEditorCmd('createLink', url);
    });

    // Source toggle
    const sourceToggle = document.getElementById('editorSourceToggle');
    if (sourceToggle) sourceToggle.addEventListener('click', () => {
      const area   = document.getElementById('blogEditorArea');
      const source = document.getElementById('blogEditorSource');
      _editorSourceMode = !_editorSourceMode;
      if (_editorSourceMode) {
        source.value = area.innerHTML;
        area.setAttribute('hidden', '');
        source.hidden = false;
        source.classList.add('visible');
        sourceToggle.classList.add('active');
      } else {
        area.innerHTML = source.value;
        area.removeAttribute('hidden');
        source.hidden = true;
        source.classList.remove('visible');
        sourceToggle.classList.remove('active');
      }
    });

    // Update toolbar highlight on selection change
    const editorArea = document.getElementById('blogEditorArea');
    if (editorArea) {
      editorArea.addEventListener('keyup',   updateToolbarState);
      editorArea.addEventListener('mouseup', updateToolbarState);
    }

    // Save button
    const saveBtn = document.getElementById('blogEditorSave');
    if (saveBtn) saveBtn.addEventListener('click', handleSaveEdit);

    // Back / Discard buttons
    const goBack = () => switchBlogView('blogViewDashboard');
    const backBtn    = document.getElementById('blogEditorBack');
    const cancelBtn  = document.getElementById('blogEditorCancel');
    if (backBtn)   backBtn.addEventListener('click', goBack);
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
      if (confirm('Discard unsaved changes?')) goBack();
    });
  }

  // ── Init ───────────────────────────────────────────────────────────
  (function init() {
    loadPersonas();
    wireMediaUpload();
    wireMediaLibrary();
    wireEditorToolbar();

    // Generate button
    const genBtn = document.getElementById('blogGenerateBtn');
    if (genBtn) genBtn.addEventListener('click', runBlogGenerate);

    // Approve & Publish button
    const approveBtn = document.getElementById('blogApproveBtn');
    if (approveBtn) approveBtn.addEventListener('click', runPublish);

    // Preview tab switcher
    document.querySelectorAll('.blog-preview-tab').forEach(btn => {
      btn.addEventListener('click', () => switchPreviewTab(btn.dataset.previewtab));
    });

    // Edit draft toggle
    const editToggle = document.getElementById('blogEditToggle');
    if (editToggle) {
      editToggle.addEventListener('click', () => {
        const content   = document.getElementById('blogPostContent');
        const isEditing = content?.contentEditable === 'true';
        setEditMode(!isEditing);
      });
    }

    // Blog sub-tabs (Generate / Dashboard)
    document.querySelectorAll('.blog-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.blog-subtab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab  = btn.dataset.blogtab;
        document.querySelectorAll('.blog-view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById('blogView' + tab.charAt(0).toUpperCase() + tab.slice(1));
        if (view) view.classList.add('active');
        setBlogPanelMode(tab === 'dashboard' ? 'dashboard' : 'generate');
        if (tab === 'dashboard') loadDashboard();
      });
    });

    setBlogPanelMode('generate');

    document.getElementById('blogWorkflowDismiss')?.addEventListener('click', () => {
      document.getElementById('blogWorkflowHint')?.classList.add('is-dismissed');
      try { localStorage.setItem('pg_blog_workflow_hint_dismissed', '1'); } catch {}
    });
    try {
      if (localStorage.getItem('pg_blog_workflow_hint_dismissed') === '1') {
        document.getElementById('blogWorkflowHint')?.classList.add('is-dismissed');
      }
    } catch {}

    // Dashboard filters
    ['blogDashStatus', 'blogDashType', 'blogDashSort', 'blogDashSearch'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', loadDashboard);
      if (el && id === 'blogDashSearch') el.addEventListener('keyup', debounce(loadDashboard, 400));
    });
    const refreshBtn = document.getElementById('blogDashRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadDashboard);

    // Platform checkbox toggles
    [['wpEnabled','wpFields'],['ghostEnabled','ghostFields'],['wfEnabled','wfFields'],['dfEnabled','dfFields']].forEach(([chk, fld]) => {
      const cb = document.getElementById(chk);
      const panel = document.getElementById(fld);
      if (cb && panel) cb.addEventListener('change', () => { panel.style.display = cb.checked ? '' : 'none'; });
    });
  })();

})(); // end IIFE
