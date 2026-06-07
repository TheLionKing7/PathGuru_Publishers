/**
 * PathGuru Department Shell
 * =========================
 * Single registry for all "offices" — each department maps to an existing
 * module shell but owns its own default tab and breadcrumb label.
 *
 * Publisher is the original core (KDP-ready PDF from Vektor prompts).
 * Other departments were added later and must not feel monolithic.
 */
(function () {
  'use strict';

  const DEPARTMENTS = {
    publisher: {
      id:           'publisher',
      label:        'Publisher',
      tagline:      'KDP-ready books & ebooks',
      module:       'publishing',
      defaultTab:   'brief',
      sections: {
        brief:   'Brief & Research',
        assets:  'Project Assets',
        compile: 'Compile & Export',
      },
    },
    intelligence: {
      id:           'intelligence',
      label:        'Intelligence Library',
      tagline:      'Gated firm IP & blueprints',
      module:       'agents',
      defaultTab:   'agents-ip',
      sections: {
        'agents-ip':      'Blueprint Library',
        'agents-content': 'Content Schedule',
        blog:             'Blog Derivatives',
        'blog-assets':    'Derivative Assets',
      },
    },
    products: {
      id:           'products',
      label:        'Products & Tools',
      tagline:      'Tools, SaaS & templates',
      module:       'shop',
      defaultTab:   'shop-products',
      sections: {
        'shop-products':    'Products',
        'shop-services':    'Services',
        'shop-payments':    'Orders & Payments',
        'shop-analytics':   'Revenue',
        'shop-settings':    'Settings',
      },
    },
    network: {
      id:           'network',
      label:        'Agent Network',
      tagline:      'Operations & coordination',
      module:       'agents',
      defaultTab:   'agents-network',
      sections: {
        'agents-network': 'Agent Roster',
        'agents-console': 'Agent Console',
        'agents-tasks':   'Task History',
        'agents-leads':   'Lead Pipeline',
      },
    },
    analytics: {
      id:           'analytics',
      label:        'Analytics',
      tagline:      'Site performance',
      module:       'analytics',
      defaultTab:   'analytics',
      sections: {
        analytics: 'Visitor Footprint',
      },
    },
  };

  // Backward compat: old sidebar dept id
  DEPARTMENTS.storefront = DEPARTMENTS.products;

  /** Tabs that belong to Intelligence Library (not Network) */
  const INTELLIGENCE_TABS = new Set([
    'agents-ip', 'agents-content', 'blog', 'blog-assets',
  ]);

  /** Intelligence tabs that live in the blog module shell */
  const BLOG_MODULE_TABS = new Set(['blog', 'blog-assets']);

  /** Map any sub-tab → department id */
  const TAB_TO_DEPT = {};
  Object.values(DEPARTMENTS).forEach(dept => {
    Object.keys(dept.sections).forEach(tab => {
      TAB_TO_DEPT[tab] = dept.id;
    });
  });
  // Intelligence tabs override agents module default
  INTELLIGENCE_TABS.forEach(tab => { TAB_TO_DEPT[tab] = 'intelligence'; });

  function deptForTab(tab) {
    return DEPARTMENTS[TAB_TO_DEPT[tab] || 'publisher'];
  }

  function deptForModule(module, activeTab) {
    if (module === 'agents' && activeTab && INTELLIGENCE_TABS.has(activeTab)) {
      return DEPARTMENTS.intelligence;
    }
    if (module === 'blog') return DEPARTMENTS.intelligence;
    return Object.values(DEPARTMENTS).find(d => d.module === module) || DEPARTMENTS.publisher;
  }

  function sectionLabel(dept, tab) {
    return dept.sections[tab] || tab;
  }

  function updateChrome(activeTab, activeModule) {
    const dept    = deptForModule(activeModule, activeTab);
    const section = sectionLabel(dept, activeTab);

    const deptEl    = document.getElementById('chromeDept');
    const sectionEl = document.getElementById('chromeSection');
    if (deptEl)    deptEl.textContent    = dept.label;
    if (sectionEl) sectionEl.textContent = section;

    // Body class drives which agent sub-tabs are visible
    document.body.classList.remove('pg-dept-network', 'pg-dept-intelligence');
    if (dept.id === 'network')     document.body.classList.add('pg-dept-network');
    if (dept.id === 'intelligence') document.body.classList.add('pg-dept-intelligence');

    // Highlight correct sidebar button (two departments share `agents` module)
    document.querySelectorAll('.nav-btn[data-dept]').forEach(btn => {
      const btnDept = btn.dataset.dept;
      let active = btnDept === dept.id;
      if (activeModule === 'agents' && !INTELLIGENCE_TABS.has(activeTab)) {
        active = btnDept === 'network';
      }
      if (activeModule === 'blog') {
        active = btnDept === 'intelligence';
      }
      btn.classList.toggle('active', active);
    });
  }

  function navigateToDepartment(deptId, tabOverride) {
    const dept = DEPARTMENTS[deptId];
    if (!dept) return;
    const tab    = tabOverride || dept.defaultTab;
    const module = BLOG_MODULE_TABS.has(tab) ? 'blog' : dept.module;
    if (typeof window.__pgSetTab === 'function') {
      window.__pgSetTab(tab, module);
    }
  }

  // Expose globally for cross-department links
  window.PathGuruShell = {
    DEPARTMENTS,
    INTELLIGENCE_TABS,
    deptForTab,
    deptForModule,
    updateChrome,
    navigateToDepartment,
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('pg-shell-v3');

    // Department nav buttons
    document.querySelectorAll('.nav-btn[data-dept]').forEach(btn => {
      btn.addEventListener('click', () => {
        const deptId = btn.dataset.dept;
        const dept   = DEPARTMENTS[deptId];
        if (!dept) return;
        const remembered = localStorage.getItem(`pg_lastTab_${deptId}`);
        const tab = remembered && dept.sections[remembered] ? remembered : dept.defaultTab;
        if (typeof window.__pgSetTab === 'function') {
          window.__pgSetTab(tab, dept.module);
        }
      });
    });

    // Cross-department links
    document.querySelectorAll('[data-goto-dept]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        navigateToDepartment(el.dataset.gotoDept, el.dataset.gotoTab || null);
      });
    });

    // Intelligence → Blog Derivatives (separate module shell)
    const derivBtn = document.getElementById('gotoBlogDerivativesTab');
    if (derivBtn) {
      derivBtn.addEventListener('click', e => {
        e.preventDefault();
        navigateToDepartment('intelligence', 'blog');
      });
    }
  });
})();
