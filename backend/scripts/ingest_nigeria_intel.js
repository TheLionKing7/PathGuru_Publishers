#!/usr/bin/env node
/**
 * Ingest: Nigeria GovCon Intelligence Audit
 * Uploads DFL_Nigeria_GovCon_Intelligence_Audit.pdf to R2 firm_ip/research/
 * and registers it in Supabase knowledge_base for Synthesizer.
 *
 * Usage:  node backend/scripts/ingest_nigeria_intel.js
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { uploadFirmIpDocument, isR2Enabled } from '../cloudflareR2.js';
import { getSupabase } from '../supabaseClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const ROOT   = join(__dirname, '../../');
const FILE   = 'DFL_Nigeria_GovCon_Intelligence_Audit.pdf';
const pdfPath = join(ROOT, FILE);

const DOC = {
  slug:        'nigeria-govcon-intelligence-audit',
  title:       'Nigeria GovCon Intelligence Audit — Market Landscape, Data Sources & DFL Opportunity',
  industry:    'govtech',
  category:    'research',
  access:      'internal',
  filename:    FILE,
  description: `Comprehensive internal audit of Nigeria's government procurement intelligence landscape. Covers: federal and state procurement data source inventory (NOCOPO, BPP, Budget Office, 36 state portals), international donor procurement data (World Bank, AfDB, USAID, UN, EU, IsDB), competitive landscape analysis (eTenders, TendersInfo, NOCOPO, global platforms), sector procurement breakdown (infrastructure ₦4.06T, defence ₦3.99T, education ₦1.40T, health ₦1.23T, ICT ₦800B+), seven critical data gaps (state fragmentation, MDA non-compliance, incumbent intelligence, price benchmarking, pre-tender intelligence, newspaper OCR, contract outcomes), and DFL's ProcureIQ Nigeria product opportunity with 5-year revenue projection (Year 1 $60K ARR → Year 5 $3.6M ARR). Strategic recommendations across four phases: immediate data extraction, Phase 1 unified ingestion, Phase 2 public launch, Phase 3 pan-African expansion to Ghana and Kenya. Authored by Boroji Adebayo-Hopewell, Research & Strategy Lead, Digital Fusion Labs. June 2025. INTERNAL — CONFIDENTIAL.`,
};

const KNOWLEDGE_CONTENT = `
# Nigeria Government Contracting Intelligence Audit
## Digital Fusion Labs — Internal Strategic Research | June 2025

---

## MARKET OVERVIEW

Nigeria's federal government allocated ₦16.48 trillion in capital expenditure in the 2025 budget, executing ₦11.7 trillion (76%). Procurement flows through 700+ federal MDAs, 36 state governments, the FCT, and 40+ international donor programmes. Procurement accounts for approximately 50% of government expenditure in sub-Saharan Africa. BPP's price intelligence function saved the government ₦173 billion in H1 2025 alone.

---

## DATA SOURCE INVENTORY

### Federal Government Sources
- **NOCOPO (nocopo.bpp.gov.ng)**: Official portal — 700+ federal MDAs, JSON/OCDS format, mandatory monthly disclosure. Quality: ★★★☆☆ — gaps in state-level coverage; portal reliability issues.
- **BPP Contractor Registry (federalcontractors.bpp.gov.ng)**: All registered federal contractors categorised by type and capacity. Rich incumbent data. Quality: ★★★★☆
- **Budget Office of the Federation (budgetoffice.gov.ng)**: MDA-level capital allocations, project descriptions, fund releases. Annual + quarterly updates. Quality: ★★★★☆
- **Individual MDA Websites**: Fragmented, non-standardised, no machine-readable format. Quality: ★★☆☆☆ — Major gap.

### State Government Sources
- **Lagos State PPA**: Most active — lagosstatetendering.gov.ng. ₦2.2T 2025 budget. Quality: ★★★★☆
- **Rivers State BPP**: Active portal. Oil industry support contracts. Quality: ★★★☆☆
- **FCT (Abuja)**: Limited, inconsistent portal. Quality: ★★☆☆☆
- **Kano State**: Partial portal. Northern commerce hub. Quality: ★★☆☆☆
- **Kaduna State**: Active — World Bank reform programme partner. Quality: ★★★★☆
- **Remaining 29 states**: Mostly non-digital or inaccessible. CRITICAL DATA GAP.

### International Donor / Development Bank Sources
- **World Bank**: projects.worldbank.org — $2–4B active Nigeria portfolio. JSON/OCDS/CSV — excellent data quality. Sectors: infrastructure, health, education, agriculture, digital.
- **African Development Bank (AfDB)**: afdb.org/procurement — $1–2B active. HTML notices + PDF plans. Sectors: transport, energy, water, agribusiness.
- **USAID**: usaspending.gov + devex.com — $300–500M annual bilateral aid. USASpending API — excellent. Sectors: health, democracy/governance, agriculture.
- **UN System (UNDP, UNICEF, IOM, WFP)**: ungm.org — $200M+ annual. Structured notices. Sectors: humanitarian, health, logistics.
- **EU Development Fund**: $150–300M active. Mixed machine-readability. Sectors: governance, trade, energy.
- **Islamic Development Bank (IsDB)**: $500M+ active in Nigeria. Sectors: transport, ICT, water, health.

KEY INSIGHT: Donor-funded procurement data is significantly better structured than domestic Nigerian data. A Nigeria intelligence platform that ignores this layer misses 30–40% of the total addressable market.

---

## COMPETITIVE LANDSCAPE

### Existing Platforms — Critical Assessment
- **NOCOPO (BPP)**: Official portal. No intelligence layer. Raw data only. No state coverage. Free but unusable for BD.
- **eTenders.com.ng**: Basic tender aggregator. No AI. No incumbent data. Pure listing service.
- **TendersInfo.com**: Global aggregator with Nigeria section. No local depth. No Nigerian incumbent mapping. $300–500/mo.
- **NigerianTenders.com**: Minimal data. Rarely updated. No analysis.
- **Jorpex**: Multi-source aggregator including intl donors. No AI, no scoring, no drafting.
- **BudgIT / Govspend**: Transparency/accountability tool. Not BD-focused. No opportunity matching.
- **Gloopro**: Nigerian startup — pre-product. No public offering confirmed.
- **SeamlessProcure**: Internal procurement management (faces inward — not government opportunity hunting).
- **GovTribe (US)**: AI-assisted GovCon intelligence — US federal only. Zero Nigeria/Africa coverage.
- **GovWin IQ (Deltek)**: Most powerful US platform. $15,000–50,000/yr. US-only. No emerging market vision.

**VERDICT**: No platform in Nigeria or Africa provides: unified multi-source data aggregation + AI opportunity matching + incumbent intelligence + price benchmarking + proposal drafting. The entire value stack is unclaimed.

---

## SECTOR PROCUREMENT BREAKDOWN (2025 Federal Budget)

| Sector | Allocation | Key MDAs |
|--------|-----------|---------|
| Infrastructure & Works | ₦4.06 trillion | Ministry of Works, FERMA, NDDC |
| Defence & Security | ₦3.99 trillion | Ministry of Defence, Police, DSS |
| Education | ₦1.40 trillion | MoE, NUC, UBEC, State MoEs |
| Health | ₦1.23 trillion | MoH, NHIA, NAFDAC |
| Energy & Power | ₦1.1 trillion | Ministry of Power, NERC, NNPC |
| Agriculture | ₦850 billion | MoA, CBN AGSMEIS, NIRSAL |
| ICT & Digital | ₦800B+ (est.) | NITDA, NCC, NIMC, Federal Ministry of Communications |
| Water Resources | ₦500 billion | Ministry of Water Resources, River Basin Authorities |
| Donor-Funded Programmes | $4–8B annually | World Bank, AfDB, USAID, UN, EU, IsDB |

---

## SEVEN CRITICAL DATA GAPS

1. **STATE-LEVEL COVERAGE FRAGMENTATION (CRITICAL)**: 29 of 36 states have no accessible digital procurement portal. Contracts advertised only in newspapers or physical notice boards. Solution: hybrid strategy — scrape accessible portals + newspaper tender OCR pipeline (Punch, ThisDay, Guardian).

2. **MDA NON-COMPLIANCE WITH NOCOPO (HIGH)**: Many MDAs publish late, publish incomplete data, or use non-standardised formats. NOCOPO alone cannot be the primary data source. Must supplement with direct MDA scraping.

3. **INCUMBENT CONTRACTOR INTELLIGENCE (HIGH)**: No structured database linking contractors to historical win patterns, subcontractor networks, sector specialisations, or pricing benchmarks. Requires entity resolution across years of award data.

4. **PRICE INTELLIGENCE / BENCHMARKING (HIGH)**: BPP's price intelligence saves the government billions but this data is not publicly accessible. Building from scraped historical award data would be a significant and durable competitive moat.

5. **PRE-TENDER INTELLIGENCE (CRITICAL)**: Most valuable intelligence is pre-tender — knowing a project is coming before it is advertised. Sources: BPP procurement plans, Budget speeches, World Bank/AfDB Project Appraisal Documents (PADs describe what will be procured 12–24 months before tender).

6. **NEWSPAPER TENDER NOTICES — UNSTRUCTURED DATA (MEDIUM-HIGH)**: Significant volume of state and LGA tenders published only in Punch, ThisDay, Guardian, Vanguard, Tribune. An OCR pipeline would capture contracts invisible to every existing platform.

7. **CONTRACT AWARD OUTCOMES & SUBCONTRACTOR DATA (MEDIUM)**: Who won, what subcontractors were used, whether the contract was completed on time — almost entirely absent from current public sources.

---

## DFL PRODUCT OPPORTUNITY — PROCUREIQ NIGERIA

### Product Vision
ProcureIQ Nigeria: AI-native government contracting intelligence platform aggregating federal MDAs, accessible state portals, newspaper tender notices, and international donor programmes — reasoning over that data to surface ranked opportunities, incumbent intelligence, price benchmarks, and first-draft proposal narratives for Nigerian contractors and consultants.

### Core Differentiators vs. All Existing Platforms
- Federal tender aggregation: Complete + enriched (vs. partial/basic)
- State tender coverage: All accessible portals + newspaper OCR (vs. none)
- International donor coverage: WB, AfDB, USAID, UN, EU, IsDB (vs. none)
- AI opportunity matching: Vector similarity + profile matching (vs. none)
- Incumbent contractor intelligence: Resolved entity database (vs. none)
- Price benchmarking: Historical award price analysis (vs. none)
- Win probability scoring: ML model trained on award patterns (vs. none)
- Proposal narrative drafting: AI-generated first drafts (vs. none)
- Pre-tender intelligence: Budget monitoring + PAD analysis (vs. none)
- WhatsApp alerts: Daily digest via WhatsApp Business API (vs. none)

### Revenue Model
- Starter: ₦25,000/mo (~$15) — Individual BD analysts, small contractors
- Professional: ₦80,000/mo (~$50) — SMB contractors, consulting firms
- Enterprise: ₦250,000/mo+ (~$160) — Large contractors, international firms
- Government/NGO: Custom — Development organisations

### 5-Year Revenue Projection (Base Case)
- Year 1: 80 accounts / $60K ARR
- Year 2: 250 accounts / $215K ARR
- Year 3: 600 accounts / $575K ARR (+ Ghana pilot)
- Year 4: 1,200 accounts / $1.35M ARR (West Africa)
- Year 5: 2,800 accounts / $3.6M ARR (Pan-African, 10 markets)

### Strategic Recommendations

**Immediate (0–3 months)**:
- Extract all NOCOPO JSON data and build local structured database (free, available today)
- Build newspaper tender OCR pipeline using Tesseract (Punch + ThisDay) — 2–3 week engineering task
- Register on UNGM, AfDB portal, World Bank projects portal for notification feeds
- Conduct 10 discovery interviews with Nigerian GovCon contractors

**Phase 1 (3–9 months)**:
- Build unified data ingestion: NOCOPO + BPP Registry + Budget Office + World Bank + AfDB + OCR
- Launch closed beta with 15–20 contractor firms
- Build incumbent contractor intelligence database via entity resolution on 5 years of NOCOPO data
- Establish formal relationship with BPP as GovTech partner

**Phase 2 (9–18 months)**:
- Public launch targeting ICT, consulting, and professional services
- Integrate WhatsApp Business API as primary notification channel
- State portal integration: Lagos, Rivers, Kaduna
- Publish annual Nigeria GovCon Intelligence Report (free thought leadership)

**Phase 3 (18–36 months)**:
- Expand to Ghana (PPRA portal) and Kenya (PPRA portal)
- Launch proposal drafting AI (highest-value feature)
- Consider $500K–$1M seed round for pan-African expansion
- File trademark for chosen brand name across African jurisdictions

---

## CONCLUSION

Nigeria's government procurement market is vast, growing, and structurally underserved by intelligence infrastructure. No existing player — domestic or international — has assembled the full stack designed for the Nigerian and African procurement context. DFL can build ProcureIQ Nigeria on public data sources available today, using the same AI architecture that underpins PathGuru. The consulting practice generates revenue that funds the build. The build generates the data moat that makes the consulting practice uniquely authoritative.

Author: Boroji Adebayo-Hopewell, Research & Strategy Lead, Digital Fusion Labs. June 2025. INTERNAL — CONFIDENTIAL.
`;

async function ingest() {
  console.log('=== DFL Nigeria GovCon Intelligence Audit — Ingestion ===\n');

  if (!existsSync(pdfPath)) {
    console.error(`PDF not found: ${pdfPath}`);
    process.exit(1);
  }

  const body     = readFileSync(pdfPath);
  const r2Active = isR2Enabled();
  const supabase = getSupabase();
  console.log(`R2: ${r2Active ? 'ENABLED' : 'DISABLED'} | Supabase: ${supabase ? 'CONNECTED' : 'NOT CONFIGURED'}`);
  console.log(`PDF size: ${Math.round(body.length/1024)}KB\n`);

  // ── Upload to R2 ──────────────────────────────────────────────────────────
  if (r2Active) {
    try {
      await uploadFirmIpDocument({
        ...DOC,
        body,
        r2Key: `firm_ip/research/${DOC.slug}.pdf`,
      });
      console.log(`R2: firm_ip/research/${DOC.slug}.pdf ✓`);
    } catch(e) {
      console.error(`R2 FAILED: ${e.message}`);
    }
  } else {
    console.log('R2 skipped — no R2 credentials configured.');
  }

  // ── Upsert into Supabase knowledge_base ──────────────────────────────────
  if (supabase) {
    try {
      const { error } = await supabase.from('knowledge_base').upsert({
        id:          `firm_ip_${DOC.slug}`,
        title:       DOC.title,
        content:     KNOWLEDGE_CONTENT,
        source:      'firm_ip',
        source_type: 'research',
        industry:    'govtech',
        tags:        JSON.stringify(['nigeria', 'govcon', 'procurement', 'research', 'procureiq', 'africa', 'market-intelligence']),
        r2_key:      `firm_ip/research/${DOC.slug}.pdf`,
        metadata:    JSON.stringify({ slug: DOC.slug, access: 'internal', author: 'Boroji Adebayo-Hopewell', date: 'June 2025' }),
        created_at:  new Date().toISOString(),
      }, { onConflict: 'id' });

      if (error) console.warn(`Supabase warning: ${error.message}`);
      else console.log(`Supabase KB: firm_ip_${DOC.slug} ✓`);
    } catch(e) {
      console.error(`Supabase FAILED: ${e.message}`);
    }
  } else {
    console.log('Supabase skipped — not configured.');
  }

  console.log('\nDone. Synthesizer will now have full awareness of the Nigeria GovCon intelligence landscape.');
}

ingest().catch(e => { console.error(e); process.exit(1); });
