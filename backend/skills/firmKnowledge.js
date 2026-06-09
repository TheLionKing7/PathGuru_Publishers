/**
 * DigiFusion — Unified Firm Knowledge (single source for agents + API)
 *
 * All agents, Aria, Synthesizer probes, and HTTP routes read firm IP from here.
 * Registry definitions live in firmFrameworks.js; R2 manifest enriches at runtime.
 */

import {
  FIRM_IP_FRAMEWORKS,
  FIRM_IP_BLUEPRINTS,
  FRAMEWORK_IDS,
  getFrameworkById,
  getFrameworksForAgent,
  buildFrameworksListBlock,
  buildAriaFrameworkContext,
  frameworkNamesLine,
  ENGAGEMENT_MODEL_DOCTRINE,
  refreshPromotedFrameworks,
} from './firmFrameworks.js';

export {
  FIRM_IP_FRAMEWORKS,
  FIRM_IP_BLUEPRINTS,
  FRAMEWORK_IDS,
  getFrameworkById,
  getFrameworksForAgent,
  buildFrameworksListBlock,
  buildAriaFrameworkContext,
  frameworkNamesLine,
  ENGAGEMENT_MODEL_DOCTRINE,
  refreshPromotedFrameworks,
};

// Warm promoted-framework cache after startup (non-blocking — avoids slow cold boot on Render)
setTimeout(() => refreshPromotedFrameworks().catch(() => {}), 3000);

/** Internal agent-DNA documents (Synthesizer + agents, not sold standalone) */
export function getOperatingFrameworks() {
  return FIRM_IP_FRAMEWORKS.filter(f => f.kind !== 'library_product');
}

/** Paywalled Intelligence Library documents (McKinsey/BCG-style gated PDFs) */
export function getIntelligenceLibraryProducts() {
  const libraryFromFrameworks = FIRM_IP_FRAMEWORKS.filter(f => f.kind === 'library_product' || f.access === 'purchasable');
  return [...libraryFromFrameworks, ...FIRM_IP_BLUEPRINTS.map(bp => ({
    ...bp,
    kind:     'library_product',
    access:   'purchasable',
    category: 'blueprints',
  }))];
}

/**
 * Full catalog for GET /api/firm-ip/library
 * @param {object[]} [r2Manifest] — optional live entries from firm_ip/_manifest.json
 */
export function buildFirmIpLibraryCatalog(r2Manifest = []) {
  const bySlug = new Map(r2Manifest.map(e => [e.slug, e]));

  const operating = getOperatingFrameworks().map(f => ({
    ...f,
    layer:      'operating_framework',
    access:     f.access || 'internal',
    r2:         bySlug.get(f.kbSlug) || (f.r2Key ? { key: f.r2Key } : null),
  }));

  const library = getIntelligenceLibraryProducts().map(p => {
    const slug = p.kbSlug || p.id?.replace(/-v3$/, '') + '-blueprint-v3';
    const reg  = FIRM_IP_FRAMEWORKS.find(f => f.kbSlug === p.kbSlug) || p;
    return {
      id:          p.id || reg.id,
      name:        p.name || reg.name,
      slug:        p.kbSlug || reg.kbSlug,
      layer:       'intelligence_library',
      access:      'purchasable',
      category:    'blueprints',
      description: reg.oneLiner || p.description || '',
      r2:          bySlug.get(p.kbSlug || reg.kbSlug) || (reg.r2Key ? { key: reg.r2Key } : null),
    };
  });

  // Deduplicate library by slug
  const seen = new Set();
  const libraryUnique = library.filter(item => {
    const k = item.slug;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    source:    'firmKnowledge.js',
    operating,
    library:   libraryUnique,
    total:     operating.length + libraryUnique.length,
    knowledgeFlow: {
      registry:  'backend/skills/firmFrameworks.js',
      storage:   'R2 firm_ip/ + Supabase knowledge_base',
      query:     'POST /api/agents/synthesizer/query',
      probe:     'GET /api/agents/synthesizer/frameworks',
      catalog:   'GET /api/firm-ip/library',
    },
  };
}

/** Seed Engagement Model into knowledge_base (no PDF — sourced from methodology doctrine) */
export async function seedEngagementModelKnowledge(db) {
  if (!db) return { skipped: true };
  const sourceKey = 'firm_ip/frameworks/digifusion-engagement-model';
  const { data: existing } = await db.from('knowledge_base')
    .select('id')
    .eq('source_key', sourceKey)
    .limit(1);
  if (existing?.length) return { skipped: true, reason: 'exists' };

  const { error } = await db.from('knowledge_base').insert({
    title:           'DigiFusion Engagement Model',
    domain:          'general',
    source_type:     'framework',
    source_key:      sourceKey,
    source_name:     'digifusion-engagement-model',
    content:         ENGAGEMENT_MODEL_DOCTRINE,
    frameworks:      ['DigiFusion Engagement Model', 'Discovery Audit', 'Gap Analysis', 'Solution Design', 'Build Deploy Measure'],
    tags:            ['firm_ip', 'framework', 'proprietary', 'engagement-model'],
    metadata:        { slug: 'digifusion-engagement-model', kind: 'operating_framework' },
    relevance_score: 5,
    processed_by:    'firmKnowledge',
  });
  if (error) return { error: error.message };
  return { seeded: true, sourceKey };
}
