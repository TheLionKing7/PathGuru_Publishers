/**
 * PathGuru Publishers — Blog Publisher Logic (Phase 3)
 */
'use strict';
(function () {
  let currentBlogResult = null;
  let mediaFiles = []; // { file, name, type } — reference files for writer agent

  function getBackendUrl() {
    try { return (JSON.parse(localStorage.getItem('pg_settings') || '{}').backendUrl || window.location.origin).replace(/\/$/, ''); }
    catch { return window.location.origin; }
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
    idle.classList.toggle('hidden', on);
    loading.classList.toggle('hidden', !on);
    errEl.classList.add('hidden');
    btn.disabled = on;
  }

  function setBlogProgress(pct, msg) {
    const bar = document.getElementById('blogProgressBar');
    const txt = document.getElementById('blogStatusMsg');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = msg;
  }

  function setResultButtons(on) {
    document.getElementById('blogPreviewBtn').disabled = !on;
    document.getElementById('blogPublishBtn').disabled = !on;
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

    // --- Publish results ---
    if (publishResults?.length) renderPublishResults(publishResults);

    // --- Show preview (switches to Preview tab automatically) ---
    showBlogPreview(html);
    setResultButtons(true);
  }

  function renderPublishResults(results) {
    const card = document.getElementById('blogPublishResultsCard');
    const list = document.getElementById('blogPublishList');
    if (!card || !list) return;
    card.style.display = '';
    list.innerHTML = '';
    results.forEach(r => {
      const div = document.createElement('div');
      div.className = `publish-result ${r.error ? 'err' : 'ok'}`;
      if (r.error) div.innerHTML = `<strong>${r.platform}</strong>: ${r.error}`;
      else div.innerHTML = `<strong>${r.platform}</strong> — ${r.status || 'sent'}` +
        (r.url     ? ` <a href="${r.url}"     target="_blank">View ↗</a>` : '') +
        (r.editUrl ? ` <a href="${r.editUrl}" target="_blank">Edit ↗</a>` : '');
      list.appendChild(div);
    });
  }

  // ── Collect form input ─────────────────────────────────────────────
  function collectBlogInput() {
    const g = id => document.getElementById(id)?.value?.trim() || '';
    // Prefer Compose section picker, fall back to Assets persona picker
    const personaId = g('blogComposePicker') || g('blogPersonaPicker');
    const aiProvider = g('blogAiProvider') || null;
    const input = {
      topic:      g('blogTopic'),
      postType:   g('blogPostType'),
      audience:   g('blogAudience'),
      goal:       g('blogGoal'),
      tone:       g('blogTone'),
      wordCount:  g('blogWordCount'),
      seoKeyword: g('blogSeoKeyword'),
      ctaGoal:    g('blogCtaGoal'),
      author:     g('blogAuthor'),
      personaId:  personaId || null,
      aiProvider: aiProvider,
      platforms:  [],
    };
    if (document.getElementById('wpEnabled')?.checked)
      input.platforms.push({ type: 'wordpress', siteUrl: g('wpUrl'), username: g('wpUser'), appPassword: g('wpPass'), status: g('wpStatus') });
    if (document.getElementById('ghostEnabled')?.checked)
      input.platforms.push({ type: 'ghost', siteUrl: g('ghostUrl'), adminApiKey: g('ghostKey'), status: g('ghostStatus') });
    if (document.getElementById('wfEnabled')?.checked)
      input.platforms.push({ type: 'webflow', apiKey: g('wfKey'), collectionId: g('wfCollection'), siteId: g('wfSite') });
    if (document.getElementById('dfEnabled')?.checked)
      input.platforms.push({ type: 'digifusion', status: g('dfStatus') || 'published' });
    return input;
  }

  // ── Generate ───────────────────────────────────────────────────────
  async function runBlogGenerate() {
    const input = collectBlogInput();
    if (!input.topic) { blogToast('Enter a topic to generate.', 'error'); return; }
    const backendUrl = getBackendUrl();
    if (!backendUrl.startsWith('http')) {
      blogToast('Configure your backend URL in Settings first.', 'error');
      document.getElementById('settingsModal').style.display = 'flex';
      return;
    }
    setBlogLoading(true);
    currentBlogResult = null;
    setResultButtons(false);
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
      document.getElementById('blogStatusIdle').classList.add('hidden');
      document.getElementById('blogStatusLoading').classList.add('hidden');
      document.getElementById('blogStatusError').classList.remove('hidden');
      document.getElementById('blogErrorMsg').textContent = e.message;
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

  async function loadDashboard() {
    const listEl    = document.getElementById('blogDashList');
    const loadingEl = document.getElementById('blogDashLoading');
    const status    = document.getElementById('blogDashStatus')?.value   || '';
    const postType  = document.getElementById('blogDashType')?.value     || '';
    const sortMode  = document.getElementById('blogDashSort')?.value     || 'newest';
    const search    = document.getElementById('blogDashSearch')?.value?.trim() || '';
    loadingEl.classList.remove('hidden');
    listEl.innerHTML = '';
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
      loadingEl.classList.add('hidden');
      if (!posts.length) {
        listEl.innerHTML = `<div class="blog-dash-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity=".3"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><p>No posts found.</p><p style="font-size:11px;color:var(--text-muted);margin-top:4px">Try clearing filters, or generate a new post.</p></div>`;
        return;
      }
      const filtered = search ? posts.filter(p => (p.title || '').toLowerCase().includes(search.toLowerCase())) : posts;
      if (!filtered.length) { listEl.innerHTML = `<div class="blog-dash-empty"><p>No posts matching &ldquo;${escapeHtml(search)}&rdquo;.</p></div>`; return; }
      const sorted = sortPosts(filtered, sortMode);
      const typeEmojiMap = { guide: '📘', listicle: '🔢', 'how-to': '🛠️', 'case-study': '📊', review: '⭐', roundup: '👥', opinion: '💭' };
      listEl.innerHTML = sorted.map(post => {
        const typeLabel   = post.post_type || 'guide';
        const typeEmoji   = typeEmojiMap[typeLabel] || '📄';
        const isPublished = post.status === 'published';
        const date = new Date(post.created_at || post.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const publishedUrl = post.published_url || (isPublished && post.slug ? `/blog/${post.slug}` : '');
        return `<div class="blog-dash-item" data-id="${post.id}">
          <span class="dash-status-pill ${isPublished ? 'published' : 'draft'}">${isPublished ? '● Published' : '○ Draft'}</span>
          <div class="dash-item-main">
            <div class="dash-item-title">${escapeHtml(post.title || 'Untitled')}</div>
            <div class="dash-item-meta">
              <span class="dash-item-type">${typeEmoji} ${typeLabel}</span>
              <span class="dash-meta-dot"></span><span>${date}</span>
              ${post.reading_time_minutes ? `<span class="dash-meta-dot"></span><span>${post.reading_time_minutes} min</span>` : ''}
              ${post.slug ? `<span class="dash-meta-dot"></span><span class="dash-slug">/${escapeHtml(post.slug)}</span>` : ''}
            </div>
          </div>
          <div class="dash-item-actions">
            ${publishedUrl ? `<a class="dash-link" href="${escapeHtml(publishedUrl)}" target="_blank" rel="noopener"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>View</a>` : ''}
            ${!isPublished ? `<button class="btn-sm btn-primary dash-publish" data-id="${post.id}">Publish</button>` : ''}
            <div class="dash-menu" data-id="${post.id}">
              <button class="dash-menu-trigger" aria-label="More actions" aria-haspopup="true" aria-expanded="false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>
              </button>
              <div class="dash-menu-popover" role="menu" hidden>
                <button class="dash-menu-item dash-preview"  role="menuitem" data-id="${post.id}">👁 Preview</button>
                ${isPublished ? `<button class="dash-menu-item dash-unpublish" role="menuitem" data-id="${post.id}">↩ Unpublish</button>` : ''}

                <button class="dash-menu-item dash-menu-danger dash-delete" role="menuitem" data-id="${post.id}">🗑 Delete</button>
              </div>
            </div>
          </div>
        </div>`;
      }).join('');
      listEl.querySelectorAll('.dash-publish').forEach(btn   => btn.addEventListener('click', () => handlePublishAction(btn.dataset.id, 'publish')));
      listEl.querySelectorAll('.dash-unpublish').forEach(btn => btn.addEventListener('click', () => handlePublishAction(btn.dataset.id, 'unpublish')));
      listEl.querySelectorAll('.dash-preview').forEach(btn   => btn.addEventListener('click', () => handlePreviewAction(btn.dataset.id)));
      listEl.querySelectorAll('.dash-delete').forEach(btn    => btn.addEventListener('click', () => handleDeleteAction(btn.dataset.id)));
      listEl.querySelectorAll('.dash-menu-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const wrapper = trigger.closest('.dash-menu');
          const pop     = wrapper.querySelector('.dash-menu-popover');
          const wasOpen = !pop.hidden;
          listEl.querySelectorAll('.dash-menu-popover').forEach(p => { p.hidden = true; });
          listEl.querySelectorAll('.dash-menu-trigger').forEach(t => t.setAttribute('aria-expanded', 'false'));
          if (!wasOpen) { pop.hidden = false; trigger.setAttribute('aria-expanded', 'true'); }
        });
      });
    } catch (e) {
      loadingEl.classList.add('hidden');
      listEl.innerHTML = `<div class="blog-dash-empty"><p style="color:var(--red)">Error: ${escapeHtml(e.message)}</p></div>`;
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
    if (!confirm('Delete this post permanently?')) return;
    try {
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/posts/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to delete post'); }
      blogToast('Post deleted.', 'success');
      loadDashboard();
    } catch (e) { blogToast(e.message, 'error'); }
  }

  // ── Wire everything ─────────────────────────────────────────────────
  function wireBlogTab() {
    // Platform checkbox toggles
    ['wp', 'ghost', 'wf', 'df'].forEach(p => {
      const cb     = document.getElementById(`${p}Enabled`);
      const fields = document.getElementById(`${p}Fields`);
      if (cb && fields) cb.addEventListener('change', () => { fields.style.display = cb.checked ? '' : 'none'; });
    });

    // Load personas into both pickers
    loadPersonas();

    // Wire media upload (reference files for writer agent)
    wireMediaUpload();

    // Wire media library (R2 assets tab)
    wireMediaLibrary();

    // Generate button
    const genBtn = document.getElementById('blogGenerateBtn');
    if (genBtn) genBtn.addEventListener('click', runBlogGenerate);

    // Header "View preview" button
    const previewBtn = document.getElementById('blogPreviewBtn');
    if (previewBtn) previewBtn.addEventListener('click', () => {
      if (currentBlogResult?.html) { showBlogPreview(currentBlogResult.html); }
    });

    // Header "SEO & Social" button
    const publishBtn = document.getElementById('blogPublishBtn');
    if (publishBtn) publishBtn.addEventListener('click', () => {
      if (!currentBlogResult) return;
      switchPreviewTab('seo');
      if (currentBlogResult.publishResults?.length) {
        renderPublishResults(currentBlogResult.publishResults);
      }
    });

    // Preview tab switcher (toolbar)
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
        const view = document.getElementById(`blogView${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
        if (view) view.classList.add('active');
        if (tab === 'dashboard') loadDashboard();
      });
    });

    // Dashboard filters
    ['blogDashStatus', 'blogDashType', 'blogDashSort', 'blogDashSearch'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', loadDashboard);
      if (el && id === 'blogDashSearch') el.addEventListener('keyup', debounce(loadDashboard, 400));
    });
    const refreshBtn = document.getElementById('blogDashRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadDashboard);

    // Close dash menus on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest?.('.dash-menu')) {
        document.querySelectorAll('.dash-menu-popover').forEach(p => { p.hidden = true; });
        document.querySelectorAll('.dash-menu-trigger').forEach(t => t.setAttribute('aria-expanded', 'false'));
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.dash-menu-popover').forEach(p => { p.hidden = true; });
        document.querySelectorAll('.dash-menu-trigger').forEach(t => t.setAttribute('aria-expanded', 'false'));
      }
    });
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireBlogTab);
  else wireBlogTab();
})();
