/**
 * Client-side product profiles — mirrors backend/skills/productRegistry.js
 */
(function () {
  'use strict';

  const PRODUCTS = {
    blogroom: {
      id: 'blogroom',
      name: 'Blog Room',
      shortName: 'Blog Room',
      tagline: 'CMS & posts',
      departments: ['blogroom'],
      defaultDept: 'blogroom',
      defaultTab: 'blog',
      accent: '#c9a84c',
    },
    digifusion: {
      id: 'digifusion',
      name: 'GuruCMS',
      shortName: 'GuruCMS',
      tagline: 'Agentic Intelligence Command Center',
      departments: ['blogroom', 'intelligence', 'products', 'network', 'analytics'],
      defaultDept: 'blogroom',
      defaultTab: 'blog',
      accent: '#2bb3a3',
    },
    full: {
      id: 'full',
      name: 'Full Command',
      shortName: 'Full',
      tagline: 'All Command departments',
      departments: ['blogroom', 'intelligence', 'products', 'network', 'analytics'],
      defaultDept: 'blogroom',
      defaultTab: 'blog',
      accent: '#7c5cfc',
    },
  };

  const STORAGE_KEY = 'pg_product';

  function getStoredProductId() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function setStoredProductId(id) {
    localStorage.setItem(STORAGE_KEY, id);
  }

  let platformConfig = null;

  function applyPlatformConfig(config) {
    platformConfig = config || null;
    if (!config?.products?.length) return;
    for (const p of config.products) {
      if (PRODUCTS[p.id]) {
        Object.assign(PRODUCTS[p.id], {
          departments: p.departments || PRODUCTS[p.id].departments,
          defaultDept: p.defaultDept || PRODUCTS[p.id].defaultDept,
          defaultTab:  p.defaultTab  || PRODUCTS[p.id].defaultTab,
          tagline:     p.tagline     || PRODUCTS[p.id].tagline,
        });
      }
    }
    if (!config.publisherEnabled && PRODUCTS.full) {
      PRODUCTS.full.departments = PRODUCTS.digifusion.departments;
      PRODUCTS.full.tagline = 'All Command departments';
    }
  }

  function getEnabledProductIds() {
    if (platformConfig?.products?.length) {
      return platformConfig.products.map((p) => p.id);
    }
    return ['digifusion', 'full'];
  }

  function isProductEnabled(id) {
    return getEnabledProductIds().includes(id);
  }

  function getDefaultProductId() {
    const def = platformConfig?.defaultProduct;
    if (def && isProductEnabled(def)) return def;
    if (isProductEnabled('digifusion')) return 'digifusion';
    return getEnabledProductIds()[0] || 'digifusion';
  }

  function getActiveProduct() {
    const id = getStoredProductId();
    if (id && isProductEnabled(id)) return PRODUCTS[id] || null;
    return null;
  }

  function isDeptVisible(deptId) {
    if (deptId === 'publisher') return false;
    const product = getActiveProduct();
    if (!product) return deptId !== 'publisher';
    return product.departments.includes(deptId);
  }

  function parseProductFromUrl() {
    try {
      const p = new URLSearchParams(window.location.search).get('product');
      if (p && PRODUCTS[p]) return p;
    } catch { /* ignore */ }
    return null;
  }

  window.PathGuruProducts = {
    PRODUCTS,
    STORAGE_KEY,
    getStoredProductId,
    setStoredProductId,
    getActiveProduct,
    isDeptVisible,
    parseProductFromUrl,
    applyPlatformConfig,
    getEnabledProductIds,
    isProductEnabled,
    getDefaultProductId,
    getPlatformConfig: () => platformConfig,
  };
})();
