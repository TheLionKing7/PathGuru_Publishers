/**
 * Product launcher — DigiFusion Command.
 * Shares backend URL + resources via pg_settings.
 */
(function () {
  'use strict';

  const {
    PRODUCTS, setStoredProductId, getStoredProductId, parseProductFromUrl,
    applyPlatformConfig, isProductEnabled, getDefaultProductId, getEnabledProductIds,
  } = window.PathGuruProducts;

  function isDesktopApp() {
    return !!window.__PATHGURU_DESKTOP__?.isDesktop;
  }

  function resolveBackendBase() {
    if (isDesktopApp() && window.__PATHGURU_DESKTOP__?.defaultBackendUrl) {
      return String(window.__PATHGURU_DESKTOP__.defaultBackendUrl).replace(/\/$/, '');
    }
    return window.PathGuruBackend?.getBackendUrl?.() || window.location.origin.replace(/\/$/, '');
  }

  function mergeBackendUrl(url) {
    if (!url) return;
    try {
      const settings = JSON.parse(localStorage.getItem('pg_settings') || '{}');
      if (!settings.backendUrl) {
        settings.backendUrl = url;
        localStorage.setItem('pg_settings', JSON.stringify(settings));
      }
    } catch { /* ignore */ }
  }

  async function fetchPlatformConfig() {
    const base = resolveBackendBase();
    try {
      const res = await fetch(`${base}/api/platform/config`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('[Launcher] platform config fetch failed:', e.message);
      return null;
    }
  }

  function applyProductBodyClass(productId) {
    document.body.classList.remove('pg-product-digifusion', 'pg-product-full');
    if (productId) document.body.classList.add(`pg-product-${productId}`);
  }

  function hideLauncher() {
    const el = document.getElementById('productLauncher');
    if (el) el.hidden = true;
    document.documentElement.classList.remove('pg-launcher-active');
  }

  function showLauncher() {
    const el = document.getElementById('productLauncher');
    if (el) el.hidden = false;
    document.documentElement.classList.add('pg-launcher-active');
  }

  function scheduleDeptNavigation(product) {
    const attempt = () => {
      if (window.PathGuruShell && typeof window.__pgSetTab === 'function') {
        window.PathGuruShell.applyProductFilter(product.id);
        window.PathGuruShell.navigateToDepartment(product.defaultDept, product.defaultTab);
        return;
      }
      setTimeout(attempt, 16);
    };
    attempt();
  }

  function applyLauncherVisibility() {
    const enabled = new Set(getEnabledProductIds());
    document.querySelectorAll('[data-product-id]').forEach((btn) => {
      const on = enabled.has(btn.dataset.productId);
      btn.hidden = !on;
      btn.disabled = !on;
    });
    const fullBtn = document.getElementById('productFullSuiteBtn');
    if (fullBtn) fullBtn.hidden = !enabled.has('full');
  }

  function navigateToProduct(productId) {
    if (!isProductEnabled(productId)) {
      productId = getDefaultProductId();
    }
    const product = PRODUCTS[productId];
    if (!product) return;

    setStoredProductId(productId);
    applyProductBodyClass(productId);
    hideLauncher();
    scheduleDeptNavigation(product);

    document.dispatchEvent(new CustomEvent('pg:product-ready', {
      detail: { productId, product },
    }));
  }

  function bindLauncherUi() {
    document.querySelectorAll('[data-product-id]').forEach((btn) => {
      btn.addEventListener('click', () => navigateToProduct(btn.dataset.productId));
    });

    const fullBtn = document.getElementById('productFullSuiteBtn');
    if (fullBtn) {
      fullBtn.addEventListener('click', () => navigateToProduct('full'));
    }
  }

  async function init() {
    bindLauncherUi();

    if (isDesktopApp()) {
      document.documentElement.classList.add('pg-desktop');
      document.body.classList.add('pg-desktop');
      mergeBackendUrl(window.__PATHGURU_DESKTOP__.defaultBackendUrl);
      const backendEl = document.getElementById('backendUrlDisplay');
      if (backendEl) backendEl.textContent = window.__PATHGURU_DESKTOP__.defaultBackendUrl;
    } else {
      document.documentElement.classList.add('pg-launcher-active');
    }

    const config = await fetchPlatformConfig();
    if (config) applyPlatformConfig(config);
    applyLauncherVisibility();

    const statusEl = document.getElementById('launcherBackendStatus');
    if (config?.defaultBackendUrl) {
      mergeBackendUrl(config.defaultBackendUrl);
      if (statusEl) {
        statusEl.textContent = `Shared backend: ${config.defaultBackendUrl}`;
        statusEl.className = 'pg-launcher-status ok';
      }
      const backendEl = document.getElementById('backendUrlDisplay');
      if (backendEl && !backendEl.textContent?.includes('http')) {
        backendEl.textContent = config.defaultBackendUrl;
      }
    } else if (statusEl) {
      statusEl.textContent = 'Cloud backend — configure URL in Settings if needed';
      statusEl.className = 'pg-launcher-status';
    }

    const urlProduct = parseProductFromUrl();
    const switchMode = new URLSearchParams(window.location.search).get('switch') === '1';
    const stored = getStoredProductId();
    const enabled = getEnabledProductIds();
    const soleProduct = enabled.length === 1 ? enabled[0] : null;

    if (isDesktopApp() && window.__PATHGURU_DESKTOP__?.skipLauncher && !switchMode) {
      const desktopProduct = window.__PATHGURU_DESKTOP__.defaultProduct || 'digifusion';
      const productId = isProductEnabled(desktopProduct) ? desktopProduct : getDefaultProductId();
      navigateToProduct(productId);
      return;
    }

    if (soleProduct && !switchMode) {
      navigateToProduct(soleProduct);
    } else if (urlProduct && isProductEnabled(urlProduct) && !switchMode) {
      navigateToProduct(urlProduct);
    } else if (stored && isProductEnabled(stored) && !switchMode) {
      navigateToProduct(stored);
    } else if (!switchMode && isProductEnabled('digifusion')) {
      navigateToProduct(getDefaultProductId());
    } else {
      showLauncher();
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  window.PathGuruLauncher = {
    navigateToProduct,
    showLauncher,
    hideLauncher,
  };
})();
