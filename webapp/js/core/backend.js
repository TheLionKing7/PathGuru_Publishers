/**
 * Shared backend URL resolution for all PathGuru webapp modules.
 * Priority: pg_settings.backendUrl → Electron preload → window.location.origin
 */
(function () {
  'use strict';

  function getSettings () {
    try {
      return JSON.parse(localStorage.getItem('pg_settings') || '{}');
    } catch {
      return {};
    }
  }

  function getBackendUrl () {
    const fromSettings = String(getSettings().backendUrl || '').replace(/\/$/, '');
    if (fromSettings) return fromSettings;
    const fromDesktop = window.__PATHGURU_DESKTOP__?.defaultBackendUrl;
    if (fromDesktop) return String(fromDesktop).replace(/\/$/, '');
    return window.location.origin.replace(/\/$/, '');
  }

  function apiUrl (path) {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${getBackendUrl()}${p}`;
  }

  window.PathGuruBackend = { getSettings, getBackendUrl, apiUrl };
})();
