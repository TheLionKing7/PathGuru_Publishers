# PathGuru Publishers v3

**The command centre for the DigiFusion storefront and a standalone AI publishing studio.**

PathGuru is the kitchen. DigiFusion is the storefront. Books, blog posts, products, services, and payments pass through PathGuru first and land on DigiFusion for customers to read or buy.

Three modules in one webapp:

- **Publishing** — brief → KDP-ready PDF + EPUB with project branding, design templates, and a PDF learning library
- **Blog** — persona-driven AI blog posts, published to WordPress, Ghost, Webflow, or directly to DigiFusion
- **Shop** — operator console for the DigiFusion storefront: subscriptions, bookings, payments, T&C, shipping, analytics

---

## Project status

### Done

| Area | What was built |
|---|---|
| DigiFusion site | Strategy Session landing page (`/agency/booking`), Four Pillars + Digital Media card, social links (Facebook, Twitter/X, Quora, email) |
| DigiFusion CMS API | 15 endpoints under `/api/cms/*` — posts, products, orders (mark-paid, refund), subscriptions, bookings, analytics, settings (terms, shipping) |
| Database | Supabase migration `0002_posts_and_settings.sql` — `posts` table (with RLS) and `settings` table (seeded with `terms` and `shipping` keys) |
| PathGuru → DigiFusion | `backend/cmsClient.js` — fetch wrapper with bearer auth, retry logic, all 15 methods |
| Blog publish | DigiFusion added as a 4th publish target alongside WordPress, Ghost, Webflow |
| Shop module | All 6 Shop tab buttons wired via `webapp/shop.js` → PathGuru backend proxy → DigiFusion CMS API |
| Persona system | `GET /api/personas` endpoint live; persona injected into Gemini prompt at generation time; picker auto-populates from backend on load |

### Pending / known gaps

- **DigiFusion `/blog` page** — PathGuru can publish posts to the `posts` table; nothing renders them publicly yet. Needs a Next.js page that reads published posts from Supabase.
- **Checkout flow** — orders exist in the DB; the buyer-facing checkout (payment gateway integration, order creation) is not built.
- **Products UI** — products can be created/updated via the CMS API; no admin UI in PathGuru for it yet.
- **Persona injection for Publishing (books)** — `injectPersonaIntoPrompt()` is connected to blog generation but not to the book pipeline (`designGuru.js`).

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
│   ├── supabaseClient.js       PathGuru's own Supabase client (blog_posts table for internal drafts)
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
