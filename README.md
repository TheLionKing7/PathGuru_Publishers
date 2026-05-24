# PathGuru Publishers v3

**The command centre for the DigiFusion Intelligence Library and a standalone AI publishing studio.**

PathGuru is the kitchen. DigiFusion is the storefront. Books, blog posts, products, services, and payments pass through PathGuru first and land on DigiFusion for customers to read or buy.

Three modules in one webapp:

- **Publishing** — brief → KDP-ready PDF + EPUB with project branding, design templates, and a PDF learning library
- **Blog** — persona-driven AI blog posts published to WordPress, Ghost, Webflow, or directly to DigiFusion's blog and Intelligence Library
- **Shop** — operator console for the DigiFusion storefront: products (Field Guides, Playbooks, Tools), orders, subscriptions, bookings, payments, T&C, shipping, analytics

### DigiFusion site architecture (for context)

```
Blog (attract)  →  Intelligence (convert)  →  Products (retain)  →  Agency (upsell)
```

| DigiFusion section | Routes | What PathGuru publishes here |
|---|---|---|
| Blog | `/blog`, `/blog/:slug` | AI-written blog posts (all types) |
| Intelligence | `/intelligence/field-guides` | Premium books + ebooks |
| Intelligence | `/intelligence/playbooks` | Automation workflow packs |
| Intelligence | `/intelligence/research` | Research papers + case studies |
| Intelligence | `/intelligence/tools` | Extensions + utilities |
| Products | `/products/sabiwork` | SabiWork SaaS product page |
| Products | `/products/receptra` | Receptra SaaS product page |
| Products | `/products/adpilot` | AdPilot SaaS product page |

---

## Project status

### Done

| Area | What was built |
|---|---|
| DigiFusion site | Full site including blog, Intelligence hub + 4 sub-pages, Products hub + 3 product landing pages, Agency, About, sitemap, schema |
| DigiFusion blog post page | White-card layout, prose-blog-light CSS, ToC sidebar, PathGuru meta element suppression |
| DigiFusion CMS API | 15+ endpoints under `/api/cms/*` including PATCH for publish/unpublish |
| Database | Supabase — `posts`, `products`, `orders`, `subscriptions`, `service_bookings`, `settings` tables |
| PathGuru → DigiFusion | `backend/cmsClient.js` — fetch wrapper with bearer auth, retry logic, all methods including `publishPost` / `unpublishPost` |
| Blog publish — bug fixes | Post type now correctly preserved (not defaulting to "article"); author name uses `input.author` not hardcoded fallback; social captions removed from HTML |
| Blog dashboard | Routes in `server.js` now proxy through `cmsClient.js` (not direct Supabase) — resolves 500 errors on Render |
| Shop module | All 6 Shop tab buttons wired via `webapp/shop.js` → PathGuru backend proxy → DigiFusion CMS API; product form CSS + responsive breakpoints added |
| Persona system | `GET /api/personas` endpoint live; persona injected into Gemini prompt at generation time |
| Navigation | DigiFusion nav updated: Shop → Intelligence (with sub-menu) + Products (with sub-menu per product) |

### Pending / known gaps

- **Checkout flow** — orders exist in the DB; the buyer-facing checkout (payment gateway integration, order creation) is not built.
- **Intelligence product sales** — Field Guides and Tools pages are built; payment flow for purchasing them is not yet wired.
- **Persona injection for Publishing (books)** — `injectPersonaIntoPrompt()` is connected to blog generation but not to the book pipeline (`designGuru.js`).
- **SabiWork / Receptra / AdPilot** — SaaS products in development; landing pages live with Early Access CTA only.

---

## Get it running

```bash
npm install
cp .env.example .env   # fill in at minimum GEMINI_API_KEY
node backend/server.js
```

Open `webapp/index.html` in a browser. Set the backend URL to `http://localhost:8787` in Settings the first time.

---

## Environment variables

```bash
# Required
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash        # default

# Optional — stock imagery
PEXELS_API_KEY=...

# Optional — research during Brief stage
TAVILY_API_KEY=...

# Optional — cloud storage for PDFs and blog media
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_URL=https://cdn.your-domain.com

# DigiFusion integration — required for Shop + Blog publish to DigiFusion
DIGIFUSION_API_URL=https://www.digitafusion.com
DIGIFUSION_CMS_TOKEN=...             # must match PATHGURU_CMS_TOKEN in DigiFusion Vercel env

# Payments — for refund processing
FLW_SECRET_KEY=...                   # Flutterwave
STRIPE_SECRET_KEY=...                # Stripe (add when ready)

# Server
PORT=8787
```

---

## Architecture

```
PathGuru_Publishers_v3/
├── backend/
│   ├── server.js               HTTP server — all routes including /api/personas + /api/shop/* proxies
│   ├── blogPublisher.js        Blog generation (Gemini) + persona injection + publish to WP/Ghost/Webflow/DigiFusion
│   ├── cmsClient.js            DigiFusion CMS API client (bearer auth, retry)
│   ├── designGuru.js           Book pipeline — niche → design package
│   ├── supabaseClient.js       PathGuru's own Supabase client (internal use only — not used for blog dashboard on Render)
│   └── skills/
│       ├── personas.js         4 persona profiles — The Copy Desk, Marketing Desk, Engineering Bench, Strategy Room
│       ├── personaPrompt.js    injectPersonaIntoPrompt() — merges persona voice + samples into Gemini prompt
│       ├── editorial.js        buildBlogPrompt() — base blog prompt builder
│       └── research.js         Tavily search
│
└── webapp/
    ├── index.html              Three-module shell
    ├── app.js                  State engine + module/tab routing
    ├── blog.js                 Blog UI — persona picker (loads from /api/personas), generate, dashboard
    └── shop.js                 Shop UI — all 6 tab buttons wired to /api/shop/* proxies
```

---

## DigiFusion integration

```
PathGuru webapp  →  PathGuru backend  →  DigiFusion CMS API  →  Supabase
                    (holds CMS token)     (verifies token)
```

PathGuru never touches DigiFusion's Supabase directly — only one bearer token crosses the boundary.

### CMS endpoints

| Method | Endpoint | Used by |
|---|---|---|
| `POST` | `/api/cms/posts` | Blog → publish to DigiFusion |
| `GET` | `/api/cms/posts` | Blog → dashboard |
| `GET` | `/api/cms/posts/:slug` | Blog → single post |
| `DELETE` | `/api/cms/posts/:slug` | Blog → archive |
| `GET` | `/api/cms/products` | Shop → payments |
| `POST` | `/api/cms/products` | Shop → create product |
| `PUT` | `/api/cms/products/:id` | Shop → update product |
| `GET` | `/api/cms/orders` | Shop → payments |
| `POST` | `/api/cms/orders/:id/mark-paid` | Shop → payments |
| `POST` | `/api/cms/orders/:id/refund` | Shop → payments |
| `GET` | `/api/cms/subscriptions` | Shop → subscriptions |
| `GET` | `/api/cms/bookings` | Shop → bookings |
| `GET` | `/api/cms/analytics` | Shop → analytics |
| `PUT` | `/api/cms/settings/terms` | Shop → T&C |
| `PUT` | `/api/cms/settings/shipping` | Shop → shipping |

### Setup

1. Generate a shared secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Set it as `PATHGURU_CMS_TOKEN` in Vercel (DigiFusion)
3. Set the same value as `DIGIFUSION_CMS_TOKEN` in PathGuru `.env`
4. Set `DIGIFUSION_API_URL=https://www.digitafusion.com` in PathGuru `.env`

---

## The persona system

Four built-in personas covering the recurring blog archetypes. Selected in the Blog → Assets → Voice & Persona tab. The chosen persona is injected into the Gemini prompt at generation — voice descriptor in the system block, few-shot writing samples before the task instructions.

| ID | Display name | Best for |
|---|---|---|
| `senior_editor` | The Copy Desk | Any post type — adapts structure to format conventions (listicles, guides, how-tos, reviews) |
| `marketing_desk` | The Marketing Desk | Paid acquisition, funnels, brand growth, creative strategy |
| `engineering_bench` | The Engineering Bench | AI/LLM ops, agent design, automation, technical how-tos |
| `strategy_room` | The Strategy Room | Founder notes, operations, hiring, business strategy |

To add a persona: edit `backend/skills/personas.js` and add a new entry to `PERSONA_PROFILES`. It will appear in the picker automatically on next page load (fetched from `GET /api/personas`).

---

## Deployment

Backend → Render (`render.yaml` is in the repo). Webapp → any static host (Vercel, Cloudflare Pages, GitHub Pages). Set the backend URL in the webapp Settings panel.

---

## License

Private. All rights reserved.
