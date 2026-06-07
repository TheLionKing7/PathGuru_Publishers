/**
 * Health & status routes — Publisher department infrastructure.
 */

import { json } from '../http/helpers.js';

export function registerHealthRoutes(router) {
  router.register('GET', '/health', async (_req, res) => {
    json(res, { ok: true, service: 'pathguru-publishers', version: '3.0' });
    return true;
  });
}
