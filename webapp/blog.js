/**
 * PathGuru Publishers — Blog Publisher Logic (Phase 3)
 */
'use strict';
(function () {
  let currentBlogResult = null;
  function getBackendUrl() {
    try { return (JSON.parse(localStorage.getItem('pg_settings') || '{}').backendUrl || window.location.origin).replace(/\/$/, ''); }
    catch { return window.location.origin; }
  }
  function blogToast(msg, type = 'info') {
    let c = document.querySelector('.toast-container');
    if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<div class="toast-dot"></div><span>${msg.replace(/</g,'&lt;')}</span>`;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }
  function setBlogLoading(on) {
    const idle = document.getElementById('blogStatusIdle');
    const loading = document.getElementById('blogStatusLoading');
    const errEl = document.getElementById('blogStatusError');
    const btn = document.getElementById('blogGenerateBtn');
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
  async function loadPersonas() {
    const picker = document.getElementById('blogPersonaPicker');
    if (!picker) return;
    const backendUrl = getBackendUrl();
    if (!backendUrl.startsWith('http')) return;
    try {
      const res = await fetch(`${backendUrl}/api/personas`);
      if (!res.ok) return;
      const { personas = [] } = await res.json();
      if (!personas.length) return;
      // Preserve the blank "no persona" option, then replace the rest
      const blank = picker.querySelector('option[value=""]');
      picker.innerHTML = '';
      if (blank) picker.appendChild(blank);
      personas.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.displayName} — ${p.title}`;
        picker.appendChild(opt);
      });
    } catch {}
  }

  function renderBlogResult(data) {
    currentBlogResult = data;
    const { seo, socialCaptions, publishResults, html, persona } = data;
    const seoList = document.getElementById('blogSeoList');
    seoList.innerHTML = '';
    const pairs = [
      ['Written by', persona ? `${persona.displayName} — ${persona.title}` : null],
      ['Title', seo.title], ['Slug', seo.slug], ['Meta description', seo.metaDescription],
      ['Focus keyword', seo.focusKeyword],
      ['Reading time', seo.readingTime ? `${seo.readingTime} min read` : null],
    ];
    pairs.forEach(([k, v]) => {
      if (!v) return;
      const div = document.createElement('div');
      div.className = 'strategy-item animate-in';
      div.innerHTML = `<dt>${k}</dt><dd>${String(v).slice(0, 160)}</dd>`;
      seoList.appendChild(div);
    });
    const sc = document.getElementById('blogSocialCaptions');
    sc.innerHTML = '';
    if (socialCaptions?.twitter) sc.innerHTML += `<span class="social-platform-label">Twitter / X</span><div class="social-caption-box">${socialCaptions.twitter}</div>`;
    if (socialCaptions?.linkedin) sc.innerHTML += `<span class="social-platform-label">LinkedIn</span><div class="social-caption-box">${socialCaptions.linkedin}</div>`;
    document.getElementById('blogMetaPanel').style.display = '';
    if (publishResults?.length) renderPublishResults(publishResults);
    showBlogPreview(html);
    setResultButtons(true);
  }
  function showBlogPreview(html) {
    const frame = document.getElementById('blogPreviewFrame');
    const empty = document.getElementById('blogPreviewEmpty');
    frame.style.display = 'block';
    empty.style.display = 'none';
    const blob = new Blob([html], { type: 'text/html' });
    frame.src = URL.createObjectURL(blob);
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
      else div.innerHTML = `<strong>${r.platform}</strong> — ${r.status || 'sent'}` + (r.url ? ` <a href="${r.url}" target="_blank">View ↗</a>` : '') + (r.editUrl ? ` <a href="${r.editUrl}" target="_blank">Edit ↗</a>` : '');
      list.appendChild(div);
    });
  }
  function collectBlogInput() {
    const g = id => document.getElementById(id)?.value?.trim() || '';
    const personaId = document.getElementById('blogPersonaPicker')?.value || '';
    const input = {
      topic: g('blogTopic'), postType: g('blogPostType'), audience: g('blogAudience'),
      goal: g('blogGoal'), tone: g('blogTone'), wordCount: g('blogWordCount'),
      seoKeyword: g('blogSeoKeyword'), ctaGoal: g('blogCtaGoal'), author: g('blogAuthor'),
      personaId: personaId || null,
      platforms: [],
    };
    if (document.getElementById('wpEnabled')?.checked) input.platforms.push({ type: 'wordpress', siteUrl: g('wpUrl'), username: g('wpUser'), appPassword: g('wpPass'), status: g('wpStatus') });
    if (document.getElementById('ghostEnabled')?.checked) input.platforms.push({ type: 'ghost', siteUrl: g('ghostUrl'), adminApiKey: g('ghostKey'), status: g('ghostStatus') });
    if (document.getElementById('wfEnabled')?.checked) input.platforms.push({ type: 'webflow', apiKey: g('wfKey'), collectionId: g('wfCollection'), siteId: g('wfSite') });
    if (document.getElementById('dfEnabled')?.checked) input.platforms.push({ type: 'digifusion', status: g('dfStatus') || 'published' });
    return input;
  }
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
    document.getElementById('blogMetaPanel').style.display = 'none';
    const steps = [[18,'Researching topic...'],[35,'Copywriter drafting hook + sections...'],[55,'SEO-optimising headings + meta...'],[72,'Writing social captions...'],[88,'Sourcing featured image...'],[96,'Finalising post...']];
    let si = 0;
    const ticker = setInterval(() => { if (si < steps.length) { const [p, m] = steps[si++]; setBlogProgress(p, m); } }, 2800);
    try {
      const res = await fetch(`${backendUrl}/api/blog`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      clearInterval(ticker);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Server returned ${res.status}`); }
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
    } finally { setBlogLoading(false); }
  }
  function sortPosts(posts, mode) {
    const arr = posts.slice();
    if (mode === 'oldest') arr.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    else if (mode === 'title') arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return arr;
  }
  async function loadDashboard() {
    const listEl = document.getElementById('blogDashList');
    const loadingEl = document.getElementById('blogDashLoading');
    const status = document.getElementById('blogDashStatus')?.value || '';
    const postType = document.getElementById('blogDashType')?.value || '';
    const sortMode = document.getElementById('blogDashSort')?.value || 'newest';
    const search = document.getElementById('blogDashSearch')?.value?.trim() || '';
    loadingEl.classList.remove('hidden');
    listEl.innerHTML = '';
    try {
      const backendUrl = getBackendUrl();
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (postType) params.set('postType', postType);
      params.set('limit', '100');
      const res = await fetch(`${backendUrl}/api/posts?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load posts (${res.status})`);
      const data = await res.json();
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
        const typeLabel = post.post_type || 'guide';
        const typeEmoji = typeEmojiMap[typeLabel] || '📄';
        const isPublished = post.status === 'published';
        const date = new Date(post.created_at || post.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const publishedUrl = post.published_url || (isPublished && post.slug ? `/blog/${post.slug}` : '');
        return `<div class="blog-dash-item" data-id="${post.id}"><span class="dash-status-pill ${isPublished ? 'published' : 'draft'}" title="${isPublished ? 'Published' : 'Draft'}">${isPublished ? '● Published' : '○ Draft'}</span><div class="dash-item-main"><div class="dash-item-title">${escapeHtml(post.title || 'Untitled')}</div><div class="dash-item-meta"><span class="dash-item-type">${typeEmoji} ${typeLabel}</span><span class="dash-meta-dot"></span><span>${date}</span>${post.reading_time_minutes ? `<span class="dash-meta-dot"></span><span>${post.reading_time_minutes} min</span>` : ''}${post.slug ? `<span class="dash-meta-dot"></span><span class="dash-slug">/${escapeHtml(post.slug)}</span>` : ''}</div></div><div class="dash-item-actions">${publishedUrl ? `<a class="dash-link" href="${escapeHtml(publishedUrl)}" target="_blank" rel="noopener"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>View</a>` : ''}${!isPublished ? `<button class="btn-sm btn-primary dash-publish" data-id="${post.id}">Publish</button>` : ''}<div class="dash-menu" data-id="${post.id}"><button class="dash-menu-trigger" aria-label="More actions" aria-haspopup="true" aria-expanded="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg></button><div class="dash-menu-popover" role="menu" hidden><button class="dash-menu-item dash-preview" role="menuitem" data-id="${post.id}">👁 Preview</button>${isPublished ? `<button class="dash-menu-item dash-unpublish" role="menuitem" data-id="${post.id}">↩ Unpublish</button>` : ''}<button class="dash-menu-item dash-menu-danger dash-delete" role="menuitem" data-id="${post.id}">🗑 Delete</button></div></div></div></div>`;
      }).join('');
      listEl.querySelectorAll('.dash-publish').forEach(btn => btn.addEventListener('click', () => handlePublishAction(btn.dataset.id, 'publish')));
      listEl.querySelectorAll('.dash-unpublish').forEach(btn => btn.addEventListener('click', () => handlePublishAction(btn.dataset.id, 'unpublish')));
      listEl.querySelectorAll('.dash-preview').forEach(btn => btn.addEventListener('click', () => handlePreviewAction(btn.dataset.id)));
      listEl.querySelectorAll('.dash-delete').forEach(btn => btn.addEventListener('click', () => handleDeleteAction(btn.dataset.id)));
      listEl.querySelectorAll('.dash-menu-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const wrapper = trigger.closest('.dash-menu');
          const pop = wrapper.querySelector('.dash-menu-popover');
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
      const res = await fetch(`${backendUrl}/api/posts/${id}`);
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
  function wireBlogTab() {
    ['wp', 'ghost', 'wf', 'df'].forEach(p => {
      const cb = document.getElementById(`${p}Enabled`);
      const fields = document.getElementById(`${p}Fields`);
      if (cb && fields) cb.addEventListener('change', () => { fields.style.display = cb.checked ? '' : 'none'; });
    });
    loadPersonas();
    const genBtn = document.getElementById('blogGenerateBtn');
    if (genBtn) genBtn.addEventListener('click', runBlogGenerate);
    const previewBtn = document.getElementById('blogPreviewBtn');
    if (previewBtn) previewBtn.addEventListener('click', () => { if (currentBlogResult?.html) showBlogPreview(currentBlogResult.html); });
    const publishBtn = document.getElementById('blogPublishBtn');
    if (publishBtn) publishBtn.addEventListener('click', () => {
      if (!currentBlogResult) return;
      const results = currentBlogResult.publishResults || [];
      if (!results.length) { blogToast('No platforms were configured. Add a platform above and regenerate.', 'info'); return; }
      renderPublishResults(results);
      document.getElementById('blogPublishResultsCard').scrollIntoView({ behavior: 'smooth' });
    });
    document.querySelectorAll('.blog-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.blog-subtab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.blogtab;
        document.querySelectorAll('.blog-view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(`blogView${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
        if (view) view.classList.add('active');
        if (tab === 'dashboard') loadDashboard();
      });
    });
    ['blogDashStatus', 'blogDashType', 'blogDashSort', 'blogDashSearch'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', loadDashboard);
      if (el && id === 'blogDashSearch') el.addEventListener('keyup', debounce(loadDashboard, 400));
    });
    const refreshBtn = document.getElementById('blogDashRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadDashboard);
    const metaToggle = document.getElementById('blogMetaToggle');
    const metaBody = document.getElementById('blogMetaBody');
    if (metaToggle && metaBody) {
      metaToggle.addEventListener('click', () => {
        const expanded = metaToggle.getAttribute('aria-expanded') !== 'false';
        const next = !expanded;
        metaToggle.setAttribute('aria-expanded', String(next));
        metaBody.hidden = !next;
        metaToggle.classList.toggle('is-collapsed', !next);
      });
    }
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
