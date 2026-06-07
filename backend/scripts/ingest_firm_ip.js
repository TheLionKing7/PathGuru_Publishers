#!/usr/bin/env node
/**
 * DigiFusion Firm IP Ingestion
 * =============================
 * Uploads proprietary frameworks + industry blueprints from the local Blueprint
 * folder to R2 (firm_ip/) and optionally runs Synthesizer PDF extraction into
 * knowledge_base.
 *
 * Usage:
 *   node --env-file=.env backend/scripts/ingest_firm_ip.js
 *   node --env-file=.env backend/scripts/ingest_firm_ip.js --synthesize
 *   FIRM_IP_SOURCE_DIR="C:/path/to/Blueprint" node --env-file=.env backend/scripts/ingest_firm_ip.js
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { uploadFirmIpDocument, isR2Enabled } from '../cloudflareR2.js';
import { getSupabase } from '../supabaseClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const DEFAULT_SOURCE = 'C:/Users/DELL/Documents/Resources/Blueprint';
const SOURCE_DIR = (process.env.FIRM_IP_SOURCE_DIR || DEFAULT_SOURCE).replace(/\\/g, '/');
const RUN_SYNTHESIZE = process.argv.includes('--synthesize');

/** Core agent operating frameworks → firm_ip/frameworks/ (internal only) */
const FRAMEWORKS = [
  {
    slug: 'automation-velocity-engine',
    title: 'Automation Velocity Engine (AVE)',
    filename: 'digifusion-automation-velocity-engine.pdf',
    domain: 'automation',
    agent: 'nova',
    frameworkNames: ['Automation Velocity Engine', 'AVE'],
    description: 'Nova\'s 5-phase automation operating system: Diagnose → Architect → Build → Deploy → Scale.',
  },
  {
    slug: 'deal-engine',
    title: 'Deal Engine',
    filename: 'digifusion-deal-engine-bd-framework.pdf',
    domain: 'business_development',
    agent: 'atlas',
    frameworkNames: ['Deal Engine', 'Dream 50'],
    description: 'Atlas\'s 4-phase BD orchestration fusing ABM, SPIN, Challenger, Miller Heiman, and Value Proposition Design.',
  },
  {
    slug: 'content-to-capital-pipeline',
    title: 'Content-to-Capital Pipeline (C2C)',
    filename: 'digifusion-content-to-capital-pipeline 2.pdf',
    altFilenames: [
      'digifusion-content-to-capital-pipeline.pdf',
      'digifusion-content-to-capital-pipeline-2.pdf',
    ],
    domain: 'digital_media',
    agent: 'aether',
    frameworkNames: ['Content-to-Capital Pipeline', 'C2C Pipeline'],
    description: 'Aether\'s 4-phase digital media system: Intelligence Audit → Authority Engine → Conversion Funnel → Distribution Flywheel.',
  },
];

/** Industry blueprints v3 (canonical) → firm_ip/blueprints/ */
const BLUEPRINTS = [
  {
    slug: 'sme-scale-up-blueprint-v3',
    title: 'SME Scale Engine Blueprint v3',
    filename: 'DigiFusion_SME_ScaleUp_Blueprint_v3.pdf',
    industry: 'sme',
    domain: 'business_development',
    priceUsd: 49,
    frameworkNames: ['SME Scale Engine', '5-Pillar Framework'],
    description: 'Integrated SME revenue architecture weaving AVE, Deal Engine, and C2C into a 90-day activation plan.',
  },
  {
    slug: 'large-enterprise-blueprint-v3',
    title: 'Enterprise Velocity Architecture Blueprint v3',
    filename: 'DigiFusion_Large_Enterprise_Blueprint_v3.pdf',
    industry: 'enterprise',
    domain: 'business_development',
    priceUsd: 99,
    frameworkNames: ['Enterprise Velocity Architecture', 'KAM Engine'],
    description: 'Strategic revenue and BD intelligence for large corporations. 6 Velocity Drivers and C-suite engagement.',
  },
  {
    slug: 'government-ministry-blueprint-v3',
    title: 'Public Sector Digital Transformation Blueprint v3',
    filename: 'DigiFusion_Government_Ministry_Blueprint_v3.pdf',
    industry: 'government',
    domain: 'business_development',
    priceUsd: 79,
    frameworkNames: ['GovTech 4-Layer Framework', 'Public Sector Digital Transformation'],
    description: 'AI-driven modernisation framework for government MDAs and ministries.',
  },
  {
    slug: 'financial-institutions-blueprint-v3',
    title: 'Financial Intelligence & Revenue Architecture Blueprint v3',
    filename: 'DigiFusion_Financial_Institutions_Blueprint_v3.pdf',
    industry: 'financial',
    domain: 'business_development',
    priceUsd: 99,
    frameworkNames: ['FIRA', 'Financial Intelligence Revenue Architecture'],
    description: 'AI-powered commercial strategy for banks and fintechs. FIRA 3-engine model.',
  },
  {
    slug: 'pharmaceutical-blueprint-v3',
    title: 'Pharma Commercial Excellence Blueprint v3',
    filename: 'DigiFusion_Pharmaceutical_Blueprint_v3.pdf',
    industry: 'pharmaceutical',
    domain: 'business_development',
    priceUsd: 79,
    frameworkNames: ['PCE', 'Pharma Commercial Excellence'],
    description: 'AI-augmented revenue strategy for pharma and life sciences in Africa.',
  },
  {
    slug: 'hotel-hospitality-blueprint-v3',
    title: 'Hospitality Revenue Intelligence Blueprint v3',
    filename: 'DigiFusion_Hotel_Hospitality_Blueprint_v3.pdf',
    industry: 'hospitality',
    domain: 'business_development',
    priceUsd: 69,
    frameworkNames: ['HRIS', 'Hospitality Revenue Intelligence'],
    description: 'AI-driven revenue optimisation for hotels and hospitality groups.',
  },
  {
    slug: 'commodity-exchange-blueprint-v3',
    title: 'Commodity Intelligence & Market Edge Blueprint v3',
    filename: 'DigiFusion_Commodity_Exchange_Blueprint_v3.pdf',
    industry: 'commodity',
    domain: 'business_development',
    priceUsd: 79,
    frameworkNames: ['CIMEF', 'Commodity Intelligence Market Edge'],
    description: 'AI-driven trade intelligence for commodity traders and exchanges.',
  },
];

const RESEARCH = [
  {
    slug: 'nigeria-govcon-intelligence-audit',
    title: 'Nigeria GovCon Intelligence Audit',
    filename: 'DFL_Nigeria_GovCon_Intelligence_Audit.pdf',
    domain: 'business_development',
    category: 'research',
    description: 'Nigeria government contracting intelligence audit and market landscape.',
  },
];

function resolvePath(entry) {
  const candidates = [entry.filename, ...(entry.altFilenames || [])].filter(Boolean);
  for (const f of candidates) {
    const p = join(SOURCE_DIR, f);
    if (existsSync(p)) return p;
  }
  if (entry.slug === 'content-to-capital-pipeline') {
    try {
      const hit = readdirSync(SOURCE_DIR).find(f =>
        /content-to-capital|c2c/i.test(f) && f.toLowerCase().endsWith('.pdf'),
      );
      if (hit) return join(SOURCE_DIR, hit);
    } catch { /* ignore */ }
  }
  return null;
}

async function seedRegistryRow(supabase, { slug, title, domain, sourceKey, description, frameworkNames, kind }) {
  if (!supabase) return;
  const { data: existing } = await supabase.from('knowledge_base')
    .select('id')
    .eq('source_key', sourceKey)
    .limit(1);
  if (existing?.length) {
    console.log(`  KB registry: already exists for ${sourceKey}`);
    return;
  }
  const { error } = await supabase.from('knowledge_base').insert({
    title,
    domain,
    source_type: kind === 'framework' ? 'framework' : kind === 'research' ? 'research' : 'blueprint',
    source_key:  sourceKey,
    source_name: slug,
    content:     `[DigiFusion Firm IP — ${kind}]\n\n${description}\n\nAwaiting or supplementing Synthesizer PDF extraction.`,
    frameworks:  frameworkNames || [],
    tags:        ['firm_ip', kind, 'proprietary'],
    metadata:    { slug, kind, registry: true },
    relevance_score: 5,
    processed_by: 'ingest_firm_ip',
  });
  if (error) console.warn(`  KB registry warning: ${error.message}`);
  else console.log(`  KB registry: ${sourceKey}`);
}

async function uploadEntry(entry, kind) {
  const pdfPath = resolvePath(entry);
  if (!pdfPath) {
    console.warn(`  SKIP (not found): ${entry.filename}${entry.altFilenames?.length ? ` (also tried: ${entry.altFilenames.join(', ')})` : ''}`);
    return null;
  }
  const body = readFileSync(pdfPath);
  console.log(`\nProcessing: ${entry.title} (${Math.round(body.length / 1024)}KB)`);

  const category = entry.category || (kind === 'framework' ? 'frameworks' : kind === 'research' ? 'research' : 'blueprints');
  const access   = kind === 'framework' || kind === 'research' ? 'internal' : 'purchasable';
  const r2Key    = `firm_ip/${category}/${entry.slug}.pdf`;

    if (isR2Enabled()) {
      let uploaded = false;
      for (let attempt = 1; attempt <= 3 && !uploaded; attempt++) {
        try {
          await uploadFirmIpDocument({
            slug:        entry.slug,
            title:       entry.title,
            category,
            industry:    entry.industry || 'general',
            body,
            access,
            description: entry.description || '',
            priceUsd:    entry.priceUsd || 0,
          });
          console.log(`  R2: ${r2Key}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
          uploaded = true;
        } catch (e) {
          console.warn(`  R2 attempt ${attempt} failed: ${e.message}`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 3000));
        }
      }
      if (!uploaded) {
        console.error(`  R2 FAILED after 3 attempts: ${entry.title}`);
        return null;
      }
    } else {
    console.warn('  R2 disabled — skipping upload');
    return null;
  }

  const supabase = getSupabase();
  if (!RUN_SYNTHESIZE) {
    await seedRegistryRow(supabase, {
      slug: entry.slug,
      title: entry.title,
      domain: entry.domain || 'general',
      sourceKey: r2Key,
      description: entry.description || '',
      frameworkNames: entry.frameworkNames || [],
      kind,
    });
  }

  return { r2Key, domain: entry.domain || 'general' };
}

async function runSynthesizerIngest(uploaded) {
  if (!uploaded.length) return;
  console.log('\n=== Synthesizer PDF extraction ===\n');
  const db = getSupabase();
  const { synthesizer } = await import('../agents/synthesizer.js');
  for (const { r2Key, domain } of uploaded) {
    if (db) {
      // Remove lightweight registry stubs so full PDF extraction can run
      await db.from('knowledge_base')
        .delete()
        .eq('source_key', r2Key)
        .eq('processed_by', 'ingest_firm_ip');
    }
    try {
      const result = await synthesizer.ingestPDF(r2Key, domain);
      if (result.skipped) console.log(`  Skipped (already extracted): ${r2Key}`);
      else if (result.error) console.warn(`  Extract error ${r2Key}: ${result.error}`);
      else console.log(`  Extracted ${result.unitsExtracted} units from ${r2Key}`);
    } catch (e) {
      console.error(`  Synthesizer failed ${r2Key}: ${e.message}`);
    }
  }
}

async function ingest() {
  console.log('=== DigiFusion Firm IP Ingestion ===');
  console.log(`Source: ${SOURCE_DIR}`);
  console.log(`R2: ${isR2Enabled() ? 'ENABLED' : 'DISABLED'} | Supabase: ${getSupabase() ? 'CONNECTED' : 'NOT CONFIGURED'}`);
  console.log(`Synthesize: ${RUN_SYNTHESIZE ? 'YES' : 'no (pass --synthesize to extract PDF text into KB)'}\n`);

  if (!existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`);
    console.error('Set FIRM_IP_SOURCE_DIR in .env or place PDFs in the default Blueprint folder.');
    process.exit(1);
  }

  const uploaded = [];

  for (const fw of FRAMEWORKS) {
    const r = await uploadEntry(fw, 'framework');
    if (r) uploaded.push(r);
  }
  for (const bp of BLUEPRINTS) {
    const r = await uploadEntry(bp, 'blueprint');
    if (r) uploaded.push(r);
  }
  for (const doc of RESEARCH) {
    const r = await uploadEntry(doc, 'research');
    if (r) uploaded.push(r);
  }

  console.log(`\nUploaded ${uploaded.length} documents to firm_ip/`);

  if (RUN_SYNTHESIZE) {
    await runSynthesizerIngest(uploaded);
  } else {
    console.log('\nTip: re-run with --synthesize to extract full knowledge units via Synthesizer.');
  }

  const db = getSupabase();
  if (db) {
    const { seedEngagementModelKnowledge } = await import('../skills/firmKnowledge.js');
    const seed = await seedEngagementModelKnowledge(db);
    if (seed.seeded) console.log('Seeded Engagement Model doctrine into knowledge_base');
    else if (seed.skipped) console.log('Engagement Model already in knowledge_base');
    else if (seed.error) console.warn('Engagement Model seed error:', seed.error);
  }

  console.log('\nDone.');
}

ingest().catch(e => { console.error(e); process.exit(1); });
