# PathGuru Publishers

**The command center for the DigiFusion storefront and a standalone AI publishing studio.**

PathGuru is the kitchen. DigiFusion is the storefront. Anything that gets written, designed, priced, scheduled, or sold passes through PathGuru first — books, blog posts, products, services, subscriptions — and lands on DigiFusion for customers to read or buy.

It runs as one webapp with three modules:

- **Publishing** — turn a one-paragraph brief into a KDP-ready PDF and EPUB, with project-specific branding, design templates, and an agent that learns from a PDF library you upload
- **Blog** — write, persona-pick, preview, and ship posts to WordPress, Ghost, and (via the CMS API) directly to DigiFusion's `/blog`
- **Shop** — manage DigiFusion's storefront from one place: subscriptions, service bookings, payments, T&Cs, shipping, sales analytics

---

## TL;DR — get it running in 5 commands

```bash
git clone https://github.com/your-org/PathGuru_Publishers_v3.git
cd PathGuru_Publishers_v3
npm install
npx playwright install --with-deps chromium   # one-time, ~300 MB
cp .env.example .env && $EDITOR .env          # fill in keys (Gemini at minimum)
npm run dev
```

Then open `webapp/index.html` in a browser. The backend serves on `http://localhost:8787` by default; the webapp talks to it over CORS.

The only required key is one AI provider (Gemini is free at aistudio.google.com). Everything else is optional and unlocks more features.

---

## The three modules

### Publishing
Writes a complete nonfiction book from a brief. The pipeline:

1. **Brief** — you describe the topic, audience, outcome, voice, format
2. **Research** — Tavily (if `TAVILY_API_KEY` is set) pulls live web sources; otherwise an internal brief is used
3. **Editorial agent** — drafts the manuscript with structured `designIntent` per section
4. **Design pass** — picks palette/typography/rhythm based on niche
5. **Formatting** — renders KDP-compliant HTML with embedded Playfair Display + DM Sans
6. **Export** — Playwright generates the PDF; EPUB exporter packages the ebook; KDP compliance check runs; optional upload to Cloudflare R2

The **Assets** sub-tab gives the agent three sources of design guidance:
- *Project branding* — logo, palette, cover image, character references for this specific book
- *PDF Templates* — pre-built design templates the agent uses as layout anchors (Modern Business, Editorial Luxe, Wellness Warmth, Technical Bench)
- *Learning Library* — PDFs you upload as training material; the agent extracts house style from them

### Blog
End-to-end blog post pipeline. Pick a persona, give it a topic and post type, and it drafts a 1–3k-word post with SEO meta, social captions, and OG image suggestions.

- **Compose** — the brief form + generation + the existing Generate/Dashboard switcher for managing drafts
- **Assets** — brand identity (logo, brand-strategy PDF), voice & persona (the master prompts below), and house style guide

Publish targets: WordPress, Ghost, and **DigiFusion via the CMS API** (see [DigiFusion integration](#digifusion-integration) below).

### Shop
Operator console for the DigiFusion storefront. Six sub-tabs:
- *Subscriptions* — active subscribers, plans, MRR, churn
- *Bookings* — service bookings created at checkout with intake/calendar links
- *Payments* — orders across Stripe, Flutterwave, OPay; mark-paid, refund, re-run fulfillment
- *T&C* — refund, terms, privacy — published to DigiFusion's `/terms`
- *Shipping* — carrier, lead time, flat rate, free-shipping threshold, zones
- *Analytics* — revenue, orders, AOV, conversion, top SKUs

All Shop tabs operate on DigiFusion's `shop_*` Supabase tables via the CMS API.

---

## The persona system

Personas are stable author identities the AI imitates. Each persona has:
- A display name, title, avatar, and bio
- A `voice` descriptor (tone, stance)
- A `rhythm` descriptor (sentence pacing)
- A `vocabulary` list (phrases the author naturally reaches for)
- A `banList` (clichés the author would never use)
- 2–3 sample paragraphs the model imitates

The Blog Assets > Voice & Persona tab exposes four built-in personas covering the recurring blog archetypes:

| Persona | Domain |
|---|---|
| **AI Automation & Systems Engineering Specialist** | LLM-ops, agent design, automation, MLOps |
| **Award-winning Digital Media & Marketing Expert** | Paid acquisition, brand growth, creative strategy |
| **Senior Copywriter / Editor** | House editorial voice — default for reviews, listicles, roundups |
| **Operator & Founder Notes** | Strategy, hiring, operations, founder POV |

You pick the persona manually per post. The selection is captured by `injectPersonaIntoPrompt()` (in `backend/skills/personaPrompt.js`) and merged into the final prompt sent to the model — voice descriptor in the system message, few-shot samples at the top of the user message.

To add or edit a persona, see `backend/skills/personas.js`.

---

## Architecture

```
PathGuru_Publishers_v3/
├── backend/                    Node 18+ HTTP server (no framework)
│   ├── server.js               Routing, CORS, health check, /api/* endpoints
│   ├── aiPipeline.js           Provider abstraction (Gemini / Cerebras / DeepSeek)
│   ├── blogPublisher.js        Blog generation + publish to WP/Ghost/DigiFusion
│   ├── designGuru.js           Niche → design package
│   ├── exporter.js             PDF + EPUB generation
│   ├── kdpCompliance.js        KDP profile checks
│   ├── pexelsAssets.js         Stock-image search + upload to R2
│   ├── cloudflareR2.js         R2 client
│   ├── fontEmbedder.js         Inlines Playfair + DM Sans as base64
│   ├── fonts/                  TTF binaries
│   ├── skills/                 Domain skills used by the pipeline
│   │   ├── editorial.js        Niche personality profiles + prompt builder
│   │   ├── research.js         Tavily search
│   │   ├── formatting.js       HTML formatter
│   │   ├── personas.js         Persona registry (master prompts)
│   │   └── personaPrompt.js    Persona injection helpers
│   └── supabaseClient.js       DigiFusion DB client (when integration enabled)
│
├── webapp/                     Static frontend (vanilla JS, no build step)
│   ├── index.html              Three-module shell (Publishing / Blog / Shop)
│   ├── style.css               Dark editorial design system
│   ├── app.js                  State-driven UI, module + sub-tab routing
│   └── blog.js                 Blog-specific UI logic
│
├── extension/                  Optional browser clipper (research only)
│   └── clipper.html
│
├── render.yaml                 Render deployment manifest
├── MASTER_PLAN.md              Architectural rebuild plan (historical)
├── SETUP.md                    Original setup walkthrough
└── README.md                   This file
```

Frontend → backend talks over plain HTTP. Backend → AI providers talks over HTTP. Backend → DigiFusion talks over HTTPS using the CMS API (bearer token auth).

---

## Environment variables

Create `.env` in the project root.

```bash
# ── Required: at least one AI provider ─────────────────────────
# Free tier at aistudio.google.com
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash       # optional, this is the default

# Optional alternates — set AI_PROVIDER to pick
CEREBRAS_API_KEY=...
DEEPSEEK_API_KEY=...
AI_PROVIDER=gemini                  # gemini | cerebras | deepseek

# ── Optional: research ────────────────────────────────────────
TAVILY_API_KEY=...                  # web search during the Brief stage

# ── Optional: stock imagery ───────────────────────────────────
PEXELS_API_KEY=...

# ── Optional: cloud storage ───────────────────────────────────
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_URL=https://cdn.your-domain.com

# ── DigiFusion integration (Shop + Blog publish) ──────────────
DIGIFUSION_API_URL=https://www.digifusion.com
DIGIFUSION_CMS_TOKEN=...            # shared bearer token (see below)

# ── Server ────────────────────────────────────────────────────
PORT=8787
```

---

## Development

```bash
npm run dev          # hot-reads .env, starts the backend on :8787
npm run check        # syntax check the backend without booting
npm test             # run the skill unit tests
```

Open `webapp/index.html` in a browser, or serve `webapp/` with any static server (`python -m http.server 5500` etc.). Set the backend URL in **Settings** the first time you open it.

The webapp is dependency-free and has no build step — edit, save, refresh.

---

## Deployment

**Backend** runs on Render. The shipped `render.yaml` provisions a free web service. Set all the env vars above in the Render dashboard. The `npm run install-playwright` step is part of the build command.

**Webapp** is a static folder. Host on Vercel, Cloudflare Pages, GitHub Pages — whatever — and point it at the Render URL in Settings.

---

## DigiFusion integration

PathGuru is decoupled from DigiFusion via a small **CMS API** that DigiFusion exposes. PathGuru never knows DigiFusion's Supabase keys — only the domain and a bearer token.

### How it works

```
PathGuru webapp  →  PathGuru backend  →  DigiFusion CMS API  →  Supabase
                    (holds CMS token)     (verifies token)
```

PathGuru calls these DigiFusion endpoints with header `Authorization: Bearer ${DIGIFUSION_CMS_TOKEN}`:

| Endpoint | Used by | Purpose |
|---|---|---|
| `POST /api/cms/posts` | Blog → Publish | Create or update a blog post |
| `GET  /api/cms/posts` | Blog → Dashboard | List existing posts |
| `GET  /api/cms/products` | Shop → Payments | Read product catalog |
| `POST /api/cms/products` | Shop (admin) | Create/update a product |
| `GET  /api/cms/orders` | Shop → Payments | List orders |
| `POST /api/cms/orders/:id/mark-paid` | Shop → Payments | Manual mark-paid |
| `POST /api/cms/orders/:id/refund` | Shop → Payments | Process refund |
| `GET  /api/cms/subscriptions` | Shop → Subscriptions | Active subscribers |
| `GET  /api/cms/bookings` | Shop → Bookings | Service bookings |
| `GET  /api/cms/analytics?range=30d` | Shop → Analytics | Revenue, orders, AOV, conversion |
| `PUT  /api/cms/settings/terms` | Shop → T&C | Publish T&Cs to `/terms` |
| `PUT  /api/cms/settings/shipping` | Shop → Shipping | Save shipping rules |

### Setup

1. On DigiFusion, set a strong random string as `PATHGURU_CMS_TOKEN` in Vercel env vars.
2. On PathGuru, set `DIGIFUSION_CMS_TOKEN` to the same string and `DIGIFUSION_API_URL` to your DigiFusion deployment URL.

That's the whole handshake. Rotating the token = update both envs.

### Why this approach

- **Separation of concerns.** PathGuru can be replaced, rewritten, or run by a different team without ever touching DigiFusion's database.
- **Auditability.** Every PathGuru→DigiFusion call is a logged HTTP request with a clear contract.
- **Safer secrets surface.** PathGuru holds one token, not a database service-role key.
- **Multiple PathGuru instances.** If you ever want a staging PathGuru or a per-brand PathGuru, they all hit the same CMS API.

---

## Roadmap & known gaps

Tracked in the task list; current open items:

- Wire `injectPersonaIntoPrompt()` into the Publishing editorial pipeline so the picked persona influences the book draft (it already works for blog posts)
- Persona picker dropdown auto-syncs from `GET /api/personas` on PathGuru backend
- The CMS API endpoints on DigiFusion (currently being built)
- PathGuru-side CMS client (`backend/cmsClient.js`) — fetch wrapper with bearer auth + retry

---

## Project status

This is research-phase software. The architecture is stable; the wiring between modules and DigiFusion is being completed in iterative passes. Treat it as a working prototype that you can ship from, not a finished product.

---

## License

Private. All rights reserved.
