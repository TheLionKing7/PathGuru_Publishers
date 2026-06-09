/**
 * IP Factory — synthesize external resources into original DigiFusion frameworks,
 * store in agency IP, optionally promote into agent operating DNA.
 */

import { getFrameworkById } from './firmFrameworks.js';

const PROMOTED_CACHE_KEY = 'cache/promoted-frameworks.json';

const DOMAIN_AGENT = {
  automation:           'nova',
  business_development: 'atlas',
  digital_media:        'aether',
};

function slugify(title) {
  return String(title || 'framework')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

export async function loadPromotedFrameworks() {
  try {
    const { getJsonCache } = await import('../cloudflareR2.js');
    const list = await getJsonCache(PROMOTED_CACHE_KEY);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function savePromotedFrameworks(list) {
  const { putJsonCache } = await import('../cloudflareR2.js');
  await putJsonCache(PROMOTED_CACHE_KEY, list);
  return list;
}

/**
 * Full IP synthesis pipeline — delegates to Synthesizer GEM Lattice (sole IP authority).
 */
export async function runIpFactory(input = {}) {
  const { synthesizer } = await import('../agents/synthesizer.js');
  const { crystallizeFramework } = await import('./synthesizerCrystallize.js');
  return crystallizeFramework(synthesizer, input);
}

/** Promote synthesized IP into runtime agent DNA registry (R2 cache). */
export async function promoteFrameworkToDna({
  slug,
  title,
  domain,
  oneLiner,
  kind = 'library_product',
  sources = [],
  ipms = null,
  gemProvenance = [],
}) {
  const agent = DOMAIN_AGENT[domain] || 'atlas';
  const id = slugify(title).replace(/-/g, '_').slice(0, 32) || slug.slice(0, 32);

  const promoted = {
    id,
    name:      title,
    shortName: title.split(/\s+/).slice(0, 3).join(' '),
    agent,
    domain,
    track:     domain.replace(/_/g, ' '),
    kind,
    access:    kind === 'operating_framework' ? 'internal' : 'purchasable',
    kbSlug:    slug,
    oneLiner:  oneLiner || `Synthesized DigiFusion IP (${domain}).`,
    sources,
    ipms,
    gemProvenance,
    engine:    'GEM Lattice',
    promotedAt: new Date().toISOString(),
  };

  const list = await loadPromotedFrameworks();
  const filtered = list.filter(f => f.id !== id && f.kbSlug !== slug);
  filtered.unshift(promoted);
  await savePromotedFrameworks(filtered);

  console.log(`[IP Factory] Promoted "${title}" → agent DNA (${agent}, ${kind})`);
  return promoted;
}

/** Seed synthesized content into Supabase knowledge_base for Synthesizer queries. */
export async function seedFrameworkKnowledge({ title, content, domain, slug, sources = [] }) {
  const { getSupabase } = await import('../supabaseClient.js');
  const db = getSupabase();
  if (!db) return { skipped: true, reason: 'no_db' };

  const sourceKey = `agency_ip/${slug}`;
  const { data: existing } = await db.from('knowledge_base')
    .select('id')
    .eq('source_key', sourceKey)
    .limit(1);
  if (existing?.length) return { skipped: true, reason: 'exists' };

  const { error } = await db.from('knowledge_base').insert({
    title,
    domain:          domain || 'general',
    source_type:     'framework',
    source_key:      sourceKey,
    source_name:     slug,
    content:         content.slice(0, 50000),
    frameworks:      [title, ...sources.slice(0, 5)],
    tags:            ['firm_ip', 'synthesized', 'ip_factory', domain],
    metadata:        { slug, kind: 'synthesized', sources },
    relevance_score: 4,
    processed_by:    'gem_lattice',
  });

  if (error) throw new Error(error.message);
  return { seeded: true, sourceKey };
}

/** List IP factory catalog: promoted + agency manifest merge. */
export async function getIpFactoryCatalog() {
  const promoted = await loadPromotedFrameworks();
  let agency = [];
  try {
    const { listAgencyPlaybooks } = await import('../cloudflareR2.js');
    agency = await listAgencyPlaybooks() || [];
  } catch {}

  return {
    promoted,
    agencyCount: agency.length,
    operating:   promoted.filter(f => f.kind === 'operating_framework'),
    library:     promoted.filter(f => f.kind !== 'operating_framework'),
  };
}

export function resolveFrameworkForAgent(agentId, frameworkId) {
  const base = getFrameworkById(frameworkId);
  if (base) return base;
  return null;
}
