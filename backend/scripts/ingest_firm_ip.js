#!/usr/bin/env node
/**
 * DigiFusion Firm IP Ingestion Script
 * Uploads 7 proprietary blueprints to R2 firm_ip/blueprints/
 * and registers them in Supabase knowledge_base for Synthesizer.
 *
 * Usage:  node backend/scripts/ingest_firm_ip.js
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { uploadFirmIpDocument, isR2Enabled } from '../cloudflareR2.js';
import { getSupabase } from '../supabaseClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const ROOT = join(__dirname, '../../');

const BLUEPRINTS = [
  { slug: 'sme-scale-engine-blueprint',                         title: 'SME Scale Engine Blueprint',                           industry: 'sme',            priceUsd: 49,  filename: 'DigiFusion_SME_Scale_Engine_Blueprint.pdf',                         description: 'AI-powered BD and revenue architecture for SMEs. 5-Pillar framework, Deal Engine, AVE, C2C Pipeline.' },
  { slug: 'enterprise-velocity-architecture-blueprint',         title: 'Enterprise Velocity Architecture Blueprint',           industry: 'enterprise',     priceUsd: 99,  filename: 'DigiFusion_Enterprise_Velocity_Architecture_Blueprint.pdf',         description: 'Strategic revenue and BD intelligence for large corporations. 6 Velocity Drivers, KAM Engine, C-suite engagement.' },
  { slug: 'public-sector-digital-transformation-blueprint',     title: 'Public Sector Digital Transformation Blueprint',       industry: 'government',     priceUsd: 79,  filename: 'DigiFusion_Public_Sector_Digital_Transformation_Blueprint.pdf',     description: 'AI-driven modernisation for government MDAs. GovTech 4-layer framework.' },
  { slug: 'financial-intelligence-revenue-architecture-blueprint', title: 'Financial Intelligence & Revenue Architecture Blueprint', industry: 'financial', priceUsd: 99, filename: 'DigiFusion_Financial_Intelligence_Revenue_Architecture_Blueprint.pdf', description: 'AI-powered commercial strategy for banks and fintechs. FIRA 3-engine model.' },
  { slug: 'pharma-commercial-excellence-blueprint',             title: 'Pharma Commercial Excellence Blueprint',               industry: 'pharmaceutical', priceUsd: 79,  filename: 'DigiFusion_Pharma_Commercial_Excellence_Blueprint.pdf',             description: 'AI-augmented revenue strategy for pharma and life sciences in Africa. PCE 4-pillar framework.' },
  { slug: 'hospitality-revenue-intelligence-blueprint',         title: 'Hospitality Revenue Intelligence System Blueprint',    industry: 'hospitality',    priceUsd: 69,  filename: 'DigiFusion_Hospitality_Revenue_Intelligence_Blueprint.pdf',         description: 'AI-driven revenue optimisation for hotels and hospitality groups. HRIS 3-engine model.' },
  { slug: 'commodity-intelligence-market-edge-blueprint',       title: 'Commodity Intelligence & Market Edge Framework Blueprint', industry: 'commodity', priceUsd: 79,  filename: 'DigiFusion_Commodity_Intelligence_Market_Edge_Blueprint.pdf',       description: 'AI-driven trade intelligence for commodity traders. CIMEF 4-dimension architecture.' },
];

async function ingest() {
  console.log('=== DigiFusion Firm IP Ingestion ===\n');
  const r2Active = isR2Enabled();
  const supabase = getSupabase();
  console.log(`R2: ${r2Active ? 'ENABLED' : 'DISABLED'} | Supabase: ${supabase ? 'CONNECTED' : 'NOT CONFIGURED'}\n`);

  for (const bp of BLUEPRINTS) {
    const pdfPath = join(ROOT, bp.filename);
    if (!existsSync(pdfPath)) { console.warn(`  SKIP (not found): ${bp.filename}`); continue; }
    const body = readFileSync(pdfPath);
    console.log(`Processing: ${bp.title} (${Math.round(body.length/1024)}KB)`);

    if (r2Active) {
      try {
        await uploadFirmIpDocument({ ...bp, category: 'blueprints', access: 'purchasable', body });
        console.log(`  R2: firm_ip/blueprints/${bp.slug}.pdf`);
      } catch(e) { console.error(`  R2 FAILED: ${e.message}`); }
    }

    if (supabase) {
      try {
        const { error } = await supabase.from('knowledge_base').upsert({
          id:          `firm_ip_${bp.slug}`,
          title:       bp.title,
          content:     `[DigiFusion Proprietary Blueprint — ${bp.industry}]\n\n${bp.description}\n\nInternal use only. Do not share methodology details externally.`,
          source:      'firm_ip',
          source_type: 'blueprint',
          industry:    bp.industry,
          tags:        JSON.stringify(['blueprint', bp.industry, 'proprietary']),
          r2_key:      `firm_ip/blueprints/${bp.slug}.pdf`,
          metadata:    JSON.stringify({ slug: bp.slug, priceUsd: bp.priceUsd }),
          created_at:  new Date().toISOString(),
        }, { onConflict: 'id' });
        if (error) console.warn(`  Supabase warning: ${error.message}`);
        else console.log(`  Supabase KB: firm_ip_${bp.slug}`);
      } catch(e) { console.error(`  Supabase FAILED: ${e.message}`); }
    }
    console.log('');
  }
  console.log('Done. Run supabase/007_products_purchases.sql then restart server.');
}

ingest().catch(e => { console.error(e); process.exit(1); });
