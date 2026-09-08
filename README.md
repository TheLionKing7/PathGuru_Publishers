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
| **Intelligence Studio** | Orion research → specialist playbooks → DigiFusion paid IP → blog teasers. Three rooms: Playbooks, Prompt Library, Five-Day Assessment |
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

### 7. Prompt Library and Registry
Seventy-two operator prompts in twelve categories, seventeen industry blocks and nine clauses gathered into five presets, composed in the console at **Intelligence → Prompt Library**. A prompt is assembled from a base text, an optional industry block, any clauses and the variables filled in, then copied.

**Usage is recorded on copy, not on compose.** The composer re-assembles the text on every keystroke; counting that would measure typing rather than use.

The registry sits underneath the library. Every prompt has a seed in `backend/prompts/`, a chain of saved drafts, and at most one published version.

**The repo is the floor.** `prompt.live_version` is null until somebody publishes, and a null resolves to the text in the repo. There is no boot-time seeding of the tables, so the database can never shadow the repo with a stale copy of a prompt nobody remembers editing, and reverting is deleting a pointer rather than restoring a backup. `registryHealth()` reports how many prompts are running on a published version and how many on the seed.

Publishing is gated by the estate pause in the same way agent output is: a paused estate blocks agent publishes and leaves operator publishes alone.

### 8. The Five-Day Assessment
The published five-day board *is* the room. `webapp/js/fiveday-playbook.js` holds that board as data, transcribed and not paraphrased; `fiveday-room.js` renders it and never rewords it. Open a client and each step card grows a second half — that client's state for that step, and the inputs that change it. Step 2 shows the three tests and the candidate list together; Step 3 shows the formula and their figure. Nothing lives in two places. With no client open the board is just the board, which is what you want the night before a call.

Three rules the code enforces rather than documents:

- **A candidate must pass all three tests** — repeatable, legible, bounded. The verdict is derived on the server from those three, first failure deciding. There is deliberately no whitelist of verdicts a client could post: a verdict that can be sent is a verdict that can be wrong.
- **Yes / no / unknown, never a checkbox.** "We did not ask" and "no" are different findings, and only one of them declines a candidate. An unknown is never counted as a kill.
- **A survivor missing frequency, elapsed minutes or a rate produces no figure at all.** A partial sum looks like an estimate and is one short.

The reckoning lives once, in `backend/skills/assessment5d.js`. The TypeScript port that used to sit in DigiFusion has been deleted along with the operator screens there — one instrument, one implementation, in the place that runs it. What remains on the public site is the client-facing page at `/agency/assessment`.

### 9. Curated knowledge
The Synthesizer ingests PDFs from R2 in bulk. `backend/knowledge/` is the other path: a source somebody read, judged worth keeping, and wrote up deliberately as knowledge units, landing in the same `knowledge_base` table so every agent reaches it through the same query. Nova's domains are `automation` and `general`, so an automation source put in `automation` is reachable by the specialist that needs it.

**Mechanisms and priors are not the same thing, and the row says which it is.** A *mechanism* is a way of working that can be applied and recommended. A *prior* is a figure from somebody else's clients — quotable with its source and its n, never presentable as our own result. The status is written into the metadata and into the tags, so an agent can exclude priors with a tag filter rather than by parsing jsonb. This distinction is the entire reason to curate rather than extract: an LLM pass over an article produces fluent paraphrase in which a mechanism and a borrowed number look identical.

**Ingest replaces, it never accumulates.** `ingestCurated()` deletes by source key and re-inserts, so editing the repo file and re-running replaces the table's copy. Three drifting copies of one claim are worse than none, because an agent finds one of them and has no way to know it is stale. `curatedStatus()` reads the table back and reports in-table against in-repo, which is how a half-applied ingest is caught.

```bash
npm run knowledge:ingest      # replace the table's copy with the repo's
npm run test:curated          # 20 checks, no database needed
```

`GET /api/agents/synthesizer/curated` reports the same status; `POST` runs the ingest.

The first source is a synthesis of Luke Pierce's account of running AI implementations (Boom Automations, 90+ engagements): the three-way classification of work into deterministic, judgment and decision; the four silo cost patterns and why AI amplifies them; the founder's map against the floor map; the investigation interview; quantifying pain in the client's own numbers; absorb / keep / kill; one write path per entity; data then workflows then intelligence; the three migration paths; adoption rate and the shadow spreadsheet; engagement signal; the five failure patterns; and the four post-launch loops. His figures are in one unit, tagged `prior`, ranked below every mechanism so they are not the first thing an agent finds.

### 9. The small-business lifecycle register
Every stage of the small-business path had a register and none of them had each other: the gate wrote to `readiness_gate`, the booking form to `intake_submission` and `booking`, the assessment to `assessment_5d`. Three tables, three screens, and no way to answer the only question a funnel is for. `backend/skills/lifecycle.js` stitches the chain that was already in the database:

```
readiness_gate.token
  → intake_submission.gate_token      (carried through the booking links)
    → booking.intake_id               (stamped by the Calendly receiver)
  → assessment_5d.gate_token          (pasted when the assessment starts)
```

One row per business, at the furthest stage it has reached: *declined at the gate, passed, intake started, session booked, assessment running, decided, outcome recorded.*

**Small businesses only, by construction.** The spine is `readiness_gate`, and the gate is only ever served to firms under fifty staff — everyone larger is routed into the twelve-question FrictionIQ instrument, a different register. (The boundary was ten until it was pointed out that ten is a British intuition: Nigeria's classification puts small at 10–49, and cutting there sent the method's best market away from its own door.) So this one cannot quietly fill with mid-market prospects and make both counts meaningless. An assessment with no gate token still appears, marked as having entered directly, because a client who arrived by introduction is still a real small business.

**It does not guess.** Where a stage has not happened there is a null, not an inference; a gate with no booking is not "lost", it may be three days old. A gate that declined and later booked anyway keeps its verdict in its own column rather than having it hidden by the progress. Counts are shown rather than rates until ten have passed the gate — a percentage of four is theatre. The four reads are settled rather than chained, so an unmigrated table costs that column and not the whole register.

**One trap worth knowing before you build another room.** `console.css` gives every `.cx-table` a `min-width` of 1060px, which is right for the FrictionIQ register in a full-width console. The Intelligence tab panel is a column flex container, so that floor does not stay inside the table — it becomes the minimum width of the room around it. On a 1280px CSS viewport (a 1080p screen at 150% Windows scaling) that forced the Five-Day board to 1112px and the panel's own overflow sliced the right-hand column off: every band looked broken and not one of them was. A room that uses `.cx-table` should give the table its own `min-width` floor and put `contain: inline-size` plus `overflow-x: auto` on the wrapper, so the floor scrolls inside the box instead of widening the room.

---

### 10. The unified engagement board and operating envelope

Two instruments, two registers — `assessment_5d` (five-day) and `frictioniq_engagement` (fourteen-day) — and one question asked of both: *which business, what stage, owned by whom, running which framework, for how much.* The operating envelope answers it.

**Six columns on both registers** (migration `0027_engagement_operating_envelope.sql`, in the DigiFusion repo): `assigned_agent`, `framework_id`, `recommendation`, `next_stage`, `service_amount`, `service_currency`. They are the operating view of data the instruments already produce — `recommendation` mirrors `first_build` / the deliverables, `next_stage` mirrors `decision` / the `kind` ladder, `service_amount` mirrors `first_build_cost` / `contract_value` — denormalised onto both tables so the board is a UNION of two identically-shaped projections, not a join through a third table.

**Routing is deterministic, not guessed.** `backend/skills/engagementRouting.js` maps the three practice areas to their specialist agent — automation → Nova, business development → Atlas, digital media → Aether — and the BD framework resolves regulation → segment → headcount band → Deal Engine. An unknown track returns nulls, never a default. Nexus is the Digital CEO and can override any assignment (the `operating` op, or `/api/agents/nexus/orchestrate`).

**Promotion stamps the envelope.** A five-day `proceed` (`backend/skills/assessment5d.js`) and an enterprise engagement's creation (DigiFusion `createEngagement`) resolve and write the route automatically; the `operating` op re-routes by hand when needed.

**Promotion also makes the amount real.** `backend/skills/promoteToDelivery.js` creates a `client_accounts` and an `engagements` row whose `contract_value` is the quoted `service_amount`, then the register's `engagement_id` (migration `0029`) is stamped back — so "amount" on the board becomes actual money rather than a note. The enterprise register (`frictioniq_engagement`) promotes through the same function; its `track` (migration `0028`) is the service line that drives the route.

**The loop closes.** A five-day `outcome` (day 90) writes a structured `engagement_outcomes` row; once ten `delivered` outcomes exist, the calibration engine flips `basis` from `prior` to `calibrated` automatically (`backend/harness/godmode/calibration.js`) — the declared priors become measurements. The board is self-service: each row's agent is an inline select that re-routes via `/api/engagements/board/op`.

**The board.** `GET /api/engagements/board` reads both registers into one projection; the `Engagements` tab (FrictionIQ department) renders it as one table, filterable by agent / unassigned.

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
| **Engagement board** | Operating envelope on both registers; deterministic routing; unified `Engagements` board |
| **Research pipeline** | Two-layer: Tavily discovery + Firecrawl full-content scraping; priority domains (McKinsey, BCG, HBR, etc.); pre-flight Tavily health check prevents burning quota against dead APIs |
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
| **Research quality gate** | `scoreResearchBrief()` — 10-dimension 0-100 scoring; grades A/B/C/D; failed briefs gated before reaching Boss |
| **Intelligent retry logic** | Nexus checks `tavilyDown` flag before re-running Orion — skips retry (escalates) when API is dead, re-runs deeper when content is thin |
| **Infrastructure escalation** | Critical-severity WhatsApp + Notion alerts when Tavily API is down (quota, expired key, rate-limit) — Boss knows what to fix |
| **Boss-facing research output** | Quality scorecard + raw brief shown together (not scorecard-only) — Boss can assess partial output usefulness |
| **Godmode Phase 1** | Agent harness: trace (SHA-256 audit), verify (chain gates), budget (ceilings), perimeter (namespace decorrelation) |
| **Godmode Phase 2** | Delivery leverage: exception harvest (4-field catalog), friction tax assembly (deterministic), three-ink classifier (reclassification rate) |
| **Godmode Phase 3** | Calibration at scale: engagement outcomes register, prior→calibrated flip at 10 pairs, divergence loop |
| **Godmode Phase 4** | Productised service: harness health diagnostic (0–100), governance charter generator (living document) |
| **Prompt library** | 72 prompts, 12 categories, 17 industry blocks, 9 clauses, 5 presets; composer with variable detection across the base text and any attached block |
| **Prompt registry** | Drafts, publish, revert-to-seed, per-prompt version history, usage recorded on copy, 30-day usage summary, registry health. 13 checks in `promptRegistry.test.mjs` |
| **Five-Day room** | The published board rendered as the room, with each client's work folded into the step it belongs to. The reckoning and its 15 checks live in `assessment5d.js` / `assessment5d.test.mjs` |
| **Lifecycle register** | Gate → intake → booking → assessment → decision → outcome, one row per business, small firms only by construction |
| **Readiness gate** | Seven questions (3 core + 4 calibration), any-zero declines. Rows live in the Five-Day lifecycle register, named by sector + headcount, with the blocked tests written out in plain English |
| **Intelligence nav** | Schedule removed — it is a content calendar and Blog Room already has one beside the posts it schedules |

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
| `POST` | `/api/agents/nova/exception-harvest` | Ingest tickets → 4-field deviation catalog (Phase 2) |
| `POST` | `/api/agents/nova/friction-tax` | Extract inputs → compute deterministic Friction Tax (Phase 2) |
| `POST` | `/api/agents/nova/three-ink` | Analyze flows → green/blue/red ink classification (Phase 2) |
| `POST` | `/api/agents/nova/three-ink/reclassify` | Record human reclassification → rate (Phase 2) |
| `GET` | `/api/agents/nova/three-ink/rate` | Aggregate reclassification rate (Phase 2) |
| `POST` | `/api/agents/nova/calibration/outcome` | Record a closed engagement's structured outcome (Phase 3) |
| `GET` | `/api/agents/nova/calibration/status` | Calibration state: basis, counts, by-band (Phase 3) |
| `POST` | `/api/agents/nova/calibration/compute` | Compute measured priors → flip basis (Phase 3) |
| `GET` | `/api/agents/nova/calibration/priors` | Active priors — measured or declared (Phase 3) |
| `GET` | `/api/agents/nova/calibration/divergence` | Self vs assessor score divergence (Phase 3) |
| `POST` | `/api/agents/nova/calibration/extract` | Agent-assisted outcome extraction (Phase 3) |
| `GET` | `/api/agents/nova/harness/health` | Score agent estate 0–100 (Phase 4) |
| `POST` | `/api/agents/nova/harness/charter` | Generate governance charter for a client (Phase 4) |
| `GET` | `/api/agents/nova/harness/charter/:id` | Retrieve a client's charter (Phase 4) |
| `GET` | `/api/agents/nova/harness/charter/:id/full` | Full charter as markdown (Phase 4) |
| `GET` | `/api/agents/nova/harness/charters` | List all active client charters (Phase 4) |

### Prompt library and registry

| Method | Endpoint | What it does |
|---|---|---|
| `GET` | `/api/prompts` | The library — prompts, categories, and each prompt's registry state |
| `GET` | `/api/prompts/blocks` | Industry blocks, clauses and clause presets |
| `POST` | `/api/prompts/compose` | Assemble base text + industry block + clauses + variables |
| `POST` | `/api/prompts/used` | Record one use. Called on copy, never on compose |
| `GET` | `/api/prompts/usage` | Usage summary (`?days=30`) |
| `GET` | `/api/prompts/:id/versions` | Version history for one prompt |
| `POST` | `/api/prompts/:id/draft` | Save a draft version |
| `POST` | `/api/prompts/:id/publish` | Publish a version — sets `live_version` |
| `POST` | `/api/prompts/:id/revert` | Clear `live_version`; the prompt falls back to the repo seed |

### Five-day assessment and the readiness gate

| Method | Endpoint | What it does |
|---|---|---|
| `GET` | `/api/frictioniq/assessments` | The assessment list |
| `GET` | `/api/frictioniq/assessment` | One assessment and its derived finding (`?id=`) |
| `POST` | `/api/frictioniq/assessment` | Start one (client, sector, country, currency, optional gate token) |
| `POST` | `/api/frictioniq/assessment/op` | Every write against an assessment — stage, observe, candidate, drop, price, report, decide, outcome, reference |
| `GET` | `/api/frictioniq/lifecycle` | The small-business funnel, gate to outcome (`?limit=`, capped at 1000) |
| `DELETE` | `/api/frictioniq/gate` | Remove a readiness-gate row and its intake / booking / assessment (`?token=`) |
| `GET` | `/api/engagements/board` | The unified operating board — both registers, one projection (`?limit=`, capped at 1000) |
| `POST` | `/api/engagements/board/op` | Re-route an engagement from the board — agent, framework, next stage |

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
| `prompt` | One row per operator prompt. `live_version` null means "use the repo seed" |
| `prompt_version` | Draft and published bodies, numbered per prompt, with a note and an actor |
| `prompt_usage` | One row per copy — prompt, industry, clauses, when |

If upgrading an existing deployment, also run:
```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dispatch_log JSONB;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
```

Then `supabase/0041_prompt_registry.sql` for the registry.

**Where the small-business tables live.** PathGuru and DigiFusion share one Supabase project, and the migrations for `readiness_gate`, `intake_submission`, `booking` and `assessment_5d` live in the DigiFusion repo (`supabase/migrations/0020`–`0024`) because that is where those rows are written from. PathGuru reads them. Apply them there and both consoles see the same funnel; skip one and the lifecycle register loses that column and says so, rather than failing whole.

---

## Godmode — Agent Harness Infrastructure

The four-phase build of DigiFusion's agentic consulting infrastructure — the operating layer that makes an agent estate auditable. **Agents draft; humans dispose. The harness is the product.**

### Architecture

```
backend/harness/
├── trace.js          Phase 1 — Per-run cryptographic audit trail
├── verify.js         Phase 1 — Verification gates between chain steps (max 3 unverified)
├── budget.js         Phase 1 — Token/cost/step ceilings per run
├── perimeter.js      Phase 1 — Agent namespace access control (decorrelation device)
└── godmode/
    ├── exceptionHarvest.js   Phase 2 — 2-step: tickets → 4-field deviation catalog
    ├── frictionTaxAgent.js   Phase 2 — 2-step: extract inputs → deterministic compute
    ├── threeInkClassifier.js Phase 2 — 3-step: flows → green/blue/red + reclassification rate
    ├── calibration.js        Phase 3 — Engagement outcomes → measured priors → divergence
    ├── harnessHealth.js      Phase 4 — Agent estate health diagnostic (0–100)
    └── harnessCharter.js     Phase 4 — Governance charter generator (living document)
```

### Phase 1 — The Harness (built)

| Piece | Module | What it does |
|---|---|---|
| Trace | `trace.js` | Every agent invocation writes one row: run id, agent, step index, input hash (SHA-256), output hash, tokens, cost, duration, verdict |
| Verify | `verify.js` | Chains longer than 3 steps without a verification gate are rejected at the orchestration layer. Check types: schema, range, citation, non_empty, custom |
| Budget | `budget.js` | Token, cost ($), and step ceilings per run. Breach = abort, not degrade |
| Perimeter | `perimeter.js` | Which agent may read which knowledge namespace. Success test: a poisoned KB entry damages exactly one agent, not all seven |

### Phase 2 — Delivery Leverage (built)

| Agent Chain | Steps | Verification |
|---|---|---|
| **Exception Harvest** | 2 | schema + non_empty gates between steps |
| **Friction Tax Assembly** | 2 | schema gate on inputs; compute is deterministic (no LLM) |
| **Three-Ink First Pass** | 3 | schema + non_empty gates; reclassification rate tracked forever |

Key metric: `reclassification_rate` — the share of agent ink proposals the consultant changed. Written to the trace table from day one.

### Phase 3 — Calibration at Scale (built)

| Capability | What it does |
|---|---|
| **Outcomes Register** | `engagement_outcomes` table — self-score, assessor score, Friction Tax result, ink distribution, realised payback per closed engagement |
| **Prior → Calibrated Flip** | At ≥10 delivered outcomes, replaces declared `BAND_PRIORS` in `commitment.ts` with measured rates. `basis` flips from `'prior'` to `'calibrated'` |
| **Divergence Loop** | Self-score vs assessor score per band, per sector. Ten pairs gives a defensible correction factor |

### Phase 4 — The Productised Service (built)

| Product | What it is |
|---|---|
| **Harness Health Diagnostic** | Scores an agent estate 0–100 across trace completeness, verification coverage, budget discipline, and perimeter integrity. Same band scale as FrictionIQ (opaque → engineered) |
| **Governance Charter** | Generated markdown document: named governor, error budget, verification policy, perimeter map, trace retention. Living artifact — regenerates from live estate state |

Every firm deploying automation eventually needs these four instruments. Almost nobody sells them — retainer line, not project line.

### DB Migrations

| # | Tables | Phase |
|---|---|---|
| `0019_agent_harness` | `agent_traces`, `agent_budgets`, `agent_permissions`, `verification_log` | 1 |
| `0020_phase2_delivery` | `exception_catalog`, `friction_tax_runs`, `ink_classifications` | 2 |
| `0021_phase3_calibration` | `engagement_outcomes`, `calibration_state` | 3 |
| `0022_phase4_harness_product` | `client_charters` | 4 |



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
    ├── formatting.js           Output formatting
    ├── promptRegistry.js       Versions, publish, revert, usage, health. Repo is the floor
    ├── promptRegistry.test.mjs 13 checks against a Supabase-shaped double
    ├── assessment5d.js         The five-day reckoning — three tests, first failure decides
    ├── assessment5d.test.mjs   15 checks, including that an unknown is not a kill
    ├── lifecycle.js            Gate → intake → booking → assessment, one row per business
    ├── curatedKnowledge.js     Ingest curated sources; replaces by source key, never accumulates
    └── curatedKnowledge.test.mjs  20 checks, including that priors stay labelled as priors

backend/knowledge/
└── implementation-method.js    Running an AI implementation — mechanisms and priors, kept apart

backend/prompts/
├── library.js                  72 prompts in 12 categories
├── industries.js               17 industry blocks, each with its own variables
├── clauses.js                  9 clauses, 5 presets
├── compose.js                  Assembly: base + block + clauses + variables
└── index.js                    The module's front door

webapp/
├── index.html                  Three-module shell (Publishing, Blog, Shop + Agent Console)
├── app.js                      State engine + module routing
├── agents.js                   Agent console UI — task dispatch + per-agent chat panels
├── blog.js                     Blog UI
├── shop.js                     Shop UI
├── digifusion-chat-widget.js   Vanilla JS embeddable chat widget (standalone alternative)
├── style.css                   Webapp styles (includes agent chat bubble UI)
├── js/prompt-library.js        Prompt Library room — composer, versions, usage
├── js/fiveday-playbook.js      The published board as data, transcribed verbatim
├── js/fiveday-room.js          Renders the board; the register lives inside it
├── css/prompt-library.css      Prompt Library room styles
└── css/fiveday-room.css        Five-Day room — the board's layout in console tokens

supabase/
├── 001_agent_network.sql       Full schema for the agent network
└── 0041_prompt_registry.sql    prompt, prompt_version, prompt_usage
```

---

## Operator authentication — read this before deploying

**Every route under `/api/` now requires an operator session.** Until August
2026 this server had no authentication at all: `GET /api/frictioniq/sessions`
returned prospect names, emails, organisations and countries to anyone who
asked, and `Access-Control-Allow-Origin: *` meant any website could read the
register out of a visitor's browser. The same was true of `/api/clients`,
`/api/invoices`, `/api/purchases` and about a hundred other routes.

The gate lives in `backend/http/operatorAuth.js` and it **fails closed**: with
no password configured, protected routes return 503 and nobody gets in —
including you. That is the correct failure for a register of personal data.

```bash
# REQUIRED. Without it the console is closed to everyone.
PATHGURU_OPERATOR_PASSWORD=      # 24+ random characters

# Optional. A separate signing key, so the password can be rotated without
# invalidating live sessions (or the reverse). Defaults to the password, which
# means changing the password signs everyone out immediately.
PATHGURU_OPERATOR_SECRET=

# Optional. Session lifetime in hours. Default 12.
PATHGURU_SESSION_HOURS=12

# Optional. For machines — scripts, server-to-server calls — that have no
# cookie jar. Sent as `Authorization: Bearer <token>`.
PATHGURU_OPERATOR_TOKEN=

# Optional. Comma-separated CORS allowlist, replacing the old wildcard.
# Defaults to localhost:3000, localhost:8787 and digitafusion.com.
# A wildcard is not an option here: the API carries a session cookie, and the
# specification forbids `*` with credentialed requests. That rule is the
# browser telling you something true.
PATHGURU_ALLOWED_ORIGINS=https://digitafusion.com,https://www.digitafusion.com
```

**What stays public, and why.** `/ping`, `/health` and `/api/cron/ping` for
uptime monitors; `/api/platform/config` for the webapp's boot; `/api/auth/*`
because it is the door; `/api/agents/status` because digitafusion.com's agent
widget calls it from the browser and it carries no personal data; the newsletter
unsubscribe and NPS endpoints because the recipient of an email has no session
and never will; and the third-party webhooks, which carry their own
verification. `/api/cron/*` is excluded from this gate because it already has
one — `CRON_SECRET`, in `backend/http/cronAuth.js`. Everything else is denied by
default, so a route added next month is protected the moment it is written.

Verify the allowlist after adding any route:

```bash
node backend/http/operatorAuth.test.mjs     # 48 assertions, exits non-zero on failure
```

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
CALENDLY_BOOKING_URL=https://calendly.com/digitafusion-strategy-session/30min

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
