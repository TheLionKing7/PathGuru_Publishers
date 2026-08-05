/**
 * Shared backend URL resolution and the single fetch path for all PathGuru
 * webapp modules.
 *
 * Priority: pg_settings.backendUrl → Electron preload → window.location.origin
 *
 * ── THE BUG THAT LIVED HERE ───────────────────────────────────────────────
 *
 * `apiUrl('')` used to return `${base}/` — because the empty string does not
 * start with a slash, so one was prepended. Callers then wrote
 * `apiUrl('') + '/api/frictioniq/sessions'` and produced a DOUBLE SLASH:
 *
 *     http://localhost:8787//api/frictioniq/sessions
 *
 * The browser sends `//api/frictioniq/sessions`, and `//…` is a
 * protocol-relative URL — so the server's `new URL(req.url, base)` resolved the
 * host to `api` and the path to `/frictioniq/sessions`. No route matched. Every
 * request 404'd before it reached the database, and the FrictionIQ console sat
 * on its loading spinner.
 *
 * Two fixes, because one was not enough: an empty path now yields the bare base
 * with no trailing slash, and any doubled slash is collapsed on the way out.
 * The server normalises as well. A silent 404 caused by punctuation costs an
 * afternoon and teaches nothing.
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
    const fromSettings = String(getSettings().backendUrl || '').replace(/\/+$/, '');
    if (fromSettings) return fromSettings;
    const fromDesktop = window.__PATHGURU_DESKTOP__?.defaultBackendUrl;
    if (fromDesktop) return String(fromDesktop).replace(/\/+$/, '');
    return window.location.origin.replace(/\/+$/, '');
  }

  /**
   * Build an absolute API URL. An empty or '/' path returns the bare base with
   * no trailing slash, so concatenation by a caller cannot double up.
   */
  function apiUrl (path) {
    const base = getBackendUrl();
    const p = String(path ?? '');
    if (!p || p === '/') return base;
    const joined = `${base}${p.startsWith('/') ? '' : '/'}${p}`;
    // Collapse doubled slashes everywhere except after the scheme's colon.
    return joined.replace(/([^:])\/{2,}/g, '$1/');
  }

  /**
   * The one fetch path. Modules should use this rather than calling fetch
   * directly, for three reasons that each cost a debugging session to learn:
   *
   *   CREDENTIALS. The operator session is an httpOnly cookie. A cross-origin
   *   call — the desktop shell, or a console pointed at Render — drops it
   *   silently without this.
   *
   *   401 IS A UI EVENT, NOT AN ERROR. An expired session should raise the
   *   login overlay, not print "failed to load" and leave the operator
   *   guessing which of six things broke.
   *
   *   A DEADLINE, ALWAYS. A request with no timeout is how a spinner becomes
   *   permanent.
   */
  async function apiFetch (path, options = {}) {
    const { timeoutMs = 15000, ...init } = options;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(apiUrl(path), {
        credentials: 'include',
        ...init,
        signal: ctrl.signal,
        headers: { Accept: 'application/json', ...(init.headers || {}) },
      });

      let payload = null;
      try { payload = await res.clone().json(); } catch { /* not json */ }

      if (res.status === 401 || res.status === 503) {
        document.dispatchEvent(new CustomEvent('pg:unauthorized', {
          detail: { status: res.status, error: payload?.error || '' },
        }));
      }

      if (!res.ok) {
        const e = new Error(payload?.error || `HTTP ${res.status}`);
        e.status = res.status;
        throw e;
      }

      return payload;
    } catch (e) {
      if (e.name === 'AbortError') {
        const t = new Error(`Timed out after ${timeoutMs / 1000}s`);
        t.status = 0;
        throw t;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  function postJson (path, body, options = {}) {
    return apiFetch(path, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: JSON.stringify(body ?? {}),
    });
  }

  window.PathGuruBackend = { getSettings, getBackendUrl, apiUrl, apiFetch, postJson };
})();
