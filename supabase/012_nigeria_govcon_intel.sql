-- Migration 012 — Nigeria GovCon Intelligence Audit
-- Run in Supabase SQL Editor → paste entire block → Run

INSERT INTO knowledge_base (
  title, domain, source_type, source_key, source_name,
  content, tags, concepts, frameworks, metadata
) VALUES (
  'Nigeria GovCon Intelligence Audit — Market Landscape, Data Sources and DFL Opportunity',
  'business_development',
  'research',
  'firm_ip/research/nigeria-govcon-intelligence-audit.pdf',
  'DFL_Nigeria_GovCon_Intelligence_Audit.pdf',
  $$
NIGERIA GOVERNMENT CONTRACTING INTELLIGENCE AUDIT
Digital Fusion Labs — Internal Strategic Research | June 2025

MARKET OVERVIEW
Nigeria federal capital budget 2025: 16.48 trillion naira. Executed: 11.7 trillion (76%). Procurement flows through 700+ federal MDAs, 36 state governments, FCT, and 40+ international donor programmes. BPP price intelligence saved 173 billion naira in H1 2025. Procurement represents ~50% of government expenditure in sub-Saharan Africa.

FEDERAL DATA SOURCES
- NOCOPO (nocopo.bpp.gov.ng): 700+ MDAs, JSON/OCDS format, mandatory monthly disclosure. Quality 3/5 — portal reliability gaps; no state coverage.
- BPP Contractor Registry (federalcontractors.bpp.gov.ng): All registered federal contractors by type and capacity. Quality 4/5 — rich incumbent data.
- Budget Office (budgetoffice.gov.ng): MDA capital allocations, project descriptions, fund releases. Annual + quarterly updates. Quality 4/5.
- Individual MDA Websites: Fragmented, no machine-readable format. Quality 2/5 — major gap.

STATE GOVERNMENT SOURCES
- Lagos State PPA (lagosstatetendering.gov.ng): 2.2 trillion naira 2025 budget. Quality 4/5 — HIGHEST priority.
- Rivers State BPP: Active portal. Oil industry contracts. Quality 3/5.
- FCT Abuja: Limited, inconsistent portal. Quality 2/5.
- Kaduna State: Active — World Bank reform programme partner. Quality 4/5.
- 29 of 36 states: No accessible digital portal. CRITICAL DATA GAP — tenders in newspapers only.

INTERNATIONAL DONOR SOURCES
- World Bank (projects.worldbank.org): $2-4B Nigeria portfolio. JSON/OCDS/CSV — excellent. Sectors: infrastructure, health, education, agriculture, digital.
- African Development Bank (afdb.org/procurement): $1-2B active. Sectors: transport, energy, water, agribusiness.
- USAID (usaspending.gov): $300-500M annual. API available. Sectors: health, governance, agriculture.
- UN System / UNGM (ungm.org): $200M+ annual. Structured notices.
- Islamic Development Bank: $500M+ active Nigeria. Sectors: transport, ICT, water, health.
- EU Development Fund: $150-300M active.
KEY INSIGHT: Donor procurement data is significantly better structured than domestic Nigerian data. Ignoring this layer misses 30-40% of total addressable market.

SECTOR PROCUREMENT BREAKDOWN 2025
- Infrastructure and Works: 4.06 trillion naira (Ministry of Works, FERMA, NDDC)
- Defence and Security: 3.99 trillion naira (restricted; relationship-driven)
- Education: 1.40 trillion naira (MoE, NUC, UBEC)
- Health: 1.23 trillion naira (MoH, NHIA, NAFDAC) — significant donor co-funding
- Energy and Power: 1.1 trillion naira (Ministry of Power, NERC, NNPC)
- Agriculture: 850 billion naira (MoA, CBN AGSMEIS, NIRSAL) — donor-heavy
- ICT and Digital: 800+ billion naira (NITDA, NCC, NIMC) — fastest growing; highest DFL relevance
- Water Resources: 500 billion naira — AfDB and World Bank co-funded
- Donor Programmes: $4-8B annually across all sectors — best data quality

COMPETITIVE LANDSCAPE
No platform in Nigeria or Africa provides: unified multi-source data aggregation + AI opportunity matching + incumbent intelligence + price benchmarking + proposal drafting. The entire value stack is unclaimed.
- NOCOPO: Raw data only. No intelligence layer. Free but not BD-usable.
- eTenders.com.ng: Basic tender listing. No AI. No analysis.
- TendersInfo.com: Global aggregator. No Nigerian depth. No incumbent mapping.
- Gloopro: Nigerian startup — pre-product. No public offering confirmed.
- GovTribe (US): AI-assisted — US federal only. Zero Africa coverage.
- GovWin IQ by Deltek (US): $15-50K/year. US-only. No emerging market vision.

SEVEN CRITICAL DATA GAPS
1. STATE FRAGMENTATION (CRITICAL): 29 of 36 states have no digital procurement portal. Solution: state portal scraping + Tesseract OCR on Punch, ThisDay, Guardian newspapers.
2. MDA NON-COMPLIANCE (HIGH): Many MDAs publish late or incomplete to NOCOPO. Must supplement with direct MDA website scraping.
3. INCUMBENT INTELLIGENCE (HIGH): No structured database linking contractors to historical wins, subcontractors, sector specialisations, pricing benchmarks. Requires entity resolution across years of NOCOPO award data.
4. PRICE BENCHMARKING (HIGH): BPP internal price intelligence saves billions but not publicly accessible. Historical award data = major competitive moat.
5. PRE-TENDER INTELLIGENCE (CRITICAL): Sources: BPP procurement plans, Budget speeches, World Bank and AfDB Project Appraisal Documents — describe what will be procured 12-24 months before tender.
6. NEWSPAPER OCR (MEDIUM-HIGH): State and LGA tenders published only in Punch, ThisDay, Vanguard, Guardian, Tribune. Daily OCR ingestion = contracts invisible to all competitors.
7. SUBCONTRACTOR DATA (MEDIUM): Who won, what subcontractors used, whether completed on time — almost entirely absent from public sources.

DFL PRODUCT OPPORTUNITY — PROCUREIQ NIGERIA
Vision: AI-native government contracting intelligence platform aggregating federal MDAs, state portals, newspaper tender notices, and international donor programmes — with AI opportunity matching, incumbent intelligence, price benchmarking, win scoring, and proposal narrative drafting.

Differentiators: complete federal aggregation + state portal coverage + newspaper OCR pipeline + donor intelligence + AI opportunity matching + incumbent contractor database + historical price benchmarks + win probability scoring + AI proposal drafting + WhatsApp Business API alerts. No competitor has any of these.

Revenue Model:
- Starter: 25,000 naira/mo (~$15) — individual BD analysts, small contractors
- Professional: 80,000 naira/mo (~$50) — SMB contractors, consulting firms
- Enterprise: 250,000 naira/mo+ (~$160) — large contractors, international firms

Five-Year Revenue Projection (base case):
Year 1: 80 accounts / $60K ARR (Nigeria only)
Year 2: 250 accounts / $215K ARR (+ Ghana pilot)
Year 3: 600 accounts / $575K ARR (Nigeria + Ghana + Kenya)
Year 4: 1,200 accounts / $1.35M ARR (West Africa)
Year 5: 2,800 accounts / $3.6M ARR (Pan-African, 10 markets)

Strategic Roadmap:
Immediate (0-3 months): Extract all NOCOPO JSON data free today. Build newspaper OCR pipeline using Tesseract — 2-3 week engineering task. Register on UNGM, AfDB portal, World Bank projects portal. Conduct 10 discovery interviews with Nigerian GovCon contractors.
Phase 1 (3-9 months): Build unified data ingestion layer. Launch closed beta with 15-20 contractor firms. Build incumbent contractor intelligence database via entity resolution on 5 years of NOCOPO data. Establish formal DFL relationship with BPP as GovTech partner.
Phase 2 (9-18 months): Public launch targeting ICT, consulting, and professional services. Integrate WhatsApp Business API as primary alert channel. State portal integration for Lagos, Rivers, Kaduna. Publish annual Nigeria GovCon Intelligence Report as free thought leadership.
Phase 3 (18-36 months): Expand to Ghana PPRA and Kenya PPRA. Launch AI proposal drafting — highest-value feature. Consider $500K-$1M seed round. File trademark across African jurisdictions.

Author: Boroji Adebayo-Hopewell, Research and Strategy Lead, Digital Fusion Labs. June 2025. INTERNAL CONFIDENTIAL.
$$,
  ARRAY['nigeria','govcon','procurement','research','procureiq','africa','market-intelligence','nocopo','bpp'],
  ARRAY['government procurement','Nigeria','NOCOPO','BPP','GovTech','tender intelligence','incumbent mapping','price benchmarking','donor funding','World Bank','AfDB','USAID','ProcureIQ'],
  ARRAY['ProcureIQ Nigeria','Unified Data Ingestion','Newspaper OCR Pipeline','Incumbent Entity Resolution','Pre-Tender Intelligence','Win Probability Scoring'],
  '{"slug":"nigeria-govcon-intelligence-audit","access":"internal","author":"Boroji Adebayo-Hopewell","date":"June 2025","relevance":"strategic"}'::jsonb
);

SELECT id, title, domain, source_type, created_at
FROM knowledge_base
WHERE source_key = 'firm_ip/research/nigeria-govcon-intelligence-audit.pdf';
