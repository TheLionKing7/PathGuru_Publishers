/* ─────────────────────────────────────────────
   DigiFusion Command — shell state (tabs, settings)
   Blog, shop, agents modules own their own logic.
───────────────────────────────────────────── */

'use strict';

const MODULE_OF_TAB = {
  blog: 'blog', 'blog-assets': 'blog',
  'shop-products': 'agents', 'shop-services': 'shop', 'shop-payments': 'shop',
  'shop-analytics': 'shop', 'shop-settings': 'shop',
  analytics: 'analytics',
  'agents-command': 'agents', 'agents-workflow': 'agents',
  'agents-activity': 'agents', 'agents-network': 'agents',
  'agents-console': 'agents', 'agents-tasks': 'agents',
  'agents-leads': 'agents', 'agents-ip': 'agents',
  'agents-content': 'agents', 'agents-prompts': 'agents',
  'frictioniq-fiveday': 'frictioniq',
  'frictioniq-engagements': 'frictioniq',
  frictioniq: 'frictioniq',
};

const DEFAULT_TAB_OF_MODULE = {
  blog: 'blog',
  shop: 'shop-services',
  analytics: 'analytics',
  agents: 'agents-command',
  frictioniq: 'frictioniq',
};

function notifyTabChange (tab, mod) {
  document.dispatchEvent(new CustomEvent('pg:tab-change', { detail: { tab, module: mod } }));
}

function setActiveTab (tab, moduleOverride) {
  const mod = moduleOverride || MODULE_OF_TAB[tab] || 'blog';
  _dataDirectSet('activeModule', mod);
  _dataDirectSet('activeTab', tab);
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
  const _data = State._internals();
  _data[key] = value;
}

const State = (() => {
  const _data = {
    activeTab: 'blog',
    activeModule: 'blog',
    settings: loadSettings(),
  };

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

const UI = (() => {
  const $ = id => document.getElementById(id);

  function render (key) {
    switch (key) {
      case 'activeTab':    renderTabs();    break;
      case 'activeModule': renderModules(); break;
      case 'settings':     renderSettings(); break;
    }
  }

  function renderModules () {
    const mod = State.get('activeModule');
    document.querySelectorAll('.module-shell').forEach(s => {
      s.classList.toggle('active', s.dataset.module === mod);
    });
    if (window.PathGuruShell) {
      window.PathGuruShell.updateChrome(State.get('activeTab'), mod);
    }
  }

  function renderTabs () {
    const tab = State.get('activeTab');
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tab}`);
    });
    document.querySelectorAll('.panel-header[data-for]').forEach(h => {
      h.classList.toggle('active', h.dataset.for === tab);
    });
    document.querySelectorAll('.module-tab[data-subtab]').forEach(b => {
      const isActive = b.dataset.subtab === tab;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function renderSettings () {
    const s = State.get('settings') || {};
    const map = {
      backendUrl: s.backendUrl || '',
      cmsToken: s.cmsToken || '',
      brandLogoUrl: s.brandLogoUrl || '',
      brandPrimaryColor: s.brandPrimaryColor || '',
      brandSecondaryColor: s.brandSecondaryColor || '',
      brandFontStack: s.brandFontStack || '',
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = $(id);
      if (el) el.value = val;
    });
    const display = $('backendUrlDisplay');
    if (display && map.backendUrl) display.textContent = map.backendUrl;
  }

  return { render };
})();

function toast (msg, type = 'info') {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-dot"></div><span>${String(msg).replace(/</g, '&lt;')}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

function getBackendUrl () {
  return window.PathGuruBackend?.getBackendUrl?.() || window.location.origin.replace(/\/$/, '');
}

/* Twilio WhatsApp notification health — reports presence + a live probe,
   never any secret values. Surfaced in the Settings modal. */
async function loadNotificationsHealth () {
  const el = document.getElementById('notificationsHealth');
  if (!el) return;
  el.innerHTML = '<span class="settings-health-loading">Checking…</span>';
  try {
    const res = await fetch(`${getBackendUrl()}/api/health/notifications`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const cfg = data.configured || {};
    const rows = [
      ['TWILIO_ACCOUNT_SID', cfg.TWILIO_ACCOUNT_SID],
      ['TWILIO_AUTH_TOKEN', cfg.TWILIO_AUTH_TOKEN],
      ['TWILIO_WHATSAPP_FROM', cfg.TWILIO_WHATSAPP_FROM],
      ['WHATSAPP_TO', cfg.WHATSAPP_TO],
    ];
    const badge = ok => ok
      ? '<span class="settings-health-ok">set</span>'
      : '<span class="settings-health-missing">missing</span>';

    const tw = data.twilioMessagesList || {};
    const last = tw.lastMessage
      ? `${tw.lastMessage.status || 'unknown'}${tw.lastMessage.errorCode ? ` · error_code ${tw.lastMessage.errorCode}` : ''}`
      : '—';
    const probe = tw.attempted
      ? `HTTP ${tw.httpStatus ?? '—'}${last !== '—' ? ` · last message: ${last}` : ''}${tw.error ? ` · ${tw.error}` : ''}`
      : (tw.error ? tw.error : 'not run');

    el.innerHTML = `
      <ul class="settings-health-list">
        ${rows.map(([k, ok]) => `<li><span class="settings-health-key">${k}</span>${badge(ok)}</li>`).join('')}
        <li><span class="settings-health-key">FROM has whatsapp: prefix</span>${badge(!!data.fromStartsWithWhatsapp)}</li>
      </ul>
      <div class="settings-health-probe">
        <span class="settings-health-key">Twilio Messages list probe</span>
        <span>${String(probe).replace(/</g, '&lt;')}</span>
      </div>`;
  } catch (e) {
    el.innerHTML = `<span class="settings-health-error">${String(e.message).replace(/</g, '&lt;')}</span>`;
  }
}

window.__pgSetTab = setActiveTab;
window.PathGuruState = State;
window.PathGuruUI = UI;
window.pgToast = toast;

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.module-tab[data-subtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.subtab;
      const mod = MODULE_OF_TAB[tab];
      if (tab && mod) setActiveTab(tab, mod);
    });
  });

  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    document.getElementById('settingsModal').style.display = 'flex';
    UI.render('settings');
    loadNotificationsHealth();
  });
  document.getElementById('closeSettings')?.addEventListener('click', () => {
    document.getElementById('settingsModal').style.display = 'none';
  });
  document.getElementById('cancelSettings')?.addEventListener('click', () => {
    document.getElementById('settingsModal').style.display = 'none';
  });
  document.getElementById('saveSettings')?.addEventListener('click', () => {
    const fields = ['backendUrl', 'cmsToken', 'brandLogoUrl', 'brandPrimaryColor', 'brandSecondaryColor', 'brandFontStack'];
    const updated = {};
    fields.forEach(f => { updated[f] = document.getElementById(f)?.value?.trim() || ''; });
    State.patch('settings', updated);
    State.saveSettings();
    document.getElementById('settingsModal').style.display = 'none';
    UI.render('settings');
    toast('Settings saved', 'success');
  });
  document.getElementById('settingsModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  UI.render('settings');
  UI.render('activeModule');
  UI.render('activeTab');
  if (window.PathGuruShell) {
    const productId = window.PathGuruProducts?.getStoredProductId?.();
    if (productId) window.PathGuruShell.applyProductFilter(productId);
    window.PathGuruShell.updateChrome(State.get('activeTab'), State.get('activeModule'));
  }
});
