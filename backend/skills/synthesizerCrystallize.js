/**
 * Synthesizer Crystallization Pipeline — GEM Lattice → proprietary IP → DNA encode
 * Single authority for firm framework birth (replaces Atlas/Aether as authors).
 */

import { saveAgencyPlaybook } from '../cloudflareR2.js';
import { scoreCeoOutput } from './ceoQualityGate.js';
import { getOperatingFrameworks } from './firmKnowledge.js';
import {
  rankGems,
  computeIpms,
  resolveOutputTier,
  scoreExecutableDepth,
  scoreGenericEcho,
  scoreMece,
  THRESHOLDS,
} from './gemLattice.js';
import {
  loadPromotedFrameworks,
  promoteFrameworkToDna,
  seedFrameworkKnowledge,
} from './ipFactory.js';

const DOMAIN_AGENT = {
  automation:           'nova',
  business_development: 'atlas',
  digital_media:        'aether',
};

function slugify(title) {
  return String(title || 'framework')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);
}

function parseFrameworkJson(raw) {
  const text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : text;
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function fetchKnowledgeUnits(synthesizer, query, domains = [], limit = 20) {
  const units = await synthesizer._searchKnowledge(query, domains, limit);
  return units || [];
}

function firmCorpusFromFrameworks() {
  return getOperatingFrameworks().map(f => ({
    title: f.name,
    content: f.oneLiner || '',
    oneLiner: f.oneLiner,
  }));
}

/**
 * Full GEM Lattice crystallization — Synthesizer-only IP birth.
 */
export async function crystallizeFramework(synthesizer, input = {}) {
  const {
    title,
    domain = 'business_development',
    instruction = '',
    sources = [],
    tagline = '',
    access = 'premium',
    promote = false,
    promoteAsOperating = false,
    forcePromote = false,
  } = input;

  if (!title?.trim()) throw new Error('title is required');

  const query = [title, instruction, ...sources].filter(Boolean).join(' ');
  const domains = [domain, 'general'];
  const units = await fetchKnowledgeUnits(synthesizer, query, domains, 24);
  const firmCorpus = firmCorpusFromFrameworks();
  const gems = rankGems(units, firmCorpus);

  const gemBlock = gems.length
    ? gems.slice(0, 12).map((g, i) =>
      `[GEM ${i + 1}] score=${g.gemScore} | ${g.unit.title}\n${(g.unit.content || '').slice(0, 500)}`
    ).join('\n\n---\n\n')
    : 'No high-scoring gems — use firm Engagement Model + domain doctrine.';

  const crystallizePrompt = `You are the Synthesizer — sole authority for DigiFusion proprietary IP.

FRAMEWORK TITLE: ${title}
DOMAIN: ${domain}
INSTRUCTION: ${instruction}
SOURCES: ${sources.join(', ') || 'firm knowledge base'}

GEM LATTICE (ranked knowledge gems — build ONLY from these + firm Engagement Model):
${gemBlock}

Crystallize a proprietary DigiFusion framework. Original synthesis — not verbatim McKinsey/BCG copy.
Map phases to Engagement Model (Discovery → Gap → Solution Design → Build/Deploy/Measure) where applicable.

Return STRICT JSON:
{
  "title": "...",
  "tagline": "...",
  "executive_summary": "...",
  "phases": [
    { "number": 1, "name": "...", "objective": "...", "methodology": "...",
      "activities": ["..."], "checklist": ["✓ ..."], "deliverable": "...", "duration": "..." }
  ],
  "scorecard": {
    "title": "...",
    "dimensions": [{ "name": "...", "weight": 20, "diagnostic_question": "?", "scoring_guide": { "1": "...", "5": "..." } }]
  },
  "diagnostic_questions": [{ "number": 1, "question": "...", "maps_to": "...", "insight": "..." }],
  "differentiators": ["..."],
  "gem_provenance": ["source titles used"],
  "tension_resolved": "how contradictions became insight"
}

Rules: 3–4 phases, 5 scorecard dimensions (weights sum 100), 8+ diagnostic questions.`;

  const raw = await synthesizer._callWithFallback(crystallizePrompt, synthesizer.systemPrompt, { json: true });
  const framework = parseFrameworkJson(raw);
  if (!framework?.title) throw new Error('Crystallization failed — invalid framework JSON');

  const proseContent = JSON.stringify(framework, null, 2);
  const gemScores = gems.map(g => g.gemScore);
  const executableDepth = scoreExecutableDepth(framework);
  const genericEcho = scoreGenericEcho(proseContent, firmCorpus);
  const mece = scoreMece(framework.phases);
  const firmFit = 0.7 + mece * 0.3;
  const tensionResolved = framework.tension_resolved ? 0.15 : 0.05;

  const ipms = computeIpms({
    gemScores,
    firmFit,
    executableDepth,
    tensionResolved,
    genericEcho,
  });

  let tier = resolveOutputTier(ipms);
  if (tier === 'reject') {
    throw new Error(`IPMS ${ipms} below reject threshold (${THRESHOLDS.ipmsReject}). Add sources or refine instruction.`);
  }

  const quality = scoreCeoOutput({ text: proseContent.slice(0, 4000), outputType: 'workflow' });
  const slug = `${slugify(title)}-${Date.now().toString(36)}`;

  const entry = await saveAgencyPlaybook({
    slug,
    title: framework.title || title,
    domain,
    type: tier === 'operating_framework' ? 'framework' : 'playbook',
    content: proseContent,
    sources: [...sources, ...gems.slice(0, 5).map(g => g.unit.source_name || g.unit.title)],
    tagline: tagline || framework.tagline || `IPMS ${ipms}`,
    access,
    metadata: { ipms, tier, gemCount: gems.length, quality: quality.grade },
  });

  await seedFrameworkKnowledge({
    title: framework.title || title,
    content: proseContent,
    domain,
    slug,
    sources,
  }).catch(e => console.warn('[Crystallize] KB seed:', e.message));

  let promotion = null;
  const shouldPromote = forcePromote || promote || promoteAsOperating || tier === 'operating_framework';
  if (shouldPromote && ipms >= THRESHOLDS.ipmsLibrary) {
    promotion = await promoteFrameworkToDna({
      slug,
      title: framework.title || title,
      domain,
      oneLiner: framework.tagline || tagline || `IPMS ${ipms} — GEM Lattice`,
      kind: (promoteAsOperating || tier === 'operating_framework') ? 'operating_framework' : 'library_product',
      sources: gems.slice(0, 5).map(g => g.unit.source_key).filter(Boolean),
      ipms,
      gemProvenance: gems.slice(0, 8).map(g => ({ title: g.unit.title, score: g.gemScore, source: g.unit.source_key })),
    });
  }

  const { getSupabase, supabaseWrite } = await import('../supabaseClient.js');
  const db = getSupabase();
  if (db) {
    await supabaseWrite(db.from('gem_crystallizations').insert({
      title: framework.title || title,
      slug,
      domain,
      ipms,
      tier,
      gem_count: gems.length,
      promoted: !!promotion,
      provenance: gems.slice(0, 8).map(g => ({ title: g.unit.title, score: g.gemScore, source: g.unit.source_key })),
      metadata: { quality: quality.grade },
    }), 'crystallize audit');
  }

  return {
    ok: true,
    slug,
    tier,
    ipms,
    gemCount: gems.length,
    gems: gems.slice(0, 5).map(g => ({ title: g.unit.title, gemScore: g.gemScore })),
    framework,
    entry,
    quality,
    promotion,
    preview: (framework.executive_summary || proseContent).slice(0, 600),
  };
}

/** List crystallization catalog */
export async function getCrystallizationCatalog() {
  const promoted = await loadPromotedFrameworks();
  return {
    promoted,
    thresholds: THRESHOLDS,
    engine: 'GEM Lattice',
  };
}

export { DOMAIN_AGENT };
