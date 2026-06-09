/* ─────────────────────────────────────────────────────────────────
   PathGuru Publishers — Agent Console
   Drives the four-tab Agents module: Network · Console · Tasks · Leads
   Communicates with the PathGuru backend over the same base URL the
   rest of the app uses (stored in pg_settings.backendUrl).
───────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     AGENT REGISTRY — display metadata for each of the 7 agents
  ═══════════════════════════════════════════════════════════════ */
  const AGENTS = [
    {
      id: 'nexus',
      name: 'Nexus',
      role: 'Digital CEO',
      desc: 'Digital CEO of the firm. Morning & evening briefings, blog cadence (Boss approval), workflow design, Notion sync, and agent orchestration via Engagement Model + firm IP.',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      color: '#c9a84c',
      actions: ['orchestrate'],
    },
    {
      id: 'researcher',
      name: 'Orion',
      role: 'Intelligence & Research',
      desc: 'Web intelligence specialist. Crawls live data via Tavily, Firecrawl, and Perplexity — merges findings with the internal knowledge base before delivery.',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
      color: '#38bdf8',
      actions: ['research', 'quick_research', 'deep_research'],
    },
    {
      id: 'atlas',
      name: 'Atlas',
      role: 'Business Development',
      desc: 'Deal Engine specialist. BD strategy, prospect intelligence, Dream 50 targeting, and consulting-grade playbook synthesis.',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
      color: '#5b8dee',
      actions: ['research', 'prospect_analysis', 'build_framework'],
    },
    {
      id: 'nova',
      name: 'Nova',
      role: 'AI & Systems Engineering',
      desc: 'Automation Velocity Engine specialist. Designs AI workflows, SaaS architecture, system blueprints, and technical automation solutions.',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
      color: '#e85d9a',
      actions: ['automation_design', 'build_framework', 'system_blueprint'],
    },
    {
      id: 'aether',
      name: 'Aether',
      role: 'Digital Media & Content Strategy',
      desc: 'Content-to-Capital Pipeline lead. Builds content architecture, editorial strategy, and derivative teasers from premium IP.',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
      color: '#4ecdc4',
      actions: ['write', 'outline', 'edit'],
    },
    {
      id: 'pulse',
      name: 'Pulse',
      role: 'Monitoring & Alerts',
      desc: 'Monitors system health, dispatches push and WhatsApp notifications, and generates performance sweep reports.',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
      color: '#f0a500',
      actions: ['sweep', 'dispatch'],
    },
    {
      id: 'synthesizer',
      name: 'Synthesizer',
      role: 'Knowledge Engine',
      desc: 'Ingests PDFs, documents, and URLs into the firm knowledge base. Answers semantic queries across the corpus.',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
      color: '#a78bfa',
      actions: ['ingest', 'query'],
    },
    {
      id: 'assistant',
      name: 'Assistant',
      role: 'Client-Facing VA',
      desc: 'The DigiFusion customer-facing chat agent. Qualifies leads, answers service questions, and drives bookings.',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
      color: '#34d399',
      actions: ['chat'],
    },
  ];

  /* ═══════════════════════════════════════════════════════════════
     HELPERS
  ═══════════════════════════════════════════════════════════════ */
  function getBackendUrl () {
    try { return JSON.parse(localStorage.getItem('pg_settings') || '{}').backendUrl?.replace(/\/$/, '') || ''; } catch { return ''; }
  }

  function $ (id) { return document.getElementById(id); }

  function esc (s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function relTime (iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000)   return 'just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000)return `${Math.floor(diff/3600000)}h ago`;
    return `${Math.floor(diff/86400000)}d ago`;
  }

  function fmtDuration (startIso, endIso) {
    if (!startIso || !endIso) return '—';
    const ms = new Date(endIso) - new Date(startIso);
    if (ms < 1000)    return `${ms}ms`;
    if (ms < 60000)   return `${(ms/1000).toFixed(1)}s`;
    return `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
  }

  /* Status badge */
  function statusBadge (status) {
    const map = {
      pending: ['badge-pending',  'Pending'],
      running: ['badge-running',  'Running'],
      done:    ['badge-done',     'Done'],
      failed:  ['badge-failed',   'Failed'],
      idle:    ['badge-idle',     'Idle'],
    };
    const [cls, label] = map[status] || ['badge-idle', status || 'Unknown'];
    return `<span class="agents-badge ${cls}">${label}</span>`;
  }

  /* Agent dot (sidebar nav) */
  function agentDot (status) {
    const cls = status === 'running' ? 'dot-busy'
              : status === 'failed'  ? 'dot-error'
              : status === 'offline' ? 'dot-offline'
              : 'dot-idle';
    return `<span class="agent-dot ${cls}"></span>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     API CALLS
  ═══════════════════════════════════════════════════════════════ */
  async function apiFetch (path, opts = {}) {
    const base = getBackendUrl();
    if (!base) throw new Error('Backend URL not configured. Check Settings.');
    const url = `${base}${path}`;
    const method = opts.method || (opts.body ? 'POST' : 'GET');
    const body   = opts.body
      ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
      : opts.method === 'POST' || method === 'POST' ? (opts.data ? JSON.stringify(opts.data) : undefined) : undefined;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body,
      ...Object.fromEntries(Object.entries(opts).filter(([k]) => !['method','body','headers','data'].includes(k))),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}`);
    return json;
  }
  // Expose globally so functions outside this IIFE (Agency IP tab, etc.) can use it
  window._agentApiFetch  = apiFetch;
  window._agentBackendUrl = getBackendUrl;

  /* Fetch task list for the Tasks tab */
  async function fetchTasks (agentFilter = '', statusFilter = '') {
    let qs = '/api/agents/tasks?limit=50';
    if (agentFilter)  qs += `&agent=${encodeURIComponent(agentFilter)}`;
    if (statusFilter) qs += `&status=${encodeURIComponent(statusFilter)}`;
    return apiFetch(qs);
  }

  /* Fetch leads for the Leads tab */
  async function fetchLeads (statusFilter = '') {
    let qs = '/api/agents/leads?limit=50';
    if (statusFilter) qs += `&status=${encodeURIComponent(statusFilter)}`;
    return apiFetch(qs);
  }

  /* Run a task against an agent */
  async function runAgentTask (agentId, payload) {
    return apiFetch(`/api/agents/${agentId}/task`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /* Poll a task by id */
  async function pollTask (taskId) {
    return apiFetch(`/api/agents/tasks/${taskId}`);
  }

  /* ═══════════════════════════════════════════════════════════════
     NETWORK TAB
  ═══════════════════════════════════════════════════════════════ */
  let _agentStatuses = {};   // id → { status, lastActivity, currentTask }

  function renderNetworkTab () {
    const grid = $('agentsGrid');
    if (!grid) return;

    grid.innerHTML = AGENTS.map(agent => {
      const s = _agentStatuses[agent.id] || {};
      const status = s.status || 'idle';
      const last   = relTime(s.lastActivity);
      const dotCls = status === 'running' ? 'dot-busy'
                   : status === 'failed'  ? 'dot-error'
                   : 'dot-idle';
      return `
        <div class="agent-card" data-agent="${esc(agent.id)}">
          <div class="agent-card-header">
            <div class="agent-card-icon" style="--agent-color:${agent.color}">${agent.icon}</div>
            <div class="agent-card-meta">
              <div class="agent-card-name">${esc(agent.name)}</div>
              <div class="agent-card-role">${esc(agent.role)}</div>
            </div>
            <span class="agent-status-dot ${dotCls}"></span>
          </div>
          <p class="agent-card-desc">${esc(agent.desc)}</p>
          <div class="agent-card-footer">
            <span class="agent-last-activity">Last active: ${last}</span>
            <button class="btn-agent-open" data-agent="${esc(agent.id)}" data-agent-name="${esc(agent.name)}">
              Open Console
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');

    // "Open Console" → switch to Console tab with agent pre-selected
    grid.querySelectorAll('.btn-agent-open').forEach(btn => {
      btn.addEventListener('click', () => {
        const id   = btn.dataset.agent;
        switchConsole(id);
        // Trigger tab navigation via the existing app.js state engine
        document.querySelector('.module-tab[data-subtab="agents-console"]')?.click();
      });
    });

    // Update status summary chip
    const running = Object.values(_agentStatuses).filter(s => s.status === 'running').length;
    const summary = running ? `${running} agent${running > 1 ? 's' : ''} running` : 'All idle';
    const el = $('agentsStatusSummary');
    if (el) el.textContent = summary;
  }

  async function loadNetworkStatus () {
    try {
      const data = await apiFetch('/api/agents/status');
      _agentStatuses = data.agents || {};
    } catch (_) {
      // No status endpoint yet — leave _agentStatuses empty; cards still render
    }
    renderNetworkTab();
  }

  /* ═══════════════════════════════════════════════════════════════
     NEXUS COMMAND CENTER
  ═══════════════════════════════════════════════════════════════ */
  async function loadCeoOps () {
    const grid = $('ceoOpsGrid');
    const agentsEl = $('ceoOpsAgents');
    if (!grid) return;
    grid.innerHTML = '<div class="agents-grid-loading"><div class="agents-spinner"></div><span>Loading command center…</span></div>';
    if (agentsEl) agentsEl.innerHTML = '';
    try {
      const data = await apiFetch('/api/agents/nexus/ceo-ops');
      const ops = data.ops || {};
      const sched = ops.contentSchedule || {};
      const cards = [
        { label: 'Blog cadence', value: ops.cadenceDue ? 'Due' : 'On track', hint: ops.daysSinceLastBlog != null ? `${ops.daysSinceLastBlog}d since last post` : 'No posts yet' },
        { label: 'Pending approvals', value: String(ops.pendingApprovals ?? 0), hint: 'Boss YES required' },
        { label: 'Stuck tasks', value: String(ops.stuckTasks ?? 0), hint: '>48h without progress' },
        { label: 'Content queue', value: String(sched.queued ?? 0), hint: `${sched.pending ?? 0} awaiting approval` },
        { label: 'Active tasks', value: String(data.activeTaskCount ?? 0), hint: 'Across agent network' },
      ];
      grid.innerHTML = cards.map(c => `
        <div class="nexus-ops-card">
          <span class="nexus-ops-card-label">${esc(c.label)}</span>
          <span class="nexus-ops-card-value">${esc(c.value)}</span>
          <span class="nexus-ops-card-hint">${esc(c.hint)}</span>
        </div>
      `).join('');

      if (agentsEl && data.agentSummary?.length) {
        agentsEl.innerHTML = `
          <h3 class="nexus-ops-agents-title">Agent status</h3>
          <div class="nexus-ops-agent-chips">
            ${data.agentSummary.map(a => `<span class="nexus-ops-chip nexus-ops-chip-${esc(a.status || 'idle')}">${esc(a.id)} · ${esc(a.status || 'idle')}</span>`).join('')}
          </div>`;
      }
    } catch (err) {
      grid.innerHTML = `<div class="content-empty content-empty-err">${esc(err.message)}</div>`;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     TEAM WORKFLOW
  ═══════════════════════════════════════════════════════════════ */
  function wireWorkflowTab () {
    if (wireWorkflowTab._wired) return;
    wireWorkflowTab._wired = true;

    $('btnClientBlueprint')?.addEventListener('click', async () => {
      const clientName = $('blueprintClientInput')?.value.trim();
      const track = $('blueprintTrackInput')?.value || 'integrated';
      const goals = $('blueprintGoalsInput')?.value.trim();
      const status = $('blueprintStatus');
      const out = $('blueprintOutput');
      if (!clientName) { alert('Enter a client name.'); return; }
      const btn = $('btnClientBlueprint');
      if (btn) { btn.disabled = true; btn.textContent = 'Building…'; }
      status.textContent = 'Nexus coordinating Orion + specialists…';
      try {
        const base = getBackendUrl();
        const res = await fetch(`${base}/api/client-blueprint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientName, track, goals, industry: $('workflowIndustryInput')?.value || 'general' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        status.textContent = `✓ Blueprint ${data.blueprintId} (${data.quality?.grade || 'B'})`;
        if (out) {
          out.style.display = 'block';
          out.textContent = JSON.stringify(data.blueprint, null, 2);
        }
      } catch (e) {
        status.textContent = `✗ ${e.message}`;
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Build Client Blueprint'; }
      }
    });

    $('workflowDesignBtn')?.addEventListener('click', async () => {
      let processDescription = $('workflowProcessInput')?.value.trim();
      const clientName = $('workflowClientInput')?.value.trim() || 'Internal';
      const industry = $('workflowIndustryInput')?.value || 'general';
      const framework = $('workflowFrameworkInput')?.value || '';
      if (framework) {
        const fwLabel = $('workflowFrameworkInput')?.selectedOptions?.[0]?.textContent || framework;
        processDescription = `[Framework: ${fwLabel}]\n${processDescription}`;
      }
      const out = $('workflowResult');
      if (!processDescription) {
        alert('Describe the process to design a workflow.');
        return;
      }
      const btn = $('workflowDesignBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Designing…'; }
      if (out) { out.hidden = false; out.innerHTML = '<div class="agents-grid-loading"><div class="agents-spinner"></div><span>Nexus is designing workflow…</span></div>'; }
      try {
        const base = getBackendUrl();
        const res = await fetch(`${base}/api/agents/nexus/design-workflow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ processDescription, clientName, industry }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        const grade = data.quality?.grade || '—';
        if (out) {
          out.innerHTML = `
            <div class="nexus-workflow-meta-result">
              <span>Quality: <strong>${esc(grade)}</strong></span>
              <span>Delegated to: <strong>${esc(data.delegatedTo || 'nova')}</strong></span>
              <span>Framework: <strong>${esc(data.framework || '—')}</strong></span>
            </div>
            <pre class="nexus-workflow-spec">${esc(data.spec || '')}</pre>`;
        }
      } catch (e) {
        if (out) out.innerHTML = `<div class="content-empty content-empty-err">${esc(e.message)}</div>`;
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Design workflow'; }
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     ACTIVITY JOURNAL — vertical timeline of agent actions
  ═══════════════════════════════════════════════════════════════ */
  async function loadActivityTimeline () {
    const wrap = $('activityTimeline');
    if (!wrap) return;
    const agentFilter = $('activityAgentFilter')?.value || '';
    wrap.innerHTML = '<div class="activity-timeline-empty">Loading agent journal…</div>';
    try {
      const data = await fetchTasks(agentFilter, '');
      const tasks = (data.tasks || data || [])
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .slice(0, 40);
      if (!tasks.length) {
        wrap.innerHTML = '<div class="activity-timeline-empty">No agent actions recorded yet. Tasks from Nexus, Orion, Nova, and others appear here as a connected journal.</div>';
        return;
      }
      wrap.innerHTML = tasks.map((t, i) => {
        const agent = AGENTS.find(a => a.id === t.agent_id) || { name: t.agent_id, color: '#888', role: 'Agent' };
        const isLast = i === tasks.length - 1;
        const when = t.created_at ? new Date(t.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
        const title = t.title || t.description || 'Agent action';
        const excerpt = (t.result || t.output || '').toString().slice(0, 160);
        return `
          <article class="activity-timeline-item">
            <div class="activity-timeline-rail" aria-hidden="true">
              <span class="activity-timeline-dot" style="--agent-color:${agent.color}"></span>
              ${isLast ? '' : '<span class="activity-timeline-line"></span>'}
            </div>
            <div class="activity-timeline-card">
              <header class="activity-timeline-card-head">
                <span class="task-agent-chip" style="--agent-color:${agent.color}">${esc(agent.name)}</span>
                <time datetime="${esc(t.created_at || '')}">${esc(when)}</time>
                ${statusBadge(t.status)}
              </header>
              <h4 class="activity-timeline-title">${esc(title)}</h4>
              ${excerpt ? `<p class="activity-timeline-excerpt">${esc(excerpt)}${(t.result || t.output || '').length > 160 ? '…' : ''}</p>` : ''}
              <footer class="activity-timeline-meta">
                <span>${esc(agent.role || '')}</span>
                ${t.completed_at ? `<span>Completed ${relTime(t.completed_at)}</span>` : ''}
              </footer>
            </div>
          </article>`;
      }).join('');
    } catch (err) {
      wrap.innerHTML = `<div class="activity-timeline-empty activity-timeline-error">${esc(err.message)}</div>`;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     CONSOLE TAB — two-panel layout
  ═══════════════════════════════════════════════════════════════ */
  let _activeConsoleAgent = null;
  let _consolePollTimer   = null;
  let _consoleRunningTask = null;

  function buildConsoleNav () {
    const nav = $('consoleAgentNav');
    if (!nav) return;
    nav.innerHTML = AGENTS.map(agent => {
      const s = _agentStatuses[agent.id] || {};
      const status = s.status || 'idle';
      return `
        <button class="console-nav-agent${_activeConsoleAgent === agent.id ? ' active' : ''}"
                data-agent="${esc(agent.id)}"
                title="${esc(agent.name)} — ${esc(agent.role)}"
                style="--agent-color:${agent.color}">
          ${agentDot(status)}
          <span class="console-nav-icon">${agent.icon}</span>
          <span class="console-nav-label">${esc(agent.name)}</span>
        </button>`;
    }).join('');
    nav.querySelectorAll('.console-nav-agent').forEach(btn => {
      btn.addEventListener('click', () => switchConsole(btn.dataset.agent));
    });
  }

  function switchConsole (agentId) {
    _activeConsoleAgent = agentId;
    buildConsoleNav();
    renderConsoleWorkArea(agentId);
    const agent = AGENTS.find(a => a.id === agentId);
    const label = $('consoleAgentLabel');
    if (label && agent) label.textContent = `${agent.name} — ${agent.role}`;
  }

  function renderConsoleWorkArea (agentId) {
    const area  = $('consoleWorkArea');
    const agent = AGENTS.find(a => a.id === agentId);
    if (!area || !agent) return;

    // Each agent gets a specialised panel
    const panels = {
      nexus:       buildNexusPanel,
      researcher:  buildResearcherPanel,
      atlas:       buildAtlasPanel,
      synthesizer: buildSynthesizerPanel,
      pulse:       buildPulsePanel,
      nova:        buildNovaPanel,
      aether:      buildAetherPanel,
      assistant:   buildAssistantPanel,
    };

    const builder = panels[agentId] || buildGenericPanel;
    area.innerHTML = builder(agent);
    wireConsolePanelEvents(agentId, area);
  }

  /* ── Researcher ── */
  function buildResearcherPanel (agent) {
    return `
      <div class="console-panel" id="console-researcher">
        <div class="console-panel-inner">
          <div class="console-agent-badge" style="--agent-color:${agent.color}">
            ${agent.icon}
          </div>
          <h2 class="console-agent-title">${agent.name}</h2>
          <p class="console-agent-subtitle">${agent.role}</p>
          <p class="console-agent-desc">Web intelligence specialist. Runs live queries via Tavily, Firecrawl, and Perplexity — then merges findings with the internal knowledge base before delivering a unified research brief.</p>

          <div class="console-form-group">
            <label class="console-label">Research Topic</label>
            <input id="researcher-topic" class="console-input" type="text" placeholder="e.g. AI automation market in West Africa 2025"/>
          </div>
          <div class="console-form-row">
            <div class="console-form-group" style="flex:1">
              <label class="console-label">Depth</label>
              <select id="researcher-depth" class="console-input">
                <option value="quick">Quick (2 queries, no scrape)</option>
                <option value="standard" selected>Standard (4 queries + scrape)</option>
                <option value="deep">Deep (6 queries + deep scrape)</option>
              </select>
            </div>
            <div class="console-form-group" style="flex:1">
              <label class="console-label">Requesting Agent</label>
              <select id="researcher-foragent" class="console-input">
                <option value="nexus">Nexus</option>
                <option value="atlas">Atlas (BD)</option>
                <option value="nova">Nova (Automation)</option>
                <option value="aether">Aether (Content)</option>
              </select>
            </div>
          </div>
          <div class="console-form-group">
            <label class="console-label">Focus Areas <span style="opacity:.5">(optional, comma-separated)</span></label>
            <input id="researcher-focus" class="console-input" type="text" placeholder="e.g. market size, key players, growth drivers"/>
          </div>
          <div class="console-form-group">
            <label class="console-label">Merge with Internal Knowledge Base</label>
            <select id="researcher-merge" class="console-input">
              <option value="yes" selected>Yes — enrich with DigiFusion KB</option>
              <option value="no">No — web findings only</option>
            </select>
          </div>

          <div class="console-actions">
            <button class="btn-run" id="researcher-run">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Run Research
            </button>
          </div>

          <div id="researcher-status" class="console-status" style="display:none"></div>
          <div id="researcher-output" class="console-output" style="display:none">
            <div class="console-output-header">
              <span>Research Brief</span>
              <div id="researcher-meta" style="font-size:11px;opacity:.6"></div>
            </div>
            <div id="researcher-brief" class="console-output-body"></div>
            <div id="researcher-sources" style="margin-top:12px;font-size:12px;opacity:.7"></div>
          </div>

          <div class="console-chat-section">
            <div class="console-chat-label">Chat with Orion</div>
            <div class="console-chat-history" id="researcher-chat-history"></div>
            <div class="console-chat-input-row">
              <input class="console-chat-input" id="researcher-chat-input" placeholder="Ask about any topic or request a quick research..." />
              <button class="console-chat-send" id="researcher-chat-send">Send</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ── Atlas ── */
  function buildAtlasPanel (agent) {
    return `
      <div class="console-panel" id="console-atlas">
        <div class="console-panel-inner">
          <div class="console-agent-badge" style="--agent-color:${agent.color}">
            ${agent.icon}
            <span>${agent.name}</span>
            <span class="console-role-tag">${agent.role}</span>
          </div>

          <div class="console-form-group">
            <label class="console-label" for="atlasTopicInput">Research topic or question</label>
            <textarea id="atlasTopicInput" class="console-textarea" rows="3"
              placeholder="e.g. Competitive landscape for AI-powered legal tech in Sub-Saharan Africa…"></textarea>
          </div>

          <div class="console-form-row">
            <div class="console-form-group">
              <label class="console-label" for="atlasActionSelect">Action</label>
              <select id="atlasActionSelect" class="console-select">
                <option value="research">Market Research</option>
                <option value="prospect_analysis">Prospect Analysis</option>
                <option value="build_framework">Build Framework</option>
              </select>
            </div>
            <div class="console-form-group">
              <label class="console-label" for="atlasDepthSelect">Research depth</label>
              <select id="atlasDepthSelect" class="console-select">
                <option value="1">Light (faster)</option>
                <option value="2" selected>Standard</option>
                <option value="3">Deep (slower)</option>
              </select>
            </div>
            <div class="console-form-group">
              <label class="console-label" for="atlasDocFormatSelect">Output format</label>
              <select id="atlasDocFormatSelect" class="console-select">
                <option value="docx">Word (.docx)</option>
                <option value="pdf">PDF</option>
                <option value="html">HTML</option>
              </select>
            </div>
          </div>

          <div class="console-actions">
            <button class="btn-console-run" id="atlasRunBtn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Run Research
            </button>
          </div>

          <div class="console-output-area" id="atlasOutput" style="display:none">
            <div class="console-output-toolbar">
              <span class="console-output-label" id="atlasOutputLabel">Output</span>
              <div class="console-output-actions">
                <button class="btn-output-action" id="atlasDownloadBtn" style="display:none">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download DOCX
                </button>
                <button class="btn-output-action" id="atlasCopyBtn">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copy
                </button>
              </div>
            </div>
            <div class="console-markdown-output" id="atlasMarkdownOutput"></div>
          </div>

          <div class="console-task-status" id="atlasTaskStatus" style="display:none">
            <div class="console-task-spinner"></div>
            <span id="atlasTaskStatusMsg">Starting research…</span>
          </div>
        </div>
      </div>`;
  }

  /* ── Nexus ── */
  function buildNexusPanel (agent) {
    return `
      <div class="console-panel" id="console-nexus">
        <div class="console-panel-inner">
          <div class="console-agent-badge" style="--agent-color:${agent.color}">
            ${agent.icon}
            <span>${agent.name}</span>
            <span class="console-role-tag">${agent.role}</span>
          </div>

          <div class="console-form-group">
            <label class="console-label" for="nexusGoalInput">Project goal or instruction</label>
            <textarea id="nexusGoalInput" class="console-textarea" rows="4"
              placeholder="e.g. Produce a 10-chapter playbook on AI adoption for SMEs in Nigeria — research, outline, write, and format as a consulting-grade PDF…"></textarea>
          </div>

          <div class="console-form-row">
            <div class="console-form-group">
              <label class="console-label" for="nexusPrioritySelect">Priority</label>
              <select id="nexusPrioritySelect" class="console-select">
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div class="console-actions">
            <button class="btn-console-run" id="nexusRunBtn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Orchestrate
            </button>
            <button class="btn-output-action" id="nexusNotionPingBtn" style="margin-left:8px;padding:7px 14px;" title="Test Notion connection">
              Test Notion
            </button>
          </div>

          <div class="console-output-area" id="nexusOutput" style="display:none">
            <div class="console-output-toolbar">
              <span class="console-output-label">Execution Plan</span>
              <button class="btn-output-action" id="nexusCopyBtn">Copy</button>
            </div>
            <div class="console-markdown-output" id="nexusMarkdownOutput"></div>
          </div>

          <div class="console-task-status" id="nexusTaskStatus" style="display:none">
            <div class="console-task-spinner"></div>
            <span id="nexusTaskStatusMsg">Orchestrating…</span>
          </div>
        </div>
      </div>`;
  }

  /* ── Synthesizer ── */
  function buildSynthesizerPanel (agent) {
    return `
      <div class="console-panel" id="console-synthesizer">
        <div class="console-panel-inner">
          <div class="console-agent-badge" style="--agent-color:${agent.color}">
            ${agent.icon}
            <span>${agent.name}</span>
            <span class="console-role-tag">${agent.role}</span>
          </div>

          <div class="console-two-col">
            <!-- Ingest -->
            <div class="console-card">
              <div class="console-card-title">Ingest from R2</div>
              <div class="console-form-group">
                <label class="console-label" for="synthPrefixInput">R2 Prefix to scan</label>
                <select id="synthPrefixInput" class="console-select">
                  <option value="">All (knowledge/ + library/)</option>
                  <option value="knowledge/">knowledge/ — all domains</option>
                  <option value="knowledge/business/">knowledge/business/</option>
                  <option value="knowledge/automation/">knowledge/automation/</option>
                  <option value="knowledge/media/">knowledge/media/</option>
                  <option value="library/">library/ — all folders</option>
                  <option value="library/frameworks/">library/frameworks/</option>
                  <option value="library/research/">library/research/</option>
                  <option value="library/playbooks/">library/playbooks/</option>
                  <option value="library/case-studies/">library/case-studies/</option>
                </select>
              </div>
              <div class="console-form-group">
                <label class="console-label" for="synthDomainInput">Domain override <span style="font-weight:400;opacity:.6">(optional — auto-detected from path)</span></label>
                <select id="synthDomainInput" class="console-select">
                  <option value="">Auto-detect</option>
                  <option value="business_development">Business Development</option>
                  <option value="automation">Automation</option>
                  <option value="digital_media">Digital Media</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div class="console-actions">
                <button class="btn-console-run btn-secondary-run" id="synthIngestBtn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Run Ingest
                </button>
              </div>
            </div>

            <!-- Query -->
            <div class="console-card">
              <div class="console-card-title">Query Knowledge Base</div>
              <div class="console-form-group">
                <label class="console-label" for="synthQueryInput">Ask a question</label>
                <textarea id="synthQueryInput" class="console-textarea" rows="3"
                  placeholder="What frameworks do we have for B2B sales in emerging markets?"></textarea>
              </div>
              <div class="console-actions">
                <button class="btn-console-run" id="synthQueryBtn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Query
                </button>
              </div>
            </div>
          </div>

          <div class="console-output-area" id="synthOutput" style="display:none">
            <div class="console-output-toolbar">
              <span class="console-output-label" id="synthOutputLabel">Result</span>
              <button class="btn-output-action" id="synthCopyBtn">Copy</button>
            </div>
            <div class="console-markdown-output" id="synthMarkdownOutput"></div>
          </div>

          <div class="console-task-status" id="synthTaskStatus" style="display:none">
            <div class="console-task-spinner"></div>
            <span id="synthTaskStatusMsg">Working…</span>
          </div>
        </div>
      </div>`;
  }

  /* ── Pulse ── */
  function buildPulsePanel (agent) {
    return `
      <div class="console-panel" id="console-pulse">
        <div class="console-panel-inner">
          <div class="console-agent-badge" style="--agent-color:${agent.color}">
            ${agent.icon}
            <span>${agent.name}</span>
            <span class="console-role-tag">${agent.role}</span>
          </div>

          <!-- OneSignal push subscription status widget -->
          <div class="pulse-push-card" id="pulsePushCard">
            <div class="pulse-push-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span class="pulse-push-title">Browser Push Subscription</span>
              <span class="pulse-push-status" id="pulsePushStatus">
                <span class="pulse-push-dot pulse-push-dot--unknown" id="pulsePushDot"></span>
                <span id="pulsePushStatusLabel">Checking…</span>
              </span>
            </div>
            <div class="pulse-push-body">
              <p class="pulse-push-desc" id="pulsePushDesc">Loading subscription state…</p>
              <div class="pulse-push-actions" id="pulsePushActions"></div>
            </div>
          </div>

          <div class="console-two-col">
            <div class="console-card">
              <div class="console-card-title">Monitoring Sweep</div>
              <p class="console-card-body">Run a full system health check across all agents, recent tasks, and notification queue. Generates an alert report.</p>
              <div class="console-actions">
                <button class="btn-console-run btn-secondary-run" id="pulseSweepBtn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  Run Sweep
                </button>
              </div>
            </div>
            <div class="console-card">
              <div class="console-card-title">Dispatch Notifications</div>
              <p class="console-card-body">Push pending notifications from the queue to push (OneSignal) and WhatsApp channels.</p>
              <div class="console-actions">
                <button class="btn-console-run" id="pulseDispatchBtn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Dispatch
                </button>
              </div>
            </div>
          </div>

          <div class="console-output-area" id="pulseOutput" style="display:none">
            <div class="console-output-toolbar">
              <span class="console-output-label" id="pulseOutputLabel">Report</span>
              <button class="btn-output-action" id="pulseCopyBtn">Copy</button>
            </div>
            <div class="console-markdown-output" id="pulseMarkdownOutput"></div>
          </div>

          <div class="console-task-status" id="pulseTaskStatus" style="display:none">
            <div class="console-task-spinner"></div>
            <span id="pulseTaskStatusMsg">Working…</span>
          </div>
        </div>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     AGENT CHAT — shared chat API + state
  ══════════════════════════════════════════════════════════════ */

  // Per-agent conversation history: { [agentId]: [{ role, content }] }
  const _chatHistories = {};

  async function sendChatMessage (agentId, message) {
    const base = getBackendUrl();
    if (!base) throw new Error('Backend URL not set — check Settings');
    const history = _chatHistories[agentId] || [];
    const res = await fetch(`${base}/api/agents/${agentId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(e.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    // Persist history (keep last 20 turns)
    _chatHistories[agentId] = [
      ...history,
      { role: 'user',      content: message },
      { role: 'assistant', content: data.reply },
    ].slice(-20);
    return data.reply;
  }

  /* Build a chat panel. Used by Nova, Aether, Assistant + injected tab for others. */
  function buildChatPanel (agent, extraTopHTML = '') {
    return `
      <div class="console-panel" id="console-${esc(agent.id)}">
        <div class="console-panel-inner">
          <div class="console-agent-badge" style="--agent-color:${agent.color}">
            ${agent.icon}
            <span>${agent.name}</span>
            <span class="console-role-tag">${agent.role}</span>
          </div>

          ${extraTopHTML}

          <div class="agent-chat-wrap" id="chatWrap-${esc(agent.id)}">
            <div class="agent-chat-messages" id="chatMessages-${esc(agent.id)}" aria-live="polite" aria-label="${esc(agent.name)} conversation">
              <div class="chat-bubble chat-bubble--agent">
                <span class="chat-bubble-name">${esc(agent.name)}</span>
                <p>Hi — I'm ${esc(agent.name)}, your ${esc(agent.role).toLowerCase()}. What can I help you with?</p>
              </div>
            </div>
            <div class="agent-chat-footer">
              <textarea class="agent-chat-input" id="chatInput-${esc(agent.id)}" rows="1"
                placeholder="Message ${esc(agent.name)}…" aria-label="Message ${esc(agent.name)}"></textarea>
              <button class="agent-chat-send" id="chatSend-${esc(agent.id)}" title="Send (Enter)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
              <button class="agent-chat-clear" id="chatClear-${esc(agent.id)}" title="Clear conversation">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* Wire the chat panel event handlers */
  function wireChatPanel (agentId) {
    const messagesEl = $(`chatMessages-${agentId}`);
    const inputEl    = $(`chatInput-${agentId}`);
    const sendBtn    = $(`chatSend-${agentId}`);
    const clearBtn   = $(`chatClear-${agentId}`);
    if (!inputEl || !sendBtn || !messagesEl) return;

    function appendBubble (role, text) {
      const div = document.createElement('div');
      div.className = `chat-bubble chat-bubble--${role === 'user' ? 'user' : 'agent'}`;
      const agent = AGENTS.find(a => a.id === agentId);
      if (role !== 'user') {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'chat-bubble-name';
        nameSpan.textContent = agent?.name || agentId;
        div.appendChild(nameSpan);
      }
      const p = document.createElement('p');
      p.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      div.appendChild(p);
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function appendTyping () {
      const div = document.createElement('div');
      div.className = 'chat-bubble chat-bubble--agent chat-bubble--typing';
      div.id = `chatTyping-${agentId}`;
      div.innerHTML = `<span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span>`;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async function doSend () {
      const msg = inputEl.value.trim();
      if (!msg) return;
      inputEl.value = '';
      inputEl.style.height = '';
      sendBtn.disabled = true;
      appendBubble('user', msg);
      appendTyping();

      try {
        const reply = await sendChatMessage(agentId, msg);
        $(`chatTyping-${agentId}`)?.remove();
        appendBubble('agent', reply);
      } catch (e) {
        $(`chatTyping-${agentId}`)?.remove();
        appendBubble('agent', `⚠ ${e.message}`);
      } finally {
        sendBtn.disabled = false;
        inputEl.focus();
      }
    }

    sendBtn.addEventListener('click', doSend);

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });

    // Auto-grow textarea
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = `${Math.min(inputEl.scrollHeight, 120)}px`;
    });

    clearBtn?.addEventListener('click', () => {
      _chatHistories[agentId] = [];
      messagesEl.innerHTML = `
        <div class="chat-bubble chat-bubble--agent">
          <span class="chat-bubble-name">${esc(AGENTS.find(a=>a.id===agentId)?.name || agentId)}</span>
          <p>Conversation cleared. How can I help?</p>
        </div>`;
    });
  }

  /* ── Nova — chat + task dispatch ── */
  function buildNovaPanel (agent) {
    const taskSection = `
      <div class="console-panel-section">
        <div class="console-section-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Run an automation task
        </div>
        <div class="console-form-group">
          <select id="novaActionSelect" class="console-select">
            <option value="design_workflow">Design Workflow</option>
            <option value="build_blueprint">Build Technical Blueprint</option>
            <option value="phase2_architect">Phase 2 — Architect</option>
            <option value="phase3_build">Phase 3 — Build</option>
          </select>
        </div>
        <div class="console-form-group">
          <textarea id="novaTaskInput" class="console-textarea" rows="3"
            placeholder="Describe the automation or system to design…"></textarea>
        </div>
        <div class="console-actions">
          <button class="btn-console-run btn-secondary-run" id="novaRunBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Run
          </button>
        </div>
        <div class="console-output-area" id="novaOutput" style="display:none">
          <div class="console-output-toolbar">
            <span class="console-output-label" id="novaOutputLabel">Output</span>
            <button class="btn-output-action" id="novaCopyBtn">Copy</button>
          </div>
          <div class="console-markdown-output" id="novaMarkdownOutput"></div>
        </div>
        <div class="console-task-status" id="novaTaskStatus" style="display:none">
          <div class="console-task-spinner"></div>
          <span id="novaTaskStatusMsg">Working…</span>
        </div>
      </div>`;
    return buildChatPanel(agent, taskSection);
  }

  /* ── Aether — chat + content task dispatch ── */
  function buildAetherPanel (agent) {
    const taskSection = `
      <div class="console-panel-section">
        <div class="console-section-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Run a content task
        </div>
        <div class="console-form-row">
          <div class="console-form-group">
            <select id="aetherActionSelect" class="console-select">
              <option value="write">Write Content</option>
              <option value="outline">Create Outline</option>
              <option value="content_strategy">Content Strategy</option>
              <option value="social_calendar">Social Calendar</option>
            </select>
          </div>
          <div class="console-form-group">
            <select id="aetherFormatSelect" class="console-select">
              <option value="blog_post">Blog Post</option>
              <option value="linkedin">LinkedIn</option>
              <option value="newsletter">Newsletter</option>
              <option value="thread">Twitter/X Thread</option>
            </select>
          </div>
        </div>
        <div class="console-form-group">
          <textarea id="aetherTaskInput" class="console-textarea" rows="3"
            placeholder="Derivative angle / headline — must trace to research or playbook below"></textarea>
        </div>
        <div class="console-form-row">
          <div class="console-form-group" style="flex:2">
            <label class="console-label">Orion research brief <span style="opacity:.6">(required unless playbook slug set)</span></label>
            <textarea id="aetherResearchBrief" class="console-textarea" rows="4"
              placeholder="Paste Orion output here — stats, sources, frameworks found…"></textarea>
          </div>
          <div class="console-form-group" style="flex:1">
            <label class="console-label">Playbook slug</label>
            <input id="aetherPlaybookSlug" class="console-input" type="text" placeholder="agency-ip slug" />
            <label class="console-label" style="margin-top:8px">Framework lens</label>
            <select id="aetherFrameworkId" class="console-select">
              <option value="">Auto</option>
              <option value="ave">AVE</option>
              <option value="deal-engine">Deal Engine</option>
              <option value="c2c">C2C Pipeline</option>
              <option value="sme-scale-engine">SME Scale Engine</option>
              <option value="enterprise-velocity">Enterprise Velocity</option>
              <option value="govtech">GovTech</option>
              <option value="fira">FIRA</option>
            </select>
          </div>
        </div>
        <div class="console-actions" style="gap:8px;flex-wrap:wrap">
          <button class="btn-console-run btn-secondary-run" id="aetherRunBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Run Task
          </button>
          <button class="btn-console-run" id="aetherPublishBlogBtn" style="background:#00d4aa22;color:#00d4aa;border:1px solid #00d4aa40">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Write &amp; Publish Blog
          </button>
        </div>
        <div class="console-output-area" id="aetherOutput" style="display:none">
          <div class="console-output-toolbar">
            <span class="console-output-label" id="aetherOutputLabel">Output</span>
            <button class="btn-output-action" id="aetherCopyBtn">Copy</button>
          </div>
          <div class="console-markdown-output" id="aetherMarkdownOutput"></div>
        </div>
        <div class="console-task-status" id="aetherTaskStatus" style="display:none">
          <div class="console-task-spinner"></div>
          <span id="aetherTaskStatusMsg">Working…</span>
        </div>
      </div>`;
    return buildChatPanel(agent, taskSection);
  }

  /* ── Assistant — chat only (it IS a chat agent) ── */
  function buildAssistantPanel (agent) {
    return buildChatPanel(agent);
  }

  function buildGenericPanel (agent) {
    return buildChatPanel(agent);
  }

  /* ═══════════════════════════════════════════════════════════════
     CONSOLE PANEL — event wiring
  ═══════════════════════════════════════════════════════════════ */

  /* Shared task runner: POST → poll until done → render output */
  async function runTask (agentId, payload, {
    statusEl, statusMsgEl, outputEl, outputLabelEl, markdownEl,
    onSuccess,
  }) {
    statusEl.style.display    = 'flex';
    outputEl.style.display    = 'none';
    statusMsgEl.textContent   = 'Starting…';

    try {
      const res = await runAgentTask(agentId, payload);
      const taskId = res.taskId || res.id;

      if (!taskId) {
        // Synchronous result
        const syncRaw = res.result ?? res;
        let syncDisplay;
        if (typeof syncRaw === 'string') {
          syncDisplay = syncRaw;
        } else if (syncRaw?.plan && Array.isArray(syncRaw.plan)) {
          const lines = [`**Execution Plan** — ${syncRaw.plan.length} task(s) created\n`];
          syncRaw.plan.forEach((t, i) => {
            lines.push(`**${i + 1}. ${t.title || t.agent_id}**`);
            if (t.agent_id)    lines.push(`Agent: ${t.agent_id}`);
            if (t.type)        lines.push(`Type: ${t.type}`);
            if (t.priority)    lines.push(`Priority: ${t.priority}`);
            if (t.description) lines.push(`${t.description}`);
            lines.push('');
          });
          syncDisplay = lines.join('\n');
        } else {
          syncDisplay = '```json\n' + JSON.stringify(syncRaw, null, 2) + '\n```';
        }
        renderMarkdown(markdownEl, syncDisplay);
        outputEl.style.display = 'flex';
        if (outputLabelEl) outputLabelEl.textContent = 'Output';
        if (onSuccess) onSuccess(res);
        return;
      }

      // Poll
      statusMsgEl.textContent = 'Task queued — polling for results…';
      let attempts = 0;
      const poll = async () => {
        attempts++;
        try {
          const task = await pollTask(taskId);
          statusMsgEl.textContent = `Status: ${task.status} (${attempts * 2}s)`;

          if (task.status === 'done' || task.status === 'completed') {
            statusEl.style.display = 'none';
            const raw = task.result || task.output;
            let display;
            if (!raw) {
              display = '(No output)';
            } else if (typeof raw === 'string') {
              display = raw;
            } else if (raw.plan && Array.isArray(raw.plan)) {
              // Nexus orchestrate result — render as readable execution plan
              const lines = [`**Execution Plan** — ${raw.plan.length} task(s) created\n`];
              raw.plan.forEach((t, i) => {
                lines.push(`**${i + 1}. ${t.title || t.agent_id}**`);
                if (t.agent_id)    lines.push(`Agent: ${t.agent_id}`);
                if (t.type)        lines.push(`Type: ${t.type}`);
                if (t.priority)    lines.push(`Priority: ${t.priority}`);
                if (t.description) lines.push(`${t.description}`);
                lines.push('');
              });
              display = lines.join('\n');
            } else {
              display = '```json\n' + JSON.stringify(raw, null, 2) + '\n```';
            }
            renderMarkdown(markdownEl, display);
            outputEl.style.display = 'flex';
            if (onSuccess) onSuccess(task);
          } else if (task.status === 'failed') {
            statusEl.style.display = 'none';
            renderMarkdown(markdownEl, `**Task failed**\n\n${task.error || 'Unknown error'}`);
            outputEl.style.display = 'flex';
          } else if (attempts < 60) {
            setTimeout(poll, 2000);
          } else {
            statusEl.style.display = 'none';
            renderMarkdown(markdownEl, '**Timed out** — task took longer than expected. Check the Tasks tab.');
            outputEl.style.display = 'flex';
          }
        } catch (e) {
          statusMsgEl.textContent = `Poll error: ${e.message}`;
          if (attempts < 5) setTimeout(poll, 3000);
          else { statusEl.style.display = 'none'; renderMarkdown(markdownEl, `**Error:** ${e.message}`); outputEl.style.display = 'flex'; }
        }
      };
      setTimeout(poll, 1500);

    } catch (err) {
      statusEl.style.display = 'none';
      renderMarkdown(markdownEl, `**Error:** ${esc(err.message)}`);
      outputEl.style.display = 'flex';
    }
  }

  /* Very simple Markdown → HTML (headers, bold, code blocks, paragraphs) */
  function renderMarkdown (el, md) {
    if (!el || !md) return;
    let html = esc(md)
      // Code blocks
      .replace(/```[\s\S]*?```/g, m => `<pre class="md-code">${m.slice(3, -3).replace(/^[^\n]*\n/, '')}</pre>`)
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // H3
      .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
      // H2
      .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
      // H1
      .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
      // HR
      .replace(/^---$/gm, '<hr class="md-hr">')
      // Paragraph breaks
      .replace(/\n\n/g, '</p><p class="md-p">')
      .replace(/\n/g, '<br>');
    el.innerHTML = `<p class="md-p">${html}</p>`;
  }

  function copyText (text) {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function wireConsolePanelEvents (agentId, area) {
    /* ── Researcher ── */
    if (agentId === 'researcher') {
      const runBtn    = $('researcher-run');
      const statusEl  = $('researcher-status');
      const outputEl  = $('researcher-output');
      const briefEl   = $('researcher-brief');
      const metaEl    = $('researcher-meta');
      const sourcesEl = $('researcher-sources');

      runBtn?.addEventListener('click', async () => {
        const topic      = $('researcher-topic')?.value?.trim();
        const depth      = $('researcher-depth')?.value || 'standard';
        const forAgent   = $('researcher-foragent')?.value || 'nexus';
        const focusRaw   = $('researcher-focus')?.value?.trim();
        const mergeWithKB = $('researcher-merge')?.value !== 'no';
        const focusAreas = focusRaw ? focusRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (!topic) { alert('Please enter a research topic.'); return; }

        runBtn.disabled = true;
        statusEl.style.display = 'block';
        statusEl.textContent = `🔍 Researching "${topic}" (${depth})…`;
        outputEl.style.display = 'none';

        try {
          const base = getBackendUrl();
          const res = await fetch(`${base}/api/agents/researcher/research`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ topic, depth, forAgent, focusAreas, mergeWithKB }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Research failed');

          statusEl.style.display = 'none';
          outputEl.style.display = 'block';
          briefEl.innerHTML = '';
          renderMarkdown(briefEl, data.brief || 'No brief returned.');
          metaEl.textContent = `${data.sources?.length || 0} sources · KB merge: ${data.mergedWithKB ? 'yes' : 'no'} · ${depth}`;
          if (data.sources?.length) {
            sourcesEl.innerHTML = `<strong>Sources:</strong> ${data.sources.map(s =>
              `<a href="${esc(s.url)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;margin-right:8px">${esc(s.title || s.url)}</a>`
            ).join('')}`;
          } else {
            sourcesEl.innerHTML = '';
          }
        } catch (e) {
          statusEl.textContent = `✗ ${e.message}`;
        } finally {
          runBtn.disabled = false;
        }
      });

      wireChatPanel('researcher', 'researcher-chat-input', 'researcher-chat-send', 'researcher-chat-history');
    }

    /* ── Atlas ── */
    if (agentId === 'atlas') {
      const runBtn     = $('atlasRunBtn');
      const statusEl   = $('atlasTaskStatus');
      const statusMsg  = $('atlasTaskStatusMsg');
      const outputEl   = $('atlasOutput');
      const outputLbl  = $('atlasOutputLabel');
      const markdownEl = $('atlasMarkdownOutput');
      const dlBtn      = $('atlasDownloadBtn');
      const copyBtn    = $('atlasCopyBtn');

      runBtn?.addEventListener('click', async () => {
        const topic  = $('atlasTopicInput')?.value?.trim();
        const action = $('atlasActionSelect')?.value;
        const depth  = parseInt($('atlasDepthSelect')?.value || '2', 10);
        const fmt    = $('atlasDocFormatSelect')?.value || 'docx';
        if (!topic) { alert('Please enter a research topic.'); return; }
        runBtn.disabled = true;
        await runTask('atlas', { action, topic, depth, docFormat: fmt }, {
          statusEl, statusMsgEl: statusMsg, outputEl, outputLabelEl: outputLbl,
          markdownEl,
          onSuccess (task) {
            runBtn.disabled = false;
            if (task.document?.filename) {
              outputLbl.textContent = `Output — ${esc(task.document.filename)}`;
              dlBtn.style.display = 'inline-flex';
              dlBtn.onclick = () => {
                const base = getBackendUrl();
                if (base) window.open(`${base}/api/agents/atlas/download/${encodeURIComponent(task.document.filename)}`, '_blank');
              };
            }
          },
        });
        runBtn.disabled = false;
      });

      copyBtn?.addEventListener('click', () => copyText(markdownEl?.innerText || ''));
    }

    /* ── Nexus ── */
    if (agentId === 'nexus') {
      const runBtn     = $('nexusRunBtn');
      const statusEl   = $('nexusTaskStatus');
      const statusMsg  = $('nexusTaskStatusMsg');
      const outputEl   = $('nexusOutput');
      const markdownEl = $('nexusMarkdownOutput');
      const copyBtn    = $('nexusCopyBtn');

      // Notion ping button
      $('nexusNotionPingBtn')?.addEventListener('click', async () => {
        outputEl.style.display = 'flex';
        renderMarkdown(markdownEl, '_Testing Notion connection…_');
        try {
          const res = await apiFetch('/api/agents/notion/ping');
          renderMarkdown(markdownEl,
            res.connected
              ? `**Notion Connected** ✓\n\nWorkspace: ${res.workspace}\n\n${res.message}`
              : `**Notion Connection Failed**\n\nError: ${res.error}`
          );
        } catch(e) {
          renderMarkdown(markdownEl, `**Error:** ${esc(e.message)}`);
        }
      });

      // Store research brief in closure for Phase 2
      let _pendingBrief = null;
      let _pendingInstruction = null;

      async function callOrchestrate(instruction, extraOpts = {}) {
        const priority = parseInt($('nexusPrioritySelect')?.value) || 3;
        runBtn.disabled = true;
        statusEl.style.display = 'flex';
        outputEl.style.display = 'none';
        statusMsg.textContent  = 'Nexus is reading your instruction…';
        // Show progressive status messages so you can see Orion working
        const statusSteps = [
          'Nexus is reading your instruction…',
          'Detecting intent — checking if Orion needs to be dispatched…',
          'Orion is generating search queries…',
          'Orion is querying Perplexity and Tavily…',
          'Orion is synthesizing findings…',
          'Merging with internal knowledge base…',
          'Almost done — preparing results…',
        ];
        let stepIdx = 0;
        const stepInterval = setInterval(() => {
          stepIdx = Math.min(stepIdx + 1, statusSteps.length - 1);
          if (statusMsg) statusMsg.textContent = statusSteps[stepIdx];
        }, 4000);
        // Store interval ref so we can clear it
        statusEl._stepInterval = stepInterval;

        try {
          const res = await apiFetch('/api/agents/nexus/orchestrate', {
            method: 'POST',
            body:   JSON.stringify({ instruction, priority, ...extraOpts }),
          });
          clearInterval(statusEl._stepInterval);
          statusEl.style.display = 'none';

          // ── Research complete — show brief + next-step buttons ──
          if (res?.type === 'research_complete') {
            _pendingBrief       = res.brief;
            _pendingInstruction = instruction;
            renderMarkdown(markdownEl,
              `**Orion has completed the research.**\n\n${res.brief || ''}\n\n---\n*What should I do with these findings?*`
            );
            // Inject next-step buttons below the output
            const btnRow = document.createElement('div');
            btnRow.className = 'nexus-nextstep-row';
            btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:12px 0 4px;';
            (res.nextSteps || []).forEach(step => {
              const btn = document.createElement('button');
              btn.className   = 'btn-console-run';
              btn.style.cssText = 'font-size:13px;padding:6px 14px;';
              btn.textContent = step.label;
              btn.title       = step.description || '';
              btn.addEventListener('click', async () => {
                btnRow.remove();
                await callOrchestrate(_pendingInstruction, {
                  researchBrief: _pendingBrief,
                  nextStep:      step.id,
                });
              });
              btnRow.appendChild(btn);
            });
            outputEl.style.display = 'flex';
            outputEl.appendChild(btnRow);

          // ── Blog published ──
          } else if (res?.type === 'blog_published') {
            renderMarkdown(markdownEl,
              `**${res.published ? '✓ Article published as draft' : '✓ Article written'}**\n\n` +
              `**"${res.title}"**\n\n${res.message}\n\n---\n*Preview:*\n\n${res.content || ''}`
            );
            outputEl.style.display = 'flex';

          // ── Atlas BD brief ──
          } else if (res?.type === 'bd_brief_ready') {
            renderMarkdown(markdownEl,
              `**Atlas — BD Strategy Brief**\n\n${res.message}\n\n---\n\n${res.content || ''}`
            );
            outputEl.style.display = 'flex';

          // ── Nova automation brief ──
          } else if (res?.type === 'automation_brief_ready') {
            renderMarkdown(markdownEl,
              `**Nova — Automation Solution Design**\n\n${res.message}\n\n---\n\n${res.content || ''}`
            );
            outputEl.style.display = 'flex';

          // ── Task queued ──
          } else if (res?.type === 'task_queued') {
            renderMarkdown(markdownEl, `**Task queued successfully**\n\n${res.message}`);
            outputEl.style.display = 'flex';

          // ── Execution plan (multi-step) ──
          } else if (res?.plan && Array.isArray(res.plan)) {
            const lines = [`**Execution Plan** — ${res.plan.length} task(s) queued\n`];
            res.plan.forEach((t, i) => {
              lines.push(`**${i + 1}. ${t.title}**`);
              if (t.agent_id)    lines.push(`- Agent: \`${t.agent_id}\``);
              if (t.type)        lines.push(`- Type: ${t.type}`);
              if (t.description) lines.push(`- ${t.description}`);
              lines.push('');
            });
            renderMarkdown(markdownEl, lines.join('\n'));
            outputEl.style.display = 'flex';

          } else {
            renderMarkdown(markdownEl, '```json\n' + JSON.stringify(res, null, 2) + '\n```');
            outputEl.style.display = 'flex';
          }
        } catch (e) {
          clearInterval(statusEl._stepInterval);
          statusEl.style.display = 'none';
          renderMarkdown(markdownEl, `**Error:** ${esc(e.message)}`);
          outputEl.style.display = 'flex';
        }
        runBtn.disabled = false;
      }

      runBtn?.addEventListener('click', async () => {
        const goal = $('nexusGoalInput')?.value?.trim();
        if (!goal) { alert('Please enter a goal or question for Nexus.'); return; }
        // Clear any previous next-step buttons
        outputEl.querySelectorAll('.nexus-nextstep-row').forEach(el => el.remove());
        _pendingBrief = null;
        await callOrchestrate(goal);
      });
      copyBtn?.addEventListener('click', () => copyText(markdownEl?.innerText || ''));
    }

    /* ── Synthesizer ── */
    if (agentId === 'synthesizer') {
      const statusEl  = $('synthTaskStatus');
      const statusMsg = $('synthTaskStatusMsg');
      const outputEl  = $('synthOutput');
      const outputLbl = $('synthOutputLabel');
      const mdEl      = $('synthMarkdownOutput');
      const copyBtn   = $('synthCopyBtn');

      $('synthIngestBtn')?.addEventListener('click', async () => {
        const prefix = $('synthPrefixInput')?.value?.trim() || null;
        const domain = $('synthDomainInput')?.value?.trim() || 'general';
        outputLbl.textContent = `Ingesting from R2: ${prefix || 'knowledge/ + library/'}`;
        // prefix=null → ingestAll uses default ['knowledge/', 'library/']
        const payload = prefix
          ? { action: 'ingest_all', prefix, domain }
          : { action: 'ingest_all', domain };
        await runTask('synthesizer', payload, {
          statusEl, statusMsgEl: statusMsg, outputEl, outputLabelEl: outputLbl, markdownEl: mdEl, onSuccess () {},
        });
      });

      $('synthQueryBtn')?.addEventListener('click', async () => {
        const q = $('synthQueryInput')?.value?.trim();
        if (!q) { alert('Please enter a query.'); return; }
        outputLbl.textContent = 'Knowledge base answer';
        await runTask('synthesizer', { action: 'query', query: q }, {
          statusEl, statusMsgEl: statusMsg, outputEl, outputLabelEl: outputLbl, markdownEl: mdEl, onSuccess () {},
        });
      });

      copyBtn?.addEventListener('click', () => copyText(mdEl?.innerText || ''));
    }

    /* ── Pulse ── */
    if (agentId === 'pulse') {
      const statusEl  = $('pulseTaskStatus');
      const statusMsg = $('pulseTaskStatusMsg');
      const outputEl  = $('pulseOutput');
      const outputLbl = $('pulseOutputLabel');
      const mdEl      = $('pulseMarkdownOutput');
      const copyBtn   = $('pulseCopyBtn');

      $('pulseSweepBtn')?.addEventListener('click', async () => {
        outputLbl.textContent = 'Sweep report';
        await runTask('pulse', { action: 'sweep' }, {
          statusEl, statusMsgEl: statusMsg, outputEl, outputLabelEl: outputLbl, markdownEl: mdEl, onSuccess () {},
        });
      });

      $('pulseDispatchBtn')?.addEventListener('click', async () => {
        outputLbl.textContent = 'Dispatch result';
        await runTask('pulse', { action: 'dispatch' }, {
          statusEl, statusMsgEl: statusMsg, outputEl, outputLabelEl: outputLbl, markdownEl: mdEl, onSuccess () {},
        });
      });

      copyBtn?.addEventListener('click', () => copyText(mdEl?.innerText || ''));

      // Wire the OneSignal subscription widget once the SDK is ready.
      wirePushWidget();
    }

    /* ── Nova ── */
    if (agentId === 'nova') {
      const runBtn    = $('novaRunBtn');
      const statusEl  = $('novaTaskStatus');
      const statusMsg = $('novaTaskStatusMsg');
      const outputEl  = $('novaOutput');
      const outputLbl = $('novaOutputLabel');
      const mdEl      = $('novaMarkdownOutput');
      const copyBtn   = $('novaCopyBtn');

      runBtn?.addEventListener('click', async () => {
        const text   = $('novaTaskInput')?.value?.trim();
        const action = $('novaActionSelect')?.value || 'design_workflow';
        if (!text) { alert('Please describe the automation.'); return; }
        runBtn.disabled = true;
        const actionMap = {
          'phase2_architect': 'nova/phase2-architect',
          'phase3_build':     'nova/phase3-build',
        };
        const routeId = actionMap[action] ? 'nova' : 'nova';
        await runTask(routeId, { action, description: text }, {
          statusEl, statusMsgEl: statusMsg, outputEl, outputLabelEl: outputLbl, markdownEl: mdEl,
          onSuccess () { runBtn.disabled = false; },
        });
        runBtn.disabled = false;
      });
      copyBtn?.addEventListener('click', () => copyText(mdEl?.innerText || ''));
      wireChatPanel(agentId);
    }

    /* ── Aether ── */
    if (agentId === 'aether') {
      const runBtn    = $('aetherRunBtn');
      const statusEl  = $('aetherTaskStatus');
      const statusMsg = $('aetherTaskStatusMsg');
      const outputEl  = $('aetherOutput');
      const outputLbl = $('aetherOutputLabel');
      const mdEl      = $('aetherMarkdownOutput');
      const copyBtn   = $('aetherCopyBtn');

      runBtn?.addEventListener('click', async () => {
        const text   = $('aetherTaskInput')?.value?.trim();
        const action = $('aetherActionSelect')?.value || 'write';
        const fmt    = $('aetherFormatSelect')?.value || 'blog_post';
        if (!text) { alert('Please describe the content task.'); return; }
        runBtn.disabled = true;
        await runTask('aether', { action, description: text, format: fmt }, {
          statusEl, statusMsgEl: statusMsg, outputEl, outputLabelEl: outputLbl, markdownEl: mdEl,
          onSuccess () { runBtn.disabled = false; },
        });
        runBtn.disabled = false;
      });
      copyBtn?.addEventListener('click', () => copyText(mdEl?.innerText || ''));

      // ── Write & Publish Blog via Aether pipeline ──────────────────────────
      const publishBlogBtn = $('aetherPublishBlogBtn');
      publishBlogBtn?.addEventListener('click', async () => {
        const topic         = $('aetherTaskInput')?.value?.trim();
        const researchBrief = $('aetherResearchBrief')?.value?.trim() || '';
        const playbookSlug  = $('aetherPlaybookSlug')?.value?.trim() || '';
        const frameworkId   = $('aetherFrameworkId')?.value?.trim() || '';
        if (!topic) { alert('Enter a derivative angle / headline first.'); return; }
        if (!researchBrief && !playbookSlug) {
          alert('Blog derivatives require IP lineage: paste an Orion research brief OR enter a playbook slug from Intelligence Studio.');
          return;
        }
        publishBlogBtn.disabled = true;
        runBtn.disabled = true;
        statusEl.style.display = 'flex';
        statusMsg.textContent  = 'Aether is writing and publishing your blog derivative…';
        outputEl.style.display = 'none';

        try {
          const backendUrl = localStorage.getItem('backendUrl') || 'http://localhost:8787';
          const res = await fetch(`${backendUrl}/api/agents/aether/write-blog`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              topic,
              researchBrief,
              playbookSlug,
              frameworkId,
              audience:   'business professionals in digital transformation, automation, or media',
              tone:       'authoritative yet accessible',
              niche:      'digital_media',
              ctaGoal:    'Book a free strategy session at digitafusion.com/agency/booking',
              wordCount:  1200,
              publish:    true,
              author:     'Boroji Adebayo-Hopewell, Founder',
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Publish failed');

          const post = data.post || {};
          outputEl.style.display  = 'block';
          outputLbl.textContent   = `✓ Published: ${post.title || topic}`;
          mdEl.innerHTML = `
            <div style="padding:12px 0">
              <p style="font-size:13px;color:var(--color-accent);margin-bottom:6px">Blog post published to DigiFusion</p>
              <p style="font-size:15px;font-weight:600;margin-bottom:4px">${esc(post.title || topic)}</p>
              ${post.url ? `<a href="${post.url}" target="_blank" style="font-size:12px;color:var(--color-accent)">${post.url}</a>` : ''}
              <p style="font-size:12px;color:var(--color-muted);margin-top:8px">${esc(post.metaDescription || '')}</p>
            </div>`;
        } catch (e) {
          statusMsg.textContent = `✗ ${e.message}`;
        } finally {
          statusEl.style.display = 'none';
          publishBlogBtn.disabled = false;
          runBtn.disabled = false;
        }
      });

      wireChatPanel(agentId);
    }

    /* ── Assistant ── */
    if (agentId === 'assistant') {
      wireChatPanel(agentId);
    }

    /* ── Chat for agents that already have their own task UI ── */
    if (['nexus', 'atlas', 'synthesizer', 'pulse'].includes(agentId)) {
      // Inject a collapsible chat section below the existing panel content
      const panel = area.querySelector(`.console-panel-inner`);
      if (panel && !panel.querySelector('.agent-chat-wrap')) {
        const agent = AGENTS.find(a => a.id === agentId);
        const chatEl = document.createElement('div');
        chatEl.className = 'console-panel-section';
        chatEl.innerHTML = `
          <div class="console-section-header" style="cursor:pointer" id="chatToggle-${agentId}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Chat with ${esc(agent?.name || agentId)}
            <span class="chat-toggle-arrow" id="chatArrow-${agentId}" style="margin-left:auto;transition:transform .2s">▾</span>
          </div>
          <div id="chatContainer-${agentId}" style="display:none">
            <div class="agent-chat-wrap" id="chatWrap-${agentId}">
              <div class="agent-chat-messages" id="chatMessages-${agentId}" aria-live="polite">
                <div class="chat-bubble chat-bubble--agent">
                  <span class="chat-bubble-name">${esc(agent?.name || agentId)}</span>
                  <p>Hi — I'm ${esc(agent?.name || agentId)}. Ask me anything about my work or the network.</p>
                </div>
              </div>
              <div class="agent-chat-footer">
                <textarea class="agent-chat-input" id="chatInput-${agentId}" rows="1"
                  placeholder="Message ${esc(agent?.name || agentId)}…"></textarea>
                <button class="agent-chat-send" id="chatSend-${agentId}" title="Send (Enter)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
                <button class="agent-chat-clear" id="chatClear-${agentId}" title="Clear">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
                </button>
              </div>
            </div>
          </div>`;
        panel.appendChild(chatEl);

        // Toggle open/close
        document.getElementById(`chatToggle-${agentId}`)?.addEventListener('click', () => {
          const container = $(`chatContainer-${agentId}`);
          const arrow     = $(`chatArrow-${agentId}`);
          if (!container) return;
          const open = container.style.display === 'none';
          container.style.display = open ? 'block' : 'none';
          if (arrow) arrow.style.transform = open ? 'rotate(180deg)' : '';
        });

        wireChatPanel(agentId);
      }
    }

    /* ── Generic agents (fallback) ── */
    area.querySelectorAll('[data-generic-run]').forEach(btn => {
      const id = btn.dataset.genericRun;
      btn.addEventListener('click', async () => {
        const text = $(`genericTaskInput-${id}`)?.value?.trim();
        if (!text) { alert('Please enter a task description.'); return; }
        btn.disabled = true;
        await runTask(id, { action: 'task', description: text }, {
          statusEl:    $(`genericStatus-${id}`),
          statusMsgEl: $(`genericStatusMsg-${id}`),
          outputEl:    $(`genericOutput-${id}`),
          markdownEl:  $(`genericMarkdown-${id}`),
          onSuccess () { btn.disabled = false; },
        });
        btn.disabled = false;
      });
    });

    area.querySelectorAll('[data-generic-copy]').forEach(btn => {
      const id = btn.dataset.genericCopy;
      btn.addEventListener('click', () => copyText($(`genericMarkdown-${id}`)?.innerText || ''));
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     TASKS TAB
  ═══════════════════════════════════════════════════════════════ */
  async function loadTasks () {
    const agentFilter  = $('tasksAgentFilter')?.value  || '';
    const statusFilter = $('tasksStatusFilter')?.value || '';
    const tbody        = $('tasksTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="agents-table-empty">Loading…</td></tr>`;
    try {
      const data  = await fetchTasks(agentFilter, statusFilter);
      const tasks = data.tasks || data || [];
      if (!tasks.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="agents-table-empty">No tasks found.</td></tr>`;
        return;
      }
      tbody.innerHTML = tasks.map(t => {
        const agent = AGENTS.find(a => a.id === t.agent_id) || { name: t.agent_id, color: '#888' };
        const dur   = fmtDuration(t.created_at, t.completed_at);
        return `
          <tr class="tasks-row" data-task-id="${esc(t.id)}">
            <td>
              <span class="task-agent-chip" style="--agent-color:${agent.color}">${esc(agent.name || t.agent_id)}</span>
            </td>
            <td class="task-title-cell">${esc(t.title || t.description || '—')}</td>
            <td>${statusBadge(t.status)}</td>
            <td class="task-date-cell">${relTime(t.created_at)}</td>
            <td class="task-dur-cell">${dur}</td>
            <td>
              ${t.result || t.output ? `<button class="btn-task-view" data-task-id="${esc(t.id)}">View</button>` : ''}
            </td>
          </tr>`;
      }).join('');

      tbody.querySelectorAll('.btn-task-view').forEach(btn => {
        btn.addEventListener('click', () => {
          const task = tasks.find(t => String(t.id) === btn.dataset.taskId);
          if (task) openTaskDrawer(task);
        });
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="agents-table-empty agents-table-error">${esc(err.message)}</td></tr>`;
    }
  }

  /* Task output drawer */
  function openTaskDrawer (task) {
    const drawer  = $('taskOutputDrawer');
    const overlay = $('taskOutputOverlay');
    const title   = $('taskOutputTitle');
    const body    = $('taskOutputBody');
    if (!drawer || !body) return;
    title.textContent = task.title || task.description || 'Task Output';
    renderMarkdown(body, task.result || task.output || '(No output recorded)');
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }

  function closeTaskDrawer () {
    $('taskOutputDrawer')?.classList.remove('open');
    $('taskOutputOverlay')?.classList.remove('open');
    $('taskOutputDrawer')?.setAttribute('aria-hidden', 'true');
  }

  /* ═══════════════════════════════════════════════════════════════
     LEADS TAB
  ═══════════════════════════════════════════════════════════════ */
  async function loadLeads () {
    const statusFilter = $('leadsStatusFilter')?.value || '';
    const grid = $('leadsGrid');
    if (!grid) return;
    grid.innerHTML = `<div class="agents-grid-loading"><div class="agents-spinner"></div><span>Loading leads…</span></div>`;
    try {
      const data  = await fetchLeads(statusFilter);
      const leads = data.leads || data || [];
      if (!leads.length) {
        grid.innerHTML = `<div class="leads-empty">No leads yet. The Assistant VA will populate leads as it qualifies website visitors.</div>`;
        return;
      }
      grid.innerHTML = leads.map(lead => {
        const score   = lead.lead_score ?? lead.score ?? 0;
        const scoreBar = Math.min(100, score * 20);   // 0–5 → 0–100%
        const scoreCls = score >= 4 ? 'score-high' : score >= 2 ? 'score-mid' : 'score-low';
        return `
          <div class="lead-card">
            <div class="lead-card-header">
              <div class="lead-name-block">
                <div class="lead-name">${esc(lead.name || lead.company || 'Anonymous')}</div>
                ${lead.email ? `<div class="lead-email">${esc(lead.email)}</div>` : ''}
              </div>
              <div class="lead-score-badge ${scoreCls}">${score}/5</div>
            </div>
            <div class="lead-score-bar">
              <div class="lead-score-fill" style="width:${scoreBar}%"></div>
            </div>
            ${lead.challenge ? `<p class="lead-challenge">${esc(lead.challenge)}</p>` : ''}
            <div class="lead-card-footer">
              <span class="lead-status-tag">${esc(lead.status || 'new')}</span>
              <span class="lead-time">${relTime(lead.created_at)}</span>
              ${lead.booking_url ? `<a href="${esc(lead.booking_url)}" target="_blank" rel="noopener" class="btn-lead-book">Book</a>` : ''}
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      grid.innerHTML = `<div class="leads-empty leads-error">${esc(err.message)}</div>`;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ONESIGNAL PUSH WIDGET — wires the subscription status card
     inside the Pulse console panel.
  ═══════════════════════════════════════════════════════════════ */
  function wirePushWidget () {
    // If the SDK hasn't initialised yet, wait for the custom event.
    if (!window._osReady) {
      document.addEventListener('onesignal:ready', wirePushWidget, { once: true });
      return;
    }
    refreshPushWidget();
  }

  async function refreshPushWidget () {
    const dot     = $('pulsePushDot');
    const label   = $('pulsePushStatusLabel');
    const desc    = $('pulsePushDesc');
    const actions = $('pulsePushActions');
    if (!dot || !label || !desc || !actions) return;

    try {
      const OS         = window.OneSignal;
      const permission = await OS.Notifications.permission;       // true / false / 'default'
      const subscribed = await OS.User.PushSubscription.optedIn; // boolean

      if (subscribed && permission) {
        dot.className   = 'pulse-push-dot pulse-push-dot--active';
        label.textContent = 'Subscribed';
        desc.textContent  = 'This browser will receive push notifications from Pulse. You can unsubscribe at any time.';
        actions.innerHTML = `<button class="btn-console-run btn-secondary-run" id="pulseUnsubscribeBtn">Disable Push</button>`;
        $('pulseUnsubscribeBtn')?.addEventListener('click', async () => {
          await OS.User.PushSubscription.optOut();
          refreshPushWidget();
        });
      } else if (permission === false || Notification.permission === 'denied') {
        dot.className   = 'pulse-push-dot pulse-push-dot--blocked';
        label.textContent = 'Blocked';
        desc.textContent  = 'Notifications are blocked in browser settings. Open browser site settings and set Notifications to "Allow", then reload.';
        actions.innerHTML = '';
      } else {
        dot.className   = 'pulse-push-dot pulse-push-dot--inactive';
        label.textContent = 'Not subscribed';
        desc.textContent  = 'Subscribe to receive real-time Pulse alerts in this browser.';
        actions.innerHTML = `<button class="btn-console-run" id="pulseSubscribeBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Enable Push
        </button>`;
        $('pulseSubscribeBtn')?.addEventListener('click', async () => {
          $('pulseSubscribeBtn').disabled = true;
          $('pulseSubscribeBtn').textContent = 'Requesting…';
          try {
            await OS.User.PushSubscription.optIn();
          } catch (e) {
            console.warn('[Pulse] Push opt-in failed:', e);
          }
          refreshPushWidget();
        });
      }
    } catch (e) {
      if ($('pulsePushDot'))   $('pulsePushDot').className = 'pulse-push-dot pulse-push-dot--unknown';
      if ($('pulsePushStatusLabel')) $('pulsePushStatusLabel').textContent = 'SDK unavailable';
      if ($('pulsePushDesc'))  $('pulsePushDesc').textContent = 'OneSignal SDK did not load. Check your internet connection or browser extensions.';
    }

    // Re-check any time the push subscription changes.
    window.OneSignal?.User?.PushSubscription?.addEventListener('change', refreshPushWidget);
  }

  /* ═══════════════════════════════════════════════════════════════
     INIT & WIRE-UP
  ═══════════════════════════════════════════════════════════════ */
  function init () {
    /* Seed the console nav immediately (no network needed) */
    buildConsoleNav();

    /* Refresh button — Network */
    $('agentsRefreshBtn')?.addEventListener('click', loadNetworkStatus);
    $('ceoOpsRefreshBtn')?.addEventListener('click', loadCeoOps);
    $('ceoNotionSyncBtn')?.addEventListener('click', async () => {
      const btn = $('ceoNotionSyncBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
      try {
        await apiFetch('/api/agents/nexus/sync-notion', { method: 'POST', body: '{}' });
        const summary = $('agentsStatusSummary');
        if (summary) summary.textContent = 'Notion synced';
      } catch (e) {
        alert(`Notion sync failed: ${e.message}`);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Sync Notion'; }
      }
    });
    $('activityRefreshBtn')?.addEventListener('click', loadActivityTimeline);
    $('activityAgentFilter')?.addEventListener('change', loadActivityTimeline);

    /* Refresh — Tasks */
    $('tasksRefreshBtn')?.addEventListener('click', loadTasks);
    $('tasksAgentFilter')?.addEventListener('change', loadTasks);
    $('tasksStatusFilter')?.addEventListener('change', loadTasks);

    /* ── New Task modal ── */
    const newTaskOverlay  = $('newTaskOverlay');
    const newTaskForm     = $('newTaskForm');
    const newTaskError    = $('newTaskError');
    const newTaskSubmitBtn = $('newTaskSubmitBtn');

    function openNewTaskModal () {
      if (!newTaskOverlay) return;
      newTaskForm?.reset();
      if (newTaskError) { newTaskError.style.display = 'none'; newTaskError.textContent = ''; }
      newTaskOverlay.style.display = 'flex';
      setTimeout(() => $('ntTitle')?.focus(), 50);
    }
    function closeNewTaskModal () {
      if (newTaskOverlay) newTaskOverlay.style.display = 'none';
    }

    $('tasksNewBtn')?.addEventListener('click', openNewTaskModal);
    $('newTaskCloseBtn')?.addEventListener('click', closeNewTaskModal);
    $('newTaskCancelBtn')?.addEventListener('click', closeNewTaskModal);
    newTaskOverlay?.addEventListener('click', e => { if (e.target === newTaskOverlay) closeNewTaskModal(); });

    newTaskForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title       = $('ntTitle')?.value.trim();
      const description = $('ntDescription')?.value.trim();
      const agent_id    = $('ntAgent')?.value;
      const priority    = $('ntPriority')?.value;
      const type        = $('ntType')?.value;
      const due_raw     = $('ntDue')?.value;
      const due_at      = due_raw ? new Date(due_raw).toISOString() : null;

      if (!title) { return; }
      newTaskSubmitBtn.disabled = true;
      newTaskSubmitBtn.textContent = 'Creating…';
      if (newTaskError) newTaskError.style.display = 'none';

      try {
        const res = await fetch(`${getBackendUrl()}/api/agents/tasks`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ title, description, agent_id: agent_id || null, priority, type, due_at }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create task');
        closeNewTaskModal();
        await loadTasks();
      } catch (ex) {
        if (newTaskError) { newTaskError.textContent = ex.message; newTaskError.style.display = 'block'; }
      } finally {
        newTaskSubmitBtn.disabled = false;
        newTaskSubmitBtn.textContent = 'Create Task';
      }
    });

    /* Refresh — Leads */
    $('leadsRefreshBtn')?.addEventListener('click', loadLeads);
    $('leadsStatusFilter')?.addEventListener('change', loadLeads);

    /* Drawer close */
    $('taskOutputClose')?.addEventListener('click', closeTaskDrawer);
    $('taskOutputOverlay')?.addEventListener('click', closeTaskDrawer);

    /* Auto-load when each sub-tab becomes active.
       Piggyback on the sidebar nav-btn clicks + module-tab clicks. */
    function onAgentsTabActivated (tab) {
      if (tab === 'agents-command')  loadCeoOps();
      if (tab === 'agents-workflow') wireWorkflowTab();
      if (tab === 'agents-activity') loadActivityTimeline();
      if (tab === 'agents-network') loadNetworkStatus();
      if (tab === 'agents-tasks')   loadTasks();
      if (tab === 'agents-leads')   loadLeads();
      if (tab === 'agents-console') buildConsoleNav();
      if (tab === 'agents-ip')      { loadFirmIpCatalog(); loadIPLibrary(); }
      if (tab === 'agents-content') { loadContentCalendar(); wireContentTab(); }
    }

    document.querySelectorAll('.module-tab[data-subtab]').forEach(btn => {
      btn.addEventListener('click', () => onAgentsTabActivated(btn.dataset.subtab));
    });

    document.addEventListener('pg:tab-change', (e) => {
      const { tab, module } = e.detail || {};
      if (module === 'agents' || tab?.startsWith('agents-')) onAgentsTabActivated(tab);
    });

    /* Auto-load if agents is the active module on page load */
    if (document.getElementById('module-agents')?.classList.contains('active')) {
      const activeTab = document.querySelector('.tab-panel.active')?.id?.replace('tab-', '');
      if (activeTab === 'agents-command') loadCeoOps();
      else if (activeTab === 'agents-activity') loadActivityTimeline();
      else if (activeTab === 'agents-network') loadNetworkStatus();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     CONTENT WORKFLOW TAB
  ═══════════════════════════════════════════════════════════════ */

  let _contentTabWired = false;

  function wireContentTab () {
    if (_contentTabWired) return;
    _contentTabWired = true;

    /* ── Generate Brief ── */
    $('genBriefBtn')?.addEventListener('click', async () => {
      const topic  = $('briefTopic')?.value.trim();
      const sector = $('briefSector')?.value.trim();
      const angle  = $('briefAngle')?.value.trim();
      const depth  = $('briefDepth')?.value || 'standard';

      if (!topic) { alert('Please enter a topic.'); return; }

      const statusEl = $('briefStatus');
      const wrapEl   = $('briefOutputWrap');
      const labelEl  = $('briefOutputLabel');
      const outEl    = $('briefOutput');

      statusEl.textContent = '🔍 Researcher is gathering intelligence…';
      wrapEl.style.display = 'none';
      $('genBriefBtn').disabled = true;

      try {
        const base = getBackendUrl();
        const res  = await fetch(`${base}/api/content/brief`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, sector, angle, depth }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);

        statusEl.textContent = `✓ Brief ready — ${data.sources?.length || 0} sources`;
        labelEl.textContent  = `Brief: ${topic}`;
        renderMarkdown(outEl, data.brief || data.summary || JSON.stringify(data, null, 2));
        wrapEl.style.display = 'block';

        // Pre-fill publish fields for convenience
        if (!$('publishTopic')?.value) $('publishTopic').value = topic;
        if (sector && !$('publishSector')?.value) $('publishSector').value = sector;
        if (!$('publishAngle')?.value) $('publishAngle').value = (data.brief || '').slice(0, 500);
      } catch (e) {
        statusEl.textContent = `✗ ${e.message}`;
      } finally {
        $('genBriefBtn').disabled = false;
      }
    });

    /* ── Publish Article ── */
    $('publishArticleBtn')?.addEventListener('click', async () => {
      const topic   = $('publishTopic')?.value.trim();
      const sector  = $('publishSector')?.value.trim();
      const angle   = $('publishAngle')?.value.trim();
      const publish = $('publishLive')?.checked !== false;

      if (!topic) { alert('Please enter a topic or title.'); return; }

      const statusEl = $('publishStatus');
      const wrapEl   = $('publishOutputWrap');
      const labelEl  = $('publishOutputLabel');
      const outEl    = $('publishOutput');

      statusEl.textContent = '✍ Aether is writing the article…';
      wrapEl.style.display = 'none';
      $('publishArticleBtn').disabled = true;

      try {
        const base = getBackendUrl();
        const res  = await fetch(`${base}/api/content/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, sector, angle, publish }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);

        const post = data.post || data;
        statusEl.textContent = `✓ ${publish ? 'Published' : 'Draft saved'}: ${post.title || topic}`;
        labelEl.textContent  = publish ? `✓ Published` : `Draft`;

        let html = '';
        if (post.slug)  html += `<p><strong>Slug:</strong> ${esc(post.slug)}</p>`;
        if (post.url)   html += `<p><a href="${esc(post.url)}" target="_blank" rel="noopener">${esc(post.url)}</a></p>`;
        if (post.excerpt) html += `<blockquote>${esc(post.excerpt)}</blockquote>`;
        outEl.innerHTML = html || `<p>${esc(JSON.stringify(post))}</p>`;
        wrapEl.style.display = 'block';
      } catch (e) {
        statusEl.textContent = `✗ ${e.message}`;
      } finally {
        $('publishArticleBtn').disabled = false;
      }
    });

    /* ── C2C Pillar + cluster calendar (approval path) ── */
    $('genCalendarBtn')?.addEventListener('click', async () => {
      const pillarTopic = prompt('Pillar topic for 90-day C2C calendar:', 'AI automation for African SMEs without enterprise budgets');
      if (!pillarTopic) return;
      $('genCalendarBtn').disabled = true;
      $('genCalendarBtn').textContent = 'Building C2C plan…';
      try {
        const base = getBackendUrl();
        const res  = await fetch(`${base}/api/c2c/pillar-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pillarTopic, sector: 'sme', enqueue: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        alert(`C2C plan queued: ${data.queued || 0} items. Nexus will route each through your WhatsApp approval gate.`);
        await loadContentCalendar();
      } catch (e) {
        alert(`C2C calendar failed: ${e.message}`);
      } finally {
        $('genCalendarBtn').disabled = false;
        $('genCalendarBtn').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Generate Content Calendar`;
      }
    });

    /* ── Refresh calendar ── */
    $('refreshCalendarBtn')?.addEventListener('click', loadContentCalendar);

    /* ── Schedule single article ── */
    $('scheduleArticleBtn')?.addEventListener('click', async () => {
      const topic    = prompt('Article topic:');
      if (!topic) return;
      const sector   = prompt('Sector (optional):') || '';
      const angle    = prompt('Angle / key points (optional):') || '';
      const dateStr  = prompt('Publish date (YYYY-MM-DD, leave blank for tomorrow):') || '';

      const publishAt = dateStr
        ? new Date(dateStr).toISOString()
        : new Date(Date.now() + 86400000).toISOString();

      try {
        const base = getBackendUrl();
        const res  = await fetch(`${base}/api/content/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, sector, angle, publishAt }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        await loadContentCalendar();
      } catch (e) {
        alert(`Scheduling failed: ${e.message}`);
      }
    });
  }

  async function loadContentCalendar () {
    const body = $('contentCalendarBody');
    if (!body) return;
    body.innerHTML = '<div class="content-empty">Loading queue…</div>';
    try {
      const base = getBackendUrl();
      const res  = await fetch(`${base}/api/content/calendar`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);

      const items = Array.isArray(data) ? data : (data.calendar || data.items || data.articles || []);
      if (!items.length) {
        body.innerHTML = '<div class="content-empty">No articles queued. Use "Generate Content Calendar" or schedule one manually.</div>';
        return;
      }

      body.innerHTML = `
        <table class="content-table">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Sector</th>
              <th>Angle</th>
              <th>Publish At</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(a => `
              <tr>
                <td>${esc(a.topic || a.title || '—')}</td>
                <td>${esc(a.sector || '—')}</td>
                <td class="content-table-angle">${esc((a.angle || a.description || '').slice(0, 80))}${(a.angle || '').length > 80 ? '…' : ''}</td>
                <td>${a.publishAt ? new Date(a.publishAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}</td>
                <td><span class="content-badge content-badge-${esc(a.status || 'queued')}">${esc(a.status || 'queued')}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      body.innerHTML = `<div class="content-empty content-empty-err">Failed to load queue: ${esc(e.message)}</div>`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ══════════════════════════════════════════════════════════════════════════
// AGENCY IP — Playbook Synthesizer + IP Library
// ══════════════════════════════════════════════════════════════════════════

/**
 * Collect selected source frameworks from the checkbox grid.
 */
function getSelectedSources() {
  return Array.from(
    document.querySelectorAll('#ipSourcesGrid input[type=checkbox]:checked')
  ).map(cb => cb.value);
}

/**
 * Trigger Phase 1+2+3 synthesis via Atlas → save to R2 agency IP store.
 */
async function synthesizePlaybook() {
  const title       = document.getElementById('ipTitle')?.value.trim();
  const type        = document.getElementById('ipType')?.value        || 'playbook';
  const domain      = document.getElementById('ipDomain')?.value      || 'business_development';
  const access      = document.getElementById('ipAccess')?.value      || 'premium';
  const tagline     = document.getElementById('ipTagline')?.value.trim() || '';
  const instruction = document.getElementById('ipInstruction')?.value.trim() || '';
  const sources     = getSelectedSources();

  if (!title) { alert('Please enter a playbook title.'); return; }

  const btn    = document.getElementById('btnSynthesize');
  const status = document.getElementById('ipSynthStatus');
  const wrap   = document.getElementById('ipOutputWrap');
  const body   = document.getElementById('ipOutputBody');

  btn.disabled  = true;
  btn.textContent = 'Synthesizing…';
  status.textContent = 'Sending to Atlas — this may take 30–60 seconds…';
  if (wrap) wrap.style.display = 'none';

  try {
    const promote = document.getElementById('ipPromoteLibrary')?.checked === true;
    const promoteAsOperating = document.getElementById('ipPromoteDna')?.checked === true;

    const res = await window._agentApiFetch('/api/agents/atlas/synthesize-playbook', {
      method: 'POST',
      body: { title, type, domain, access, tagline, instruction, sources, promote, promoteAsOperating },
    });

    if (res.ok && (res.entry || res.slug)) {
      const slug = res.entry?.slug || res.slug;
      status.textContent = `✓ Saved as "${slug}"${res.promotion ? ' · promoted to agent DNA' : ''}${res.quality ? ` · ${res.quality.grade}` : ''}`;
      status.style.color = '#22c55e';

      // Show preview
      if (wrap && body) {
        body.innerHTML = renderAgentMarkdown(res.preview + '\n\n*…(full document saved to Agency IP Library)*');
        wrap.style.display = 'block';
      }
      // Refresh library
      loadIPLibrary();
    } else {
      throw new Error(res.error || 'Unexpected response');
    }
  } catch (e) {
    status.textContent = `✗ ${e.message}`;
    status.style.color = '#ef4444';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Synthesize Playbook';
  }
}

/**
 * Download the last generated playbook as a DOCX via the produce-doc endpoint.
 */
async function downloadIPDoc() {
  const title   = document.getElementById('ipTitle')?.value.trim() || 'Agency Playbook';
  const content = document.getElementById('ipOutputBody')?.innerText || '';
  if (!content) return;

  try {
    const res = await fetch('/api/agents/atlas/produce-doc', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, content, docType: 'framework', format: 'docx', author: 'DigiFusion Agency' }),
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = title.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.docx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('Download failed: ' + e.message);
  }
}

/**
 * Load and render the canonical Firm IP catalog (operating + library layers).
 */
async function loadFirmIpCatalog() {
  const container = document.getElementById('firmIpCatalogBody');
  if (!container) return;
  container.innerHTML = '<div class="agents-grid-loading"><div class="agents-spinner"></div><span>Loading catalog…</span></div>';

  try {
    const catalog = await window._agentApiFetch('/api/firm-ip/library');
    const operating = catalog.operating || [];
    const library   = catalog.library   || [];

    const renderSection = (title, items, badgeClass) => {
      if (!items.length) return `<p class="ip-library-empty">No ${title.toLowerCase()} registered.</p>`;
      return `
        <h4 class="ip-section-label">${title}</h4>
        <div class="ip-library-grid">
          ${items.map(item => `
            <div class="ip-library-item">
              <div class="ip-item-top">
                <span class="ip-badge ${badgeClass}">${item.layer === 'intelligence_library' ? 'Library' : 'DNA'}</span>
                <span class="ip-badge ip-badge--access ${item.access === 'purchasable' ? '' : 'ip-badge--public'}">${item.access || 'internal'}</span>
              </div>
              <h4 class="ip-item-title">${item.name}</h4>
              <p class="ip-item-tagline">${item.oneLiner || item.description || ''}</p>
              ${item.agent ? `<p class="ip-item-sources">Agent: ${item.agent}</p>` : ''}
              ${item.r2?.key ? `<p class="ip-item-sources">R2: ${item.r2.key}</p>` : ''}
            </div>
          `).join('')}
        </div>`;
    };

    container.innerHTML = `
      ${renderSection('Operating Frameworks (Agent DNA)', operating, 'ip-badge--dna')}
      ${renderSection('Intelligence Library (Paywalled)', library, 'ip-badge--library')}
      <p class="ip-item-sources" style="margin-top:12px">Source: ${catalog.source || 'firmKnowledge.js'} · ${catalog.total || 0} documents</p>`;
  } catch (e) {
    container.innerHTML = `<p class="ip-library-empty" style="color:#ef4444">Failed to load catalog: ${e.message}</p>`;
  }
}

/**
 * Load and render the Agency IP library.
 */
async function loadIPLibrary() {
  const container = document.getElementById('ipLibraryBody');
  if (!container) return;
  container.innerHTML = '<div class="agents-grid-loading"><div class="agents-spinner"></div><span>Loading…</span></div>';

  try {
    const data = await window._agentApiFetch('/api/agents/agency-ip');
    const items = data.playbooks || [];

    if (!items.length) {
      container.innerHTML = '<p class="ip-library-empty">No agency IP generated yet. Use the Synthesizer above to create your first playbook.</p>';
      return;
    }

    const TYPE_COLOURS = {
      playbook:    '#6366f1',
      framework:   '#0ea5e9',
      template:    '#f59e0b',
      methodology: '#22c55e',
    };

    container.innerHTML = `
      <div class="ip-library-grid">
        ${items.map(pb => `
          <div class="ip-library-item">
            <div class="ip-item-top">
              <span class="ip-badge" style="background:${TYPE_COLOURS[pb.type] || '#6b7280'}22;color:${TYPE_COLOURS[pb.type] || '#6b7280'};border-color:${TYPE_COLOURS[pb.type] || '#6b7280'}44">${pb.type}</span>
              <span class="ip-badge ip-badge--access ${pb.access === 'public' ? 'ip-badge--public' : ''}">${pb.access}</span>
            </div>
            <h4 class="ip-item-title">${pb.title}</h4>
            <p class="ip-item-tagline">${pb.tagline || pb.domain?.replace(/_/g, ' ') || ''}</p>
            ${pb.sources?.length ? `<p class="ip-item-sources">Sources: ${pb.sources.join(', ')}</p>` : ''}
            <div class="ip-item-footer">
              <span class="ip-item-date">${new Date(pb.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <div class="ip-item-actions">
                <button class="ip-btn-secondary" onclick="viewIPDoc('${pb.slug}')">View</button>
                <button class="ip-btn-secondary ip-btn-danger" onclick="deleteIPDoc('${pb.slug}', this)">Delete</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>`;
  } catch (e) {
    container.innerHTML = `<p class="ip-library-empty" style="color:#ef4444">Failed to load: ${e.message}</p>`;
  }
}

/**
 * Open a playbook in a full-screen drawer (reuses the task output drawer pattern).
 */
async function viewIPDoc(slug) {
  const wrap   = document.getElementById('ipOutputWrap');
  const body   = document.getElementById('ipOutputBody');
  if (!wrap || !body) return;

  wrap.style.display = 'block';
  body.innerHTML = '<div class="agents-grid-loading"><div class="agents-spinner"></div><span>Loading full document…</span></div>';
  // Scroll into view
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const pb = await window._agentApiFetch(`/api/agents/agency-ip/${slug}`);
    document.getElementById('ipTitle').value    = pb.title   || '';
    document.getElementById('ipTagline').value  = pb.tagline || '';
    document.getElementById('ipDomain').value   = pb.domain  || 'business_development';
    document.getElementById('ipType').value     = pb.type    || 'playbook';
    document.getElementById('ipAccess').value   = pb.access  || 'premium';
    body.innerHTML = renderAgentMarkdown(pb.content || '*(no content)*');
  } catch (e) {
    body.innerHTML = `<p style="color:#ef4444">Failed to load: ${e.message}</p>`;
  }
}

/**
 * Delete an agency IP document with confirmation.
 */
async function deleteIPDoc(slug, btnEl) {
  if (!confirm(`Delete "${slug}"? This cannot be undone.`)) return;
  btnEl.disabled = true;
  try {
    await window._agentApiFetch(`/api/agents/agency-ip/${slug}`, { method: 'DELETE' });
    loadIPLibrary();
  } catch (e) {
    alert('Delete failed: ' + e.message);
    btnEl.disabled = false;
  }
}
function renderAgentMarkdown(md) {
  if (!md) return '';

  // Extract mermaid blocks first so they don't get mangled by other replacements
  const mermaidBlocks = [];
  const withPlaceholders = md.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    const id = `mermaid-${mermaidBlocks.length}-${Date.now()}`;
    mermaidBlocks.push({ id, code: code.trim() });
    return `%%MERMAID_${mermaidBlocks.length - 1}%%`;
  });

  let html = withPlaceholders
    // Tables: header row + separator + data rows
    .replace(/^\|(.+)\|\s*\n\|[-| :]+\|\s*\n((?:\|.+\|\s*\n?)*)/gm, (_, header, rows) => {
      const ths = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const trs = rows.trim().split('\n').map(row => {
        const tds = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<table class="ip-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
    })
    // Other code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Headings
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm,  '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,   '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,    '<h1>$1</h1>')
    // Blockquote (tagline)
    .replace(/^> (.+)$/gm, '<blockquote class="ip-tagline">$1</blockquote>')
    // HR
    .replace(/^---$/gm, '<hr class="ip-divider">')
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    // Bullet lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<)/, '<p>').replace(/(?<!\>)$/, '</p>');

  // Re-inject Mermaid diagrams as renderable divs
  mermaidBlocks.forEach(({ id, code }, i) => {
    html = html.replace(`%%MERMAID_${i}%%`,
      `<div class="ip-mermaid-wrap"><div class="mermaid" id="${id}">${code}</div></div>`);
  });

  // Trigger Mermaid render after DOM insertion (deferred)
  if (mermaidBlocks.length > 0) {
    setTimeout(() => {
      if (window.mermaid) {
        try { window.mermaid.run({ querySelector: '.mermaid' }); } catch (e) { console.warn('Mermaid render:', e.message); }
      }
    }, 100);
  }

  return html;
}
