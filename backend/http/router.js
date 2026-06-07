/**
 * Minimal route dispatcher — keeps server.js from growing monolithically.
 * Each department registers handlers; server.js falls through to legacy
 * inline routes until fully migrated.
 */

export function createRouter() {
  const routes = [];

  /**
   * @param {string}   method   HTTP method or '*'
   * @param {string}   path     Exact path or RegExp
   * @param {Function} handler  async (req, res, ctx) => true if handled
   */
  function register(method, path, handler) {
    routes.push({ method: method.toUpperCase(), path, handler });
  }

  async function dispatch(req, res, ctx) {
    const url    = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path   = url.pathname;
    const method = req.method.toUpperCase();

    for (const route of routes) {
      if (route.method !== '*' && route.method !== method) continue;
      const match = typeof route.path === 'string'
        ? route.path === path
        : route.path.test(path);
      if (!match) continue;
      const handled = await route.handler(req, res, { ...ctx, url, path });
      if (handled) return true;
    }
    return false;
  }

  return { register, dispatch };
}
