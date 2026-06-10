/**
 * Persisted author ↔ domain overrides (R2 cache).
 */

import { AUTHOR_PROFILES } from './contentAuthorRegistry.js';

const SETTINGS_KEY = 'cache/content-author-settings.json';

const DEFAULTS = {
  /** domain → authorId */
  domainAuthors: {
    business_development: 'boroji',
    technology:           'boroji',
    digital_media:        'kayode',
  },
  defaultAuthorId: 'digifusion',
  updatedAt:       null,
};

export async function loadContentAuthorSettings() {
  try {
    const { getJsonCache } = await import('../cloudflareR2.js');
    const saved = await getJsonCache(SETTINGS_KEY);
    if (!saved) return { ...DEFAULTS };
    return {
      ...DEFAULTS,
      ...saved,
      domainAuthors: { ...DEFAULTS.domainAuthors, ...(saved.domainAuthors || {}) },
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveContentAuthorSettings(partial = {}) {
  const current = await loadContentAuthorSettings();
  const next = {
    ...current,
    ...partial,
    domainAuthors: {
      ...current.domainAuthors,
      ...(partial.domainAuthors || {}),
    },
    updatedAt: new Date().toISOString(),
  };
  const { putJsonCache } = await import('../cloudflareR2.js');
  await putJsonCache(SETTINGS_KEY, next);
  return next;
}

export function listAuthorProfiles() {
  return Object.values(AUTHOR_PROFILES).map((p) => ({
    id:         p.id,
    headerName: p.headerName,
    byline:     p.byline,
    domains:    p.domains,
  }));
}
