# PathGuru v3 — Department Architecture

PathGuru is one system with **five departments** (offices). Each department owns its UI shell, API surface, and operational logic. Publisher is the original core; everything else was added later and must not collapse back into a monolith.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          PATHGURU (Render)                               │
├─────────────┬──────────────────┬─────────────────┬───────────┬───────────┤
│  Publisher  │  Intelligence    │ Products & Tools│  Network  │ Analytics │
│  (core)     │  Library         │                 │           │           │
└──────┬──────┴────────┬─────────┴────────┬────────┴─────┬─────┴─────┬─────┘
       │               │                  │              │           │
       ▼               ▼                  ▼              ▼           ▼
   KDP PDF/EPUB    Gated firm IP      Tools, SaaS,    8-agent     Site
   Vektor briefs   + playbooks        workflow        ops         stats
                   (paywalled)        templates
```

## Departments

| Department | Webapp module | Default tab | Purpose |
|---|---|---|---|
| **Publisher** | `publishing` | `brief` | Original design: Vektor-grade brief → research → manuscript → KDP PDF/EPUB. |
| **Intelligence Library** | `agents` (+ `blog` for derivatives) | `agents-ip` | Gated McKinsey/BCG-style resource library: operating frameworks (agent DNA) + paywalled segment blueprints. Playbook Synthesizer produces new IP; blog teasers are derivatives only. |
| **Products & Tools** | `shop` | `shop-products` | DigiFusion **products** — tools, SaaS subscriptions, workflow templates, services. Orders, payments, and CMS settings. **Not** a retail shop. |
| **Network** | `agents` | `agents-network` | Agent roster, console, tasks, leads. Coordination layer — not content production. |
| **Analytics** | `analytics` | `analytics` | DigiFusion visitor footprint from `/api/cms/analytics`. |

## Agent roles (canonical)

| Agent | ID | Role |
|---|---|---|
| **Orion** | `researcher` | General researcher — Tavily + Firecrawl + Perplexity. Serves all departments. Never writes final IP. |
| **Atlas** | `atlas` | Business Development — Deal Engine, segment blueprints, BD playbooks |
| **Nova** | `nova` | AI & Systems Engineering — Automation Velocity Engine |
| **Aether** | `aether` | Digital Media & Content Strategy — C2C Pipeline, blog derivatives |
| **Nexus** | `nexus` | **Digital CEO** — Engagement Model on every orchestration; morning/evening briefings; blog cadence; workflow design; Notion sync |
| **Synthesizer** | `synthesizer` | Knowledge engine — PDF ingest, KB queries |
| **Pulse** | `pulse` | Monitoring & alerts |
| **Aria** | `assistant` | DigiFusion visitor VA (runs on API, not PathGuru UI) |

## Firm IP — single knowledge source

All agents, Aria, Synthesizer probes, and HTTP routes read firm IP through **one integration layer**:

```
firmFrameworks.js  (canonical registry — definitions only)
        │
        ▼
firmKnowledge.js   (unified layer — catalog, seeding, agent exports)
        │
        ├──► agentBase.js      → injects getFrameworksForAgent() into every agent prompt
        ├──► nexus.js          → Digital CEO doctrine (nexusCeoDoctrine.js) + ops engine (nexusCeoOps.js)
        ├──► assistant.js      → buildAriaFrameworkContext() for visitor chat
        ├──► synthesizer.js    → ingest, query, framework probe
        └──► server.js         → GET /api/firm-ip/library, /api/agents/synthesizer/frameworks
```

**Storage:** `R2 firm_ip/` (PDFs + manifest) + `Supabase knowledge_base` (Synthesizer-extracted units).

| Endpoint | Purpose |
|---|---|
| `GET /api/firm-ip/library` | Unified catalog: operating frameworks + Intelligence Library products |
| `GET /api/agents/synthesizer/frameworks` | KB backing status per framework |
| `POST /api/agents/synthesizer/query` | Agent knowledge retrieval |
| `GET /api/blueprints` | Paywalled blueprint catalog (DigiFusion products) |

## Nexus Digital CEO

Nexus is the **Digital CEO**, not a task router. Executive craft is in `backend/skills/nexusCeoDoctrine.js` (mapped to firm IP — no generic McKinsey/TOGAF operating logic). Quality enforced by `ceoQualityGate.js`. Ops in `nexusCeoOps.js`.

| Schedule | Action |
|---|---|
| 7:00 daily | Morning briefing → WhatsApp + Notion CEO dashboard |
| 18:00 daily | Evening briefing → WhatsApp + Notion |
| Every 12h | Blog cadence check (default every 3 days) → Orion → Aether **brief** → Boss YES |
| Every 6h | Due scheduled content → approval path only (**never auto-publish**) |

| API | Purpose |
|---|---|
| `GET /api/agents/nexus/ceo-ops` | Cadence, approvals, content queue, stuck tasks |
| `POST /api/agents/nexus/evening-briefing` | On-demand evening wrap-up |
| `POST /api/agents/nexus/design-workflow` | AVE-aligned workflow spec → Nova task + Notion |
| `POST /api/agents/nexus/content-cadence-check` | Manual cadence trigger |

Env: `BLOG_CADENCE_DAYS=3` (2 or 3 recommended).

### Operating frameworks (agent DNA — internal)

These define **how we work**. Woven into agent prompts; not sold as standalone PDFs.

| Framework | Primary agent | Purpose |
|---|---|---|
| **Automation Velocity Engine (AVE)** | Nova | 5-phase automation operating system |
| **Deal Engine** | Atlas | 4-phase BD orchestration |
| **Content-to-Capital Pipeline (C2C)** | Aether | Pillar-cluster content authority |
| **DigiFusion Engagement Model** | Nexus | 4-phase diagnostic & delivery on **every** client engagement |

The Engagement Model has no source PDF — doctrine lives in `firmFrameworks.js` (from `digifusion/app/agency/methodology/page.tsx`) and is seeded into `knowledge_base` via `seedEngagementModelKnowledge()`.

### Intelligence Library (paywalled products)

Gated segment blueprints — clients pay for access (McKinsey/BCG-style resource library). **Not** core operating logic; Atlas references them for segment work.

| Product | Segment |
|---|---|
| **SME Scale Engine (5-Pillar)** | SME growth |
| **Enterprise Velocity Architecture** | Large enterprise |
| **GovTech 4-Layer** | Government & public sector |
| **FIRA** | Financial institutions |
| **PCE** | Pharmaceutical |
| **HRIS** | Hotel & hospitality |
| **CIMEF** | Commodity exchange |

Source PDFs: `Resources/Blueprint/` → ingested to `firm_ip/blueprints/` via `backend/scripts/ingest_firm_ip.js --synthesize`.

## Products & Tools (not a shop)

The **Products & Tools** department manages DigiFusion commercial offerings:

- **Tools** — downloadable utilities and workflow assets
- **SaaS** — subscription products (MRR tracked in console)
- **Workflow templates** — packaged automation/content templates
- **Services** — bookings and service orders

Revenue, orders, and CMS product CRUD flow through `/api/shop/*` → DigiFusion CMS. This is an operator console for product catalog management — not a consumer retail storefront.

## IP-first content flow

```
Boss brief → Nexus.orchestrate()  [Engagement Model phases inform routing]
  → Orion.research()  [Phase 1 — Discovery]
    → Boss picks next step (blog / BD / automation)
      → Blog path: Aether drafts brief → WhatsApp approval → Boss YES
        → executeApprovedBlogPublish() → DigiFusion CMS live
```

### Blog approval workflow (must not be bypassed)

1. Nexus detects research intent → dispatches **Orion**
2. Orion returns brief → Nexus shows next-step buttons
3. Boss picks **Write blog** → Aether produces outline/hook (not full post)
4. **WhatsApp** approval request fires (`approvalGate.js`)
5. Boss replies **YES** on WhatsApp
6. `blogApprovalFlow.js` → Aether `produceContent()` → `blogPublisher` → **published** on DigiFusion

Direct `/api/agents/aether/write-blog` requires `researchBrief` or `playbookSlug` (Boss `force=true` override for seeds only).

## Backend structure

```
backend/
├── skills/
│   ├── firmFrameworks.js    ← canonical registry (8 frameworks + 3 library-only blueprints)
│   ├── firmKnowledge.js     ← single integration point for agents + APIs
│   ├── contentAdvocate.js   ← expert voice for derivatives
│   └── blogApprovalFlow.js  ← post-YES publish execution
├── agents/                  ← each agent gets operating frameworks via agentBase
├── scripts/
│   └── ingest_firm_ip.js    ← Blueprint folder → R2 + Synthesizer KB extract
├── blogPublisher.js         ← CMS publish pipeline
└── server.js                ← Nexus orchestrate, WhatsApp webhook, firm-ip routes
```

## DigiFusion boundary

PathGuru never holds DigiFusion's Supabase service role for CMS writes. One bearer token (`DIGIFUSION_CMS_TOKEN` / `PATHGURU_CMS_TOKEN`) crosses the boundary via `cmsClient.js`.

Aria (Assistant) loads framework context **server-side only** via `buildAriaFrameworkContext()` — never in the browser client.

Intelligence Library documents surface on DigiFusion as paywalled products; PathGuru ingests and indexes them for agent retrieval while public pages show titles and purchase gates only.
