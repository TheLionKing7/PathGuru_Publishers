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
      role: 'Project Intelligence',
      desc: 'Orchestrates the network. Breaks high-level goals into sequenced tasks and coordinates specialist agents to deliver.',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      color: '#c9a84c',
      actions: ['orchestrate'],
    },
    {
      id: 'atlas',
      name: 'Atlas',
      role: 'Research & BD',
      desc: 'Produces consultant-grade market research, prospect intelligence, and proprietary frameworks using Tavily + Firecrawl.',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
      color: '#5b8dee',
      actions: ['research', 'prospect_analysis', 'build_framework'],
    },
    {
      id: 'nova',
      name: 'Nova',
      role: 'Design & Brand',
      desc: 'Generates cover concepts, brand guidelines, visual identities and design system decisions.',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
      color: '#e85d9a',
      actions: ['design_brief', 'brand_guidelines'],
    },
    {
      id: 'aether',
      name: 'Aether',
      role: 'Content & Editorial',
      desc: 'Writes long-form manuscripts, blog posts, and editorial content — from outline to polished final copy.',
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
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}`);
    return json;
  }

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
      atlas:       buildAtlasPanel,
      nexus:       buildNexusPanel,
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
              <div class="console-card-title">Ingest Document</div>
              <div class="console-form-group">
                <label class="console-label" for="synthUrlInput">Document URL (PDF, webpage, etc.)</label>
                <input type="url" id="synthUrlInput" class="console-input" placeholder="https://…">
              </div>
              <div class="console-form-group">
                <label class="console-label" for="synthTagsInput">Tags (comma-separated)</label>
                <input type="text" id="synthTagsInput" class="console-input" placeholder="research, frameworks, africa">
              </div>
              <div class="console-actions">
                <button class="btn-console-run btn-secondary-run" id="synthIngestBtn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Ingest
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

  /* ── Nova / Aether / Assistant — generic for now ── */
  function buildNovaPanel   (agent) { return buildGenericPanel(agent); }
  function buildAetherPanel (agent) { return buildGenericPanel(agent); }
  function buildAssistantPanel (agent) { return buildGenericPanel(agent); }

  function buildGenericPanel (agent) {
    return `
      <div class="console-panel" id="console-${esc(agent.id)}">
        <div class="console-panel-inner">
          <div class="console-agent-badge" style="--agent-color:${agent.color}">
            ${agent.icon}
            <span>${agent.name}</span>
            <span class="console-role-tag">${agent.role}</span>
          </div>

          <div class="console-form-group">
            <label class="console-label" for="genericTaskInput-${esc(agent.id)}">Task description</label>
            <textarea id="genericTaskInput-${esc(agent.id)}" class="console-textarea" rows="4"
              placeholder="Describe what you want ${esc(agent.name)} to do…"></textarea>
          </div>

          <div class="console-actions">
            <button class="btn-console-run" data-generic-run="${esc(agent.id)}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Run Task
            </button>
          </div>

          <div class="console-output-area" id="genericOutput-${esc(agent.id)}" style="display:none">
            <div class="console-output-toolbar">
              <span class="console-output-label">Output</span>
              <button class="btn-output-action" data-generic-copy="${esc(agent.id)}">Copy</button>
            </div>
            <div class="console-markdown-output" id="genericMarkdown-${esc(agent.id)}"></div>
          </div>

          <div class="console-task-status" id="genericStatus-${esc(agent.id)}" style="display:none">
            <div class="console-task-spinner"></div>
            <span id="genericStatusMsg-${esc(agent.id)}">Working…</span>
          </div>
        </div>
      </div>`;
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
        renderMarkdown(markdownEl, res.result || JSON.stringify(res, null, 2));
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
            renderMarkdown(markdownEl, task.result || task.output || '(No output)');
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

      runBtn?.addEventListener('click', async () => {
        const goal     = $('nexusGoalInput')?.value?.trim();
        const priority = $('nexusPrioritySelect')?.value || 'normal';
        if (!goal) { alert('Please enter a project goal.'); return; }
        runBtn.disabled = true;
        await runTask('nexus', { action: 'orchestrate', description: goal, priority }, {
          statusEl, statusMsgEl: statusMsg, outputEl, markdownEl,
          onSuccess () { runBtn.disabled = false; },
        });
        runBtn.disabled = false;
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
        const url  = $('synthUrlInput')?.value?.trim();
        const tags = $('synthTagsInput')?.value?.trim();
        if (!url) { alert('Please enter a document URL.'); return; }
        outputLbl.textContent = 'Ingest result';
        await runTask('synthesizer', { action: 'ingest', url, tags: tags ? tags.split(',').map(t => t.trim()) : [] }, {
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

    /* ── Generic agents ── */
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

    /* Refresh — Tasks */
    $('tasksRefreshBtn')?.addEventListener('click', loadTasks);
    $('tasksAgentFilter')?.addEventListener('change', loadTasks);
    $('tasksStatusFilter')?.addEventListener('change', loadTasks);

    /* Refresh — Leads */
    $('leadsRefreshBtn')?.addEventListener('click', loadLeads);
    $('leadsStatusFilter')?.addEventListener('change', loadLeads);

    /* Drawer close */
    $('taskOutputClose')?.addEventListener('click', closeTaskDrawer);
    $('taskOutputOverlay')?.addEventListener('click', closeTaskDrawer);

    /* Auto-load when each sub-tab becomes active.
       Piggyback on the sidebar nav-btn clicks + module-tab clicks. */
    document.querySelectorAll('.nav-btn[data-module]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.module === 'agents') {
          loadNetworkStatus();
          buildConsoleNav();
        }
      });
    });

    document.querySelectorAll('.module-tab[data-subtab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.subtab;
        if (tab === 'agents-network') loadNetworkStatus();
        if (tab === 'agents-tasks')   loadTasks();
        if (tab === 'agents-leads')   loadLeads();
        if (tab === 'agents-console') buildConsoleNav();
      });
    });

    /* Auto-load if agents is the active module on page load */
    if (document.getElementById('module-agents')?.classList.contains('active')) {
      loadNetworkStatus();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
