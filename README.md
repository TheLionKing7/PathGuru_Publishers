# PathGuru Publishers v3

**The intelligence and publishing engine behind DigiFusion.**

PathGuru is the backend — it runs the AI publishing pipeline, the 7-agent intelligence network, the blog CMS proxy, and the shop console. DigiFusion is the frontend storefront at [www.digitafusion.com](https://www.digitafusion.com). Everything produced here flows there.

```
PathGuru (Render)  ──────────────────────────────────▶  DigiFusion (Vercel)
Publishing · Agents · Research · Blog · Shop             Blog · Intelligence · Products · Agency
```

---

## Department architecture

PathGuru is **one system, five departments** — not a monolith. See `ARCHITECTURE.md` for full detail.

| Department | Purpose |
|---|---|
| **Publisher** (core) | Original design: Vektor-grade brief → KDP PDF/EPUB |
| **Intelligence Studio** | Orion research → specialist playbooks → DigiFusion paid IP → blog teasers |
| **Storefront** | DigiFusion shop console (products, orders, CMS) |
| **Network** | 8-agent operations (roster, console, tasks, leads) |
| **Analytics** | DigiFusion visitor footprint |

## What's inside

### 1. AI Publishing Studio (Publisher department)
Brief → KDP-ready PDF with full design — cover, chapter openers, interior layout, all generated from a single form. Backed by a Learning Library of reference PDFs (stored in Cloudflare R2) that teach the pipeline your house style.

### 2. DigiFusion Intelligence Network — 7-Agent System
A coordinated network of AI agents that operate as a firm's back-office. Agents communicate through a shared Supabase task table and share knowledge via the Synthesizer. Every agent can also be messaged directly from the PathGuru console via the built-in chat interface.

| Agent | Role | Key capabilities |
|---|---|---|
| **Synthesizer** | Knowledge engine | Ingests PDFs from R2 into structured knowledge; answers queries for other agents |
| **Nexus** | Project manager & coordinator | Decomposes instructions, routes tasks, monitors network health, lifecycle sync, daily briefing, pipeline view |
| **Atlas** | Research & BD intelligence | Deep market research (Tavily + Firecrawl), prospect analysis, framework development, post-service evaluation |
| **Nova** | Automation engineering | Automation system design, technical blueprints, workflow architecture, post-service evaluation |
| **Aether** | Content strategy | Content strategies, content production, cross-channel repurposing, post-service evaluation |
| **Pulse** | Analytics & monitoring | Monitoring sweeps, analytics reports, alert dispatch (push + WhatsApp) |
| **Aria** | Customer VA & lead qualification | DigiFusion.com chat widget, conversational intake, lead scoring 0–5, Calendly booking integration |

### 3. Agent Chat
Every agent exposes a conversational chat interface accessible directly from the PathGuru console. The shared `AgentBase.chat()` method maintains per-agent conversation history (last 20 turns), recalls episodic memory, and uses the provider fallback chain so chat never fails.

### 4. Blog Pipeline
AI-written blog posts published directly to DigiFusion via the CMS API. Four built-in personas, Tavily research integration, one-click publish/unpublish.

### 5. Agency Playbooks
Nexus can synthesize client-specific playbooks (JSON + HTML) and store them in R2 under `Digifusion/Playbooks/<track>/`. Playbooks are uploaded with full AWS Signature V4 and served via the public CDN URL.

### 6. Shop Console
Operator dashboard for the DigiFusion storefront — products, orders, subscriptions, bookings, analytics, T&C, shipping.

---

## AI Provider Chain

Providers are tried in order until one succeeds. Chat calls never force JSON mode.

```
Cerebras → Gemini → DeepSeek → Claude → Perplexity
```

Set `AI_PROVIDER=` (blank) in `.env` to enable auto-selection. Set it to a provider name to pin that provider.

---

## Project status

### Done

| Area | What was built |
|---|---|
| **Agent network** | All 7 agents built and wired; agent routes live under `/api/agents/*` |
| **Agent memory** | 4-layer memory model: working (context), episodic (Supabase), semantic (Synthesizer), procedural (system prompt) |
| **Agent chat** | Universal `chat()` on AgentBase; per-agent history; `POST /api/agents/:id/chat`; chat panels in console UI |
| **Nexus lifecycle** | `syncClientLifecycle()` — Notion page updates, milestone actions, pre-session brief dispatch |
| **Nexus daily briefing** | `generateDailyBriefing()` — network status + leads + completed tasks → LLM summary → Notion |
| **Nexus pipeline view** | `getPipelineView()` — leads grouped by status/stage |
| **Post-service evaluation** | Atlas, Nova, Aether each trigger structured evaluation on `evaluation_triggered` milestone |
| **Research pipeline** | Two-layer: Tavily discovery + Firecrawl full-content scraping; priority domains (McKinsey, BCG, HBR, etc.) |
| **Synthesizer** | PDF ingestion from R2 → structured knowledge → Supabase `knowledge_base` table |
| **Agency Playbooks** | Synthesize + upload to R2 with AWS V4 signing; manifest tracking per folder |
| **Notifications** | OneSignal push + WhatsApp (Twilio or Meta Cloud API); dispatched by Pulse on each sweep |
| **Learning Library** | R2-backed with manifest per folder — uploads, listing, and deletes all persist across Render restarts |
| **R2 uploads** | Full AWS4-HMAC-SHA256 signing — compatible with Cloudflare R2's strict S3 enforcement |
| **Vektor user cache** | R2 JSON cache replaces disk; 35s timeout handles cold-start |
| **CMS integration** | `cmsClient.js` — all 15+ DigiFusion CMS endpoints with bearer auth and retry |
| **Blog pipeline** | Persona injection, Tavily research, publish/unpublish to DigiFusion |
| **Shop module** | All 6 tabs wired — products, orders, subscriptions, bookings, analytics, settings |
| **Persona system** | 4 personas; injected into LLM prompts at generation time |
| **Notion integration** | `notionClient.js` — leads DB, clients DB, evaluations DB, tasks DB all wired |
| **Conversational intake** | Aria runs structured per-track intake (BD, Automation, Digital Media) — one question at a time |

### Pending / known gaps

| Area | Status |
|---|---|
| Checkout flow | Orders exist in DB; buyer-facing payment flow not yet built |
| Intelligence product sales | Field Guides / Tools pages live; purchase flow not wired |
| Persona injection for books | Connected to blog only; not yet applied to the book pipeline |
| SabiWork / Receptra / AdPilot | SaaS products in development; landing pages live with Early Access CTA |

---

## Agent API routes

| Method | Endpoint | What it does |
|---|---|---|
| `POST` | `/api/agents/:agentId/run` | Dispatch a task to any agent |
| `POST` | `/api/agents/:agentId/chat` | Chat with any agent (body: `{ message, history }`) |
| `POST` | `/api/agents/nexus/orchestrate` | Send natural-language instruction — Nexus decomposes and routes |
| `POST` | `/api/agents/nexus/lifecycle` | Sync a client lifecycle milestone (body: `{ milestone, ...payload }`) |
| `POST` | `/api/agents/nexus/daily-briefing` | Generate and log today's briefing |
| `GET` | `/api/agents/nexus/pipeline` | Lead pipeline view grouped by status/stage |
| `GET` | `/api/agents/status` | Live network snapshot: all agents + active tasks |
| `GET` | `/api/agents/tasks` | Task history (`?agent=atlas&status=completed&limit=30`) |
| `GET` | `/api/agents/report` | Nexus status report |
| `POST` | `/api/agents/synthesizer/ingest` | Ingest PDFs from R2 into knowledge base |
| `POST` | `/api/agents/synthesizer/query` | Query the knowledge base |
| `POST` | `/api/agents/pulse/sweep` | Run a monitoring sweep manually |
| `GET` | `/api/agents/pulse/report` | Analytics report (`?period=weekly`) |
| `POST` | `/api/agents/pulse/dispatch` | Dispatch all pending notifications now |
| `GET` | `/api/agents/notifications` | Fetch notification history for dashboard |
| `POST` | `/api/agents/assistant/chat` | Single chat turn (used by DigiFusion chat widget) |
| `POST` | `/api/agents/assistant/lead` | Save or update a lead |
| `GET` | `/api/agents/leads` | Lead pipeline (`?status=qualified&limit=50`) |

---

## Supabase schema

Run `supabase/001_agent_network.sql` in the Supabase SQL editor to create all tables.

| Table | Purpose |
|---|---|
| `agents` | Agent registry (seeded with all 7 agents) |
| `tasks` | Task queue — agents read from and write to this |
| `agent_memory` | Episodic memory — agents store and recall experience here |
| `knowledge_base` | Synthesizer knowledge — structured extracts from PDFs |
| `leads` | Lead pipeline from the DigiFusion VA (Aria) |
| `notifications` | Alert queue — written by agents, dispatched by Pulse |

If upgrading an existing deployment, also run:
```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dispatch_log JSONB;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
```

---

## Research pipeline — how Atlas works

```
Atlas.research(topic)
  │
  ├─ Synthesizer.answer()      — internal knowledge base first
  │
  └─ runDeepResearch(topic)
       │
       ├─ Tavily (discovery)   — searches the web, returns summaries + ranked URLs
       │
       └─ Firecrawl (depth)    — reads top 3–8 URLs in full (full article markdown)
             │
             └─ LLM synthesis  → structured brief: exec summary, findings, frameworks, competitive landscape
```

Priority domains scraped first: McKinsey, BCG, Bain, KPMG, PwC, Deloitte, HBR, MIT, Stanford, WEF, Gartner, Forrester, Statista, Reuters, Bloomberg, FT, Economist.

---

## File structure

```
backend/
├── server.js                   HTTP server — all routes
├── aiPipeline.js               Provider router: Cerebras → Gemini → DeepSeek → Claude → Perplexity
├── cloudflareR2.js             R2 storage — projects, media, library, JSON cache (AWS V4 signed)
├── supabaseClient.js           Supabase singleton
├── notionClient.js             Notion API client (leads, clients, evaluations, tasks DBs)
├── cmsClient.js                DigiFusion CMS API client
├── referenceLibrary.js         Learning Library — baked profiles + intent folders
├── pdfDesignExtractor.js       PDF design DNA extraction
├── designGuru.js               Book design package generator
├── agents/
│   ├── agentBase.js            Base class — memory, tasks, LLM, delegation, notifications, chat()
│   ├── synthesizer.js          Knowledge engine — PDF ingestion + knowledge queries
│   ├── nexus.js                Coordinator — orchestration, lifecycle sync, briefing, pipeline
│   ├── atlas.js                Research & BD — Tavily + Firecrawl deep research + evaluation
│   ├── nova.js                 Automation engineering + evaluation
│   ├── aether.js               Content strategy + evaluation
│   ├── pulse.js                Analytics & monitoring — sweeps + alert dispatch
│   └── assistant.js            Aria — customer VA, conversational intake, lead scoring
└── skills/
    ├── research.js             Two-layer research pipeline (Tavily + Firecrawl)
    ├── notifier.js             Notification dispatcher (OneSignal push + WhatsApp)
    ├── editorial.js            Blog prompt builder
    ├── personas.js             Persona profiles
    ├── personaPrompt.js        Persona injection
    ├── design.js               Design skill helpers
    └── formatting.js           Output formatting

webapp/
├── index.html                  Three-module shell (Publishing, Blog, Shop + Agent Console)
├── app.js                      State engine + module routing
├── agents.js                   Agent console UI — task dispatch + per-agent chat panels
├── blog.js                     Blog UI
├── shop.js                     Shop UI
├── digifusion-chat-widget.js   Vanilla JS embeddable chat widget (standalone alternative)
└── style.css                   Webapp styles (includes agent chat bubble UI)

supabase/
└── 001_agent_network.sql       Full schema for the agent network
```

---

## Environment variables

```bash
# AI providers — at least one required
# Priority (auto-select): Groq → Cerebras → Gemini → DeepSeek → Claude → Perplexity
# Editorial / PDF pipeline: Claude → Groq → Gemini → DeepSeek
# Research pipeline:        Perplexity → Groq → Cerebras → Claude → DeepSeek
GROQ_API_KEY=...            # PRIMARY — ultra-fast, free tier, llama-3.3-70b-versatile
GROQ_MODEL=llama-3.3-70b-versatile
CLAUDE_API_KEY=...          # Best prose quality — primary for PDF/book generation
CLAUDE_MODEL=claude-sonnet-4-6
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
DEEPSEEK_API_KEY=...
CEREBRAS_API_KEY=...
CEREBRAS_MODEL=...
PERPLEXITY_API_KEY=...      # Research chain — real-time web-grounded answers
PERPLEXITY_MODEL=sonar-pro

# Active provider (blank = auto-select, Groq first)
AI_PROVIDER=
AI_MAX_TOKENS=65536

# Research
TAVILY_API_KEY=...          # Layer 1 — discovery (summaries + ranked URLs)
FIRECRAWL_API_KEY=...       # Layer 2 — full-content scraping

# Storage — Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=...   # or R2_ACCOUNT_ID
CLOUDFLARE_R2_BUCKET=...    # or R2_BUCKET_NAME
CLOUDFLARE_API_TOKEN=...    # Cloudflare API token (used for non-upload R2 operations)
R2_ACCESS_KEY_ID=...        # R2 S3-compatible Access Key ID  ← required for uploads
R2_SECRET_ACCESS_KEY=...    # R2 S3-compatible Secret Access Key ← required for uploads
R2_PUBLIC_URL=...           # CDN prefix for public URLs (e.g. https://cdn.digitafusion.com)

# Generate R2 S3 credentials:
# Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token (Object Read & Write)

# Database
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Notion (agent lifecycle + client management)
NOTION_API_KEY=...
NOTION_LEADS_DB_ID=...
NOTION_CLIENTS_DB_ID=...
NOTION_EVALUATIONS_DB_ID=...
NOTION_TASKS_DB_ID=...

# DigiFusion CMS integration
DIGIFUSION_API_URL=https://www.digitafusion.com
DIGIFUSION_CMS_TOKEN=...    # shared secret — same value as PATHGURU_CMS_TOKEN in Vercel

# Vektor
VEKTOR_ADMIN_KEY=...
VEKTOR_SERVICE_KEY=...

# Image stock
PEXELS_API_KEY=...

# Notifications (Pulse)
ONESIGNAL_APP_ID=...
ONESIGNAL_API_KEY=...
WHATSAPP_TO=+447700900123   # comma-separated for multiple recipients
TWILIO_ACCOUNT_SID=...      # WhatsApp via Twilio (primary)
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
# OR Meta Cloud API (fallback):
META_WHATSAPP_TOKEN=...
META_PHONE_NUMBER_ID=...

# Booking
CALENDLY_BOOKING_URL=https://calendly.com/digifusion/strategy-session

PORT=8787
```

---

## Get it running

```bash
npm install
cp .env.example .env   # fill in at minimum GEMINI_API_KEY + R2 credentials
node backend/server.js
```

Open `webapp/index.html` in a browser. Set the backend URL to `http://localhost:8787` in Settings on first run.

---

## DigiFusion CMS integration

```
PathGuru webapp  →  PathGuru backend  →  DigiFusion CMS API  →  Supabase
                    (holds CMS token)    (verifies token)
```

PathGuru never touches DigiFusion's Supabase directly — one bearer token crosses the boundary.

Setup:
1. Generate a shared secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Set as `PATHGURU_CMS_TOKEN` in Vercel (DigiFusion)
3. Set same value as `DIGIFUSION_CMS_TOKEN` in PathGuru `.env`
4. Set `DIGIFUSION_API_URL=https://www.digitafusion.com` in PathGuru `.env`

---

## Deployment

Backend → Render (`render.yaml` is in the repo). Webapp → any static host (Vercel, Cloudflare Pages, GitHub Pages).

---

## License

Private. All rights reserved.
