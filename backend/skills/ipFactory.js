/**
 * IP Factory — synthesize external resources into original DigiFusion frameworks,
 * store in agency IP, optionally promote into agent operating DNA.
 */

import { saveAgencyPlaybook } from '../cloudflareR2.js';
import { scoreCeoOutput } from './ceoQualityGate.js';
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
 * Full IP synthesis pipeline: hybridize → quality gate → R2 → optional DNA promotion.
 */
export async function runIpFactory(input = {}) {
  const {
    title,
    domain = 'business_development',
    type = 'framework',
    sources = [],
    instruction = '',
    tagline = '',
    access = 'premium',
    promote = false,
    promoteAsOperating = false,
  } = input;

  if (!title?.trim()) throw new Error('title is required');

  const hybridInstruction = [
    instruction,
    sources.length ? `Synthesise logic from: ${sources.join(', ')}.` : '',
    'Phase 1 (Audit/Diagnostic): Extract assessment logic.',
    'Phase 2 (Setup/Infrastructure): Define technical and structural approach.',
    'Phase 3 (Execution): Detail implementation and iteration.',
    'Include actionable checklists, scorecard/maturity matrix, diagnostic questions, deliverables per phase.',
    'Write as proprietary DigiFusion IP — original synthesis, not verbatim copy.',
  ].filter(Boolean).join(' ');

  let content;
  if (domain === 'digital_media') {
    const { aether } = await import('../agents/aether.js');
    content = await aether.buildDigitalMediaFramework(title, {
      domain,
      instruction: hybridInstruction,
      targetAudience: input.audience || '',
      industry: input.industry || '',
    });
  } else {
    const { atlas } = await import('../agents/atlas.js');
    content = await atlas.buildFramework(title, domain, hybridInstruction);
  }

  if (!content?.trim()) throw new Error('Synthesis returned empty content');

  const quality = scoreCeoOutput({ text: content.slice(0, 4000), outputType: 'workflow' });
  if (!quality.passed && quality.score < 55) {
    console.warn(`[IP Factory] Quality below threshold (${quality.score}) — storing with flag`);
  }

  const slug = `${slugify(title)}-${Date.now().toString(36)}`;
  const entry = await saveAgencyPlaybook({
    slug,
    title,
    domain,
    type,
    content,
    sources,
    tagline: tagline || `CEO quality: ${quality.grade}`,
    access,
  });

  let promotion = null;
  if (promote || promoteAsOperating) {
    promotion = await promoteFrameworkToDna({
      slug,
      title,
      domain,
      oneLiner: tagline || `Proprietary ${title} — synthesized firm IP.`,
      kind: promoteAsOperating ? 'operating_framework' : 'library_product',
      sources,
    });
  }

  await seedFrameworkKnowledge({ title, content, domain, slug, sources }).catch(e => {
    console.warn('[IP Factory] KB seed skipped:', e.message);
  });

  return {
    ok:       true,
    entry,
    slug,
    quality,
    promotion,
    preview:  content.slice(0, 600),
  };
}

/** Promote synthesized IP into runtime agent DNA registry (R2 cache). */
export async function promoteFrameworkToDna({
  slug,
  title,
  domain,
  oneLiner,
  kind = 'library_product',
  sources = [],
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
    processed_by:    'ipFactory',
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
