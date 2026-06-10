/**
 * PathGuru Department Shell
 * =========================
 * Single registry for all "offices" — each department maps to an existing
 * module shell but owns its own default tab and breadcrumb label.
 */
(function () {
  'use strict';

  const DEPARTMENTS = {
    blogroom: {
      id:           'blogroom',
      label:        'Blog Room',
      tagline:      'CMS & posts',
      module:       'blog',
      defaultTab:   'blog',
      sections: {
        blog:         'Compose',
        'blog-assets': 'Assets',
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
      },
    },
    products: {
      id:           'products',
      label:        'Products & Tools',
      tagline:      'Firm SaaS, tools & catalog',
      module:       'shop',
      defaultTab:   'shop-products',
      sections: {
        'shop-products':    'Product Catalog',
        'shop-services':    'Consulting & Bookings',
        'shop-payments':    'Revenue & Payments',
        'shop-analytics':   'Revenue Analytics',
        'shop-settings':    'Commerce Settings',
      },
    },
    network: {
      id:           'network',
      label:        'Agent Network',
      tagline:      'Operations & coordination',
      module:       'agents',
      defaultTab:   'agents-command',
      sections: {
        'agents-command':  'Nexus Command Center',
        'agents-workflow': 'Team Workflow',
        'agents-activity': 'Activity Journal',
        'agents-network':  'Agent Roster',
        'agents-console':  'Agent Console',
        'agents-tasks':    'Task History',
        'agents-leads':    'Lead Pipeline',
      },
    },
    analytics: {
      id:           'analytics',
      label:        'Analytics',
      tagline:      'DigiFusion visitor footprint',
      module:       'analytics',
      defaultTab:   'analytics',
      sections: {
        analytics: 'Site Analytics',
      },
    },
  };

  DEPARTMENTS.storefront = DEPARTMENTS.products;

  const INTELLIGENCE_TABS = new Set([
    'agents-ip', 'agents-content',
  ]);

  const BLOGROOM_TABS = new Set(['blog', 'blog-assets']);
  const BLOG_MODULE_TABS = BLOGROOM_TABS;

  const NETWORK_TABS = new Set([
    'agents-command', 'agents-workflow', 'agents-activity',
    'agents-network', 'agents-console', 'agents-tasks', 'agents-leads',
  ]);

  const TAB_TO_DEPT = {};
  Object.values(DEPARTMENTS).forEach(dept => {
    Object.keys(dept.sections).forEach(tab => {
      TAB_TO_DEPT[tab] = dept.id;
    });
  });
  INTELLIGENCE_TABS.forEach(tab => { TAB_TO_DEPT[tab] = 'intelligence'; });
  NETWORK_TABS.forEach(tab => { TAB_TO_DEPT[tab] = 'network'; });

  function deptForTab(tab) {
    return DEPARTMENTS[TAB_TO_DEPT[tab] || 'blogroom'];
  }

  function moduleForTab(tab, dept) {
    if (BLOGROOM_TABS.has(tab)) return 'blog';
    const d = dept || deptForTab(tab);
    return d?.module || 'blog';
  }

  function deptForModule(module, activeTab) {
    if (module === 'blog') return DEPARTMENTS.blogroom;
    if (module === 'agents' && activeTab && INTELLIGENCE_TABS.has(activeTab)) {
      return DEPARTMENTS.intelligence;
    }
    if (module === 'agents' && activeTab && NETWORK_TABS.has(activeTab)) {
      return DEPARTMENTS.network;
    }
    if (module === 'agents') return DEPARTMENTS.network;
    return Object.values(DEPARTMENTS).find(d => d.module === module) || DEPARTMENTS.intelligence;
  }

  function sectionLabel(dept, tab) {
    return dept.sections[tab] || tab;
  }

  function placeDeptRouteNav(activeModule, show) {
    const nav = document.getElementById('deptRouteNav');
    if (!nav) return;
    const routeHome = document.querySelector('.main-panel');

    if (!show) {
      if (routeHome && nav.parentElement !== routeHome) {
        routeHome.insertBefore(nav, routeHome.firstChild);
      }
      return;
    }

    const moduleEl = document.getElementById(`module-${activeModule}`);
    if (!moduleEl) return;

    const topnav = moduleEl.querySelector('.module-topnav');
    const headers = moduleEl.querySelector('.module-headers');
    if (topnav) {
      moduleEl.insertBefore(nav, topnav);
    } else if (headers) {
      headers.insertAdjacentElement('afterend', nav);
    }
  }

  function syncDeptRouteNav(dept, activeTab, activeModule) {
    const nav = document.getElementById('deptRouteNav');
    if (!nav) return;
    const show = dept.id === 'intelligence';
    nav.hidden = !show;
    nav.classList.toggle('is-visible', show);
    placeDeptRouteNav(activeModule, show);
    if (!show) return;
    nav.querySelectorAll('[data-dept-tab]').forEach(btn => {
      const match = btn.dataset.deptTab === activeTab
        || (btn.dataset.deptTab === 'blog' && activeTab === 'blog-assets');
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
    });
  }

  function updateChrome(activeTab, activeModule) {
    const dept    = deptForModule(activeModule, activeTab);
    const section = sectionLabel(dept, activeTab);

    const deptEl    = document.getElementById('chromeDept');
    const sectionEl = document.getElementById('chromeSection');
    if (deptEl)    deptEl.textContent    = dept.label;
    if (sectionEl) sectionEl.textContent = section;

    document.body.classList.remove('pg-dept-blogroom', 'pg-dept-network', 'pg-dept-intelligence', 'pg-dept-products', 'pg-dept-analytics');
    if (dept.id === 'blogroom')     document.body.classList.add('pg-dept-blogroom');
    if (dept.id === 'network')      document.body.classList.add('pg-dept-network');
    if (dept.id === 'intelligence') document.body.classList.add('pg-dept-intelligence');
    if (dept.id === 'products')     document.body.classList.add('pg-dept-products');
    if (dept.id === 'analytics')    document.body.classList.add('pg-dept-analytics');

    syncDeptRouteNav(dept, activeTab, activeModule);

    document.querySelectorAll('.nav-btn[data-dept]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.dept === dept.id);
    });
  }

  function navigateToDepartment(deptId, tabOverride) {
    const dept = DEPARTMENTS[deptId];
    if (!dept) return;
    if (window.PathGuruProducts && !window.PathGuruProducts.isDeptVisible(deptId)) return;
    const tab    = tabOverride || dept.defaultTab;
    const module = moduleForTab(tab, dept);
    if (typeof window.__pgSetTab === 'function') {
      window.__pgSetTab(tab, module);
    }
  }

  function applyProductFilter(productId) {
    const product = window.PathGuruProducts?.PRODUCTS?.[productId];
    document.querySelectorAll('.nav-btn[data-dept]').forEach(btn => {
      if (!product) {
        btn.style.display = '';
        return;
      }
      const visible = product.departments.includes(btn.dataset.dept);
      btn.style.display = visible ? '' : 'none';
    });
  }

  window.PathGuruShell = {
    DEPARTMENTS,
    INTELLIGENCE_TABS,
    NETWORK_TABS,
    BLOG_MODULE_TABS,
    deptForTab,
    deptForModule,
    moduleForTab,
    updateChrome,
    navigateToDepartment,
    applyProductFilter,
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('pg-shell-v3');

    document.querySelectorAll('.nav-btn[data-dept]').forEach(btn => {
      btn.addEventListener('click', () => {
        const deptId = btn.dataset.dept;
        if (window.PathGuruProducts && !window.PathGuruProducts.isDeptVisible(deptId)) return;
        const dept   = DEPARTMENTS[deptId];
        if (!dept) return;
        const remembered = localStorage.getItem(`pg_lastTab_${deptId}`);
        const tab = remembered && dept.sections[remembered] ? remembered : dept.defaultTab;
        const module = moduleForTab(tab, dept);
        if (typeof window.__pgSetTab === 'function') {
          window.__pgSetTab(tab, module);
        }
      });
    });

    document.querySelectorAll('[data-goto-dept]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        navigateToDepartment(el.dataset.gotoDept, el.dataset.gotoTab || null);
      });
    });

    document.querySelectorAll('#deptRouteNav [data-dept-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigateToDepartment('intelligence', btn.dataset.deptTab);
      });
    });
  });
})();
