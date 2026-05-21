# Continuation Prompts

Paste any of these into a fresh Claude session to resume work without re-explaining the project.

---

## 1 — MASTER PROMPT (use when you want to continue broadly)

```
I'm continuing work on PathGuru Publishers — a Node webapp that serves as the
command center / CMS for my DigiFusion storefront. Two repos on my Windows
machine:

  • PathGuru (kitchen):   C:\Users\DELL\Documents\WorkSpace\Frastructure\PathGuru_Publishers_v3
  • DigiFusion (store):   C:\Users\DELL\Documents\WorkSpace\Frastructure\digifusion

PathGuru is the operator console; DigiFusion is the public-facing Next.js app
(deployed to Vercel) where customers actually read blogs and buy products.

ARCHITECTURE
PathGuru webapp has three modules in a left sidebar:
  Publishing  →  Brief / Assets / Export   (PDF + EPUB pipeline)
  Blog        →  Compose / Assets          (post generator + brand identity + voice/persona + style guide)
  Shop        →  Subscriptions / Bookings / Payments / T&C / Shipping / Analytics
Each module shell has the panel-header at the TOP, then a sub-tab strip (.module-topnav)
below it, then the content. Sub-tab routing uses data-subtab / data-for pairing.

DigiFusion integration is Path B: a CMS API. PathGuru never holds DigiFusion's
Supabase keys — only DIGIFUSION_API_URL and a shared bearer token
DIGIFUSION_CMS_TOKEN. PathGuru → DigiFusion endpoints live under /api/cms/* on
the DigiFusion side. See README.md > "DigiFusion integration" for the endpoint table.

PERSONAS
backend/skills/personas.js holds the persona registry (engineering_bench,
marketing_desk, senior_editor, strategy_room). backend/skills/personaPrompt.js
exposes injectPersonaIntoPrompt({persona, system, user}) which composes voice
descriptor into the system message and few-shot samples into the user message.
Persona pick is manual (no auto-routing).

DONE recently:
  • Sidebar restructured to 3 modules with sub-tabs BELOW panel-header
  • Publishing Assets redefined: Project branding / PDF Templates / Learning Library
  • Blog Assets: Brand Identity (with file uploads), Voice & Persona (3 master
    personas hardwired), Style Guide
  • Shop module skeleton with 6 tabs (empty states, awaiting CMS wiring)
  • Stripe apiVersion fix + /shop force-dynamic on DigiFusion side
  • README.md (read it first to get oriented)

OPEN tasks (priority order):
  1. DigiFusion CMS endpoints (app/api/cms/* — posts, products, orders,
     mark-paid, subscriptions, bookings, analytics, settings) with bearer auth
  2. PathGuru cmsClient.js (fetch wrapper with named methods)
  3. Wire Blog Compose "Publish to DigiFusion" target → cmsClient.publishPost()
  4. Wire all 6 Shop tab buttons → corresponding cmsClient methods
  5. Wire injectPersonaIntoPrompt() into aiPipeline.js so the picked persona
     also influences PDF book generation (currently only blog uses it)
  6. /api/personas endpoint + live picker sync (currently hardcoded options)

CONSTRAINTS the user cares about:
  • Robust = uniform { ok, data } / { ok, error, code } response shape; idempotent
    mutations; retry on 5xx
  • Easy to use = named cmsClient methods, no manual URL building in handlers
  • Easy to maintain = all CMS routes in one folder; one shared requireCmsToken
    helper; endpoint table in README is source of truth

Read PathGuru's README.md and check the task list first. Then ask me which
of the open tasks to start with — or, if it's obvious, just propose a plan
and start. I prefer you confirm direction before big refactors.
```

---

## 2 — DIGIFUSION CMS API BUILD (immediate next step)

```
Continuing the PathGuru ↔ DigiFusion integration. Path B is chosen: build a
CMS API on the DigiFusion side that PathGuru calls with a bearer token.

REPOS
  PathGuru:   C:\Users\DELL\Documents\WorkSpace\Frastructure\PathGuru_Publishers_v3
  DigiFusion: C:\Users\DELL\Documents\WorkSpace\Frastructure\digifusion

DigiFusion is Next.js App Router with Supabase. The shop_* tables and posts
table already exist. Auth pattern: existing app/api/admin/* routes use HTTP
Basic via lib/admin/auth.ts (requireAdmin). Mirror that pattern with a new
lib/cms/auth.ts (requireCmsToken) that checks Authorization: Bearer
${process.env.PATHGURU_CMS_TOKEN}.

BUILD THIS (in order):

1. lib/cms/auth.ts — requireCmsToken(req) helper. Returns null on success,
   NextResponse with 401/503 on failure. 503 if PATHGURU_CMS_TOKEN env not set
   (same defensive pattern as ADMIN_PASSWORD).

2. lib/cms/respond.ts — uniform response helpers:
     ok(data, init?)          → NextResponse.json({ ok: true, data }, init)
     fail(code, error, status?)→ NextResponse.json({ ok: false, code, error }, { status })

3. Endpoints under app/api/cms/ — each route.ts is small, calls requireCmsToken
   first, validates body with Zod, then uses existing helpers in lib/shop/* or
   lib/blog/*. All return via ok()/fail(). All POST/PUT routes are idempotent
   (re-posting same slug = update; mark-paid on already-paid = no-op + re-run
   fulfillment).

   Routes:
     POST   app/api/cms/posts/route.ts                  create/update blog post (by slug)
     GET    app/api/cms/posts/route.ts                  list posts (paginated)
     GET    app/api/cms/posts/[slug]/route.ts           single post
     DELETE app/api/cms/posts/[slug]/route.ts           soft-delete
     GET    app/api/cms/products/route.ts               list
     POST   app/api/cms/products/route.ts               create
     PUT    app/api/cms/products/[id]/route.ts          update
     GET    app/api/cms/orders/route.ts                 list w/ filters
     POST   app/api/cms/orders/[id]/mark-paid/route.ts  reuses existing fulfillment
     POST   app/api/cms/orders/[id]/refund/route.ts     refund via gateway
     GET    app/api/cms/subscriptions/route.ts          active subs + MRR + churn
     GET    app/api/cms/bookings/route.ts               service bookings
     GET    app/api/cms/analytics/route.ts              ?range=30d → revenue/orders/AOV/conv
     PUT    app/api/cms/settings/terms/route.ts         publish to /terms
     PUT    app/api/cms/settings/shipping/route.ts      save shipping rules

   Every route file should have:
     export const runtime = 'nodejs';
     export const dynamic = 'force-dynamic';

4. Add PATHGURU_CMS_TOKEN to Vercel env (Production + Preview).

5. Quick smoke test with curl using the bearer token to verify each endpoint
   responds 200/400/401 correctly.

CONSTRAINTS:
  • Don't touch app/api/admin/* — keep CMS and admin separate
  • Reuse lib/shop/fulfillment.ts for mark-paid (already idempotent)
  • Reuse lib/shop/supabase.ts getShopDb()
  • Zod schemas live next to each route or in lib/cms/schemas.ts

Start by reading lib/admin/auth.ts to match the pattern, then build
lib/cms/auth.ts + lib/cms/respond.ts + the first endpoint (POST /api/cms/posts).
Show me the diff before moving on to the next 3 endpoints.
```

---

## 3 — PATHGURU CMS CLIENT + BLOG PUBLISH (after #2 is done)

```
Building the PathGuru-side client for the DigiFusion CMS API.

REPO: C:\Users\DELL\Documents\WorkSpace\Frastructure\PathGuru_Publishers_v3

The DigiFusion CMS API is now live at ${DIGIFUSION_API_URL}/api/cms/*, bearer-
auth via DIGIFUSION_CMS_TOKEN. See PathGuru README.md > "DigiFusion integration"
for the endpoint table.

BUILD THIS:

1. backend/cmsClient.js — a thin fetch wrapper with these characteristics:
     • Reads DIGIFUSION_API_URL + DIGIFUSION_CMS_TOKEN from process.env
     • Throws a structured error on missing env (no silent fallback)
     • Sends Authorization: Bearer ${token} + Content-Type: application/json
     • Retries 5xx with exponential backoff (3 attempts, 200/600/1800 ms)
     • Returns parsed JSON on { ok: true } responses; throws on { ok: false }
       with an Error whose .code matches the CMS error code

   Exposes named methods (NOT generic .get/.post — keep call sites clean):
     publishPost(post)         POST /api/cms/posts
     listPosts(query)          GET  /api/cms/posts
     getPost(slug)             GET  /api/cms/posts/:slug
     deletePost(slug)          DELETE /api/cms/posts/:slug
     listProducts(query)       GET  /api/cms/products
     createProduct(p)          POST /api/cms/products
     updateProduct(id, p)      PUT  /api/cms/products/:id
     listOrders(query)         GET  /api/cms/orders
     markOrderPaid(id)         POST /api/cms/orders/:id/mark-paid
     refundOrder(id, amount?)  POST /api/cms/orders/:id/refund
     listSubscriptions()       GET  /api/cms/subscriptions
     listBookings()            GET  /api/cms/bookings
     getAnalytics(range)       GET  /api/cms/analytics?range=...
     putTerms(payload)         PUT  /api/cms/settings/terms
     putShipping(payload)      PUT  /api/cms/settings/shipping

2. backend/server.js — add a new /api/blog/publish-to-digifusion handler.
   Accepts the blog post JSON from the webapp, transforms it to the CMS shape,
   calls cmsClient.publishPost(), returns { ok, slug, url }.

3. webapp/index.html (Blog Compose tab → Publish destinations section) — add
   a DigiFusion publish block alongside WordPress and Ghost:
     <label class="platform-label">
       <input type="checkbox" id="dfEnabled" class="platform-check">
       <span class="platform-name">DigiFusion (storefront)</span>
     </label>
   Plus a status field for the resulting URL.

4. webapp/blog.js — wire the new checkbox: when present and the user clicks
   publish, POST the post to /api/blog/publish-to-digifusion, show the
   resulting DigiFusion URL in the Publish Results card.

5. Smoke test: compose a post in PathGuru, hit publish with the DigiFusion box
   checked, verify the post lands at ${DIGIFUSION_API_URL}/blog/[slug].

Show me the cmsClient.js first before wiring the publish flow. Keep the file
under 200 lines.
```

---

## 4 — SHOP MODULE WIRING (after #3 is done)

```
Wiring the six Shop tabs in PathGuru to the DigiFusion CMS API. The empty-
state buttons currently do nothing — make each one fetch and render data.

REPO: C:\Users\DELL\Documents\WorkSpace\Frastructure\PathGuru_Publishers_v3

cmsClient.js (already built) exposes the methods. Each tab has a "Load X"
button with id shop{Section}Refresh and an empty container shop{Section}Table.

BUILD a webapp/shop.js (mirrors the structure of webapp/blog.js) that:

1. On DOMContentLoaded, attaches click handlers to each refresh button.
2. Each handler calls the backend (which proxies to cmsClient) and renders the
   result into the corresponding shop*Table div.
3. The render functions use existing CSS classes (.shop-table-wrap, .shop-stat-*)
   — no new styles.

Backend bridge: add /api/shop/* handlers in backend/server.js that proxy each
Shop call through cmsClient. Keeps the CMS token off the frontend.

The 6 tabs and their endpoints:
  Subscriptions → cmsClient.listSubscriptions()         render plan / status / next renewal
  Bookings      → cmsClient.listBookings()              render customer / service / status / intake URL
  Payments      → cmsClient.listOrders()                render order + mark-paid + refund actions
  T&C           → form save → cmsClient.putTerms(...)   no list, just edit + save
  Shipping      → form save → cmsClient.putShipping()   no list, just edit + save
  Analytics     → cmsClient.getAnalytics('30d')         render the 4 stat cards (Revenue/Orders/AOV/Conv)

After each tab is wired, manually click through and confirm data shows. Then
add an "Auto-refresh" toggle that polls every 60s for Subscriptions / Payments
/ Analytics (the live-data tabs).

Include in <script src="shop.js"></script> at the bottom of webapp/index.html.
```

---

## 5 — PERSONA INJECTION INTO PDF PIPELINE (independent track)

```
Wiring injectPersonaIntoPrompt() into the PDF editorial pipeline so the picked
persona actually influences book generation, not just blog posts.

REPO: C:\Users\DELL\Documents\WorkSpace\Frastructure\PathGuru_Publishers_v3

Current state:
  • backend/skills/personaPrompt.js  — exports injectPersonaIntoPrompt() and
    buildPersonaPrompt() — already composes voice + few-shot samples into
    {system, user, messages, prompt, persona} shapes
  • backend/skills/editorial.js      — buildEditorialPrompt() produces the
    Brief-stage prompt; currently NOT persona-aware
  • backend/aiPipeline.js            — callAiProvider() sends a fixed system
    message "You are a senior nonfiction editor. Return strict JSON only."
    + the editorial prompt as user content

CHANGES:

1. webapp/index.html — Publishing > Brief tab: add a persona picker dropdown
   right before "Generate Draft". Options match the Blog Assets dropdown
   (the four master personas + the default-voice null option). Same hardwired
   <option> values until /api/personas is live.

2. webapp/app.js — collectFormData() includes the picked persona id under
   key `personaId`. POST to backend includes it.

3. backend/server.js — /api/generate handler forwards personaId into the
   pipeline.

4. backend/aiPipeline.js — runEditorialAgents() now:
     • Resolves the persona via getPersonaById(personaId) || null
     • Calls buildEditorialPrompt() as today to get the topic-specific user prompt
     • Wraps both via injectPersonaIntoPrompt({ persona, system: 'Return strict JSON only.', user: editorialPrompt })
     • Passes the resulting messages array to callOpenAiCompatible / collapsed
       prompt to callGemini
     • Returns the picked persona's bylineMeta in the manuscript so the formatter
       can put it on the cover or copyright page

5. backend/skills/formatting.js — if manuscript.bylineMeta exists, render
   "Written as [displayName] — [title]" on the title page.

Show the editorial.js + aiPipeline.js diff first. Keep behavior identical when
personaId is null.
```

---

## 6 — VISUAL QA + POLISH PASS (use after any big visual change)

```
PathGuru visual QA pass. Open webapp/index.html in a browser and click through
every module + every sub-tab. Look for:

  • Panel-header sits ABOVE the .module-topnav (sub-tab strip) on every tab
  • No browser-level scrollbar at the top-right corner
  • Sidebar has visible breathing room between Publishing / Blog / Shop
  • Active sub-tab merges visually into the body (gold border, surface bg)
  • Switching sub-tabs updates the panel-header (eyebrow + title) instantly
  • The hardwired persona <option>s render in the Blog Voice & Persona picker
  • The 3 persona archetype cards (AI Auto / Digital Marketing / Senior Copywriter)
    appear below the picker
  • File-upload buttons in Blog Brand Identity and Publishing Assets > Project
    branding render with the gold-trim button style
  • PDF Template gallery in Publishing Assets > PDF Templates shows the 4 cards
    with gradient thumbs
  • Library Upload zone has the dashed border with the upload icon
  • Shop tabs show their stat cards (Analytics) and empty-state copy with
    "Load X" buttons

Files to inspect:
  webapp/index.html       — structure (3 module shells, .module-headers blocks)
  webapp/style.css        — design tokens + module-shell / topnav / assets-subnav
  webapp/app.js           — module + sub-tab routing

Take a screenshot of each tab, list any visual regressions, and propose fixes
before applying them.
```

---

## Quick-reference: the open tasks (paste any number into the master prompt)

| # | Task |
|---|---|
| 28 | Wire injectPersonaIntoPrompt into PDF editorial pipeline |
| 35 | (Superseded by 47 / Path B) |
| 36 | Persona picker live-syncs from /api/personas |
| 37 | Backend /api/personas endpoint |
| 47 | DigiFusion integration (overarching) |
| 49 | DigiFusion CMS API endpoints |
| 50 | PathGuru cmsClient.js |
| 51 | Wire Blog Compose → DigiFusion CMS |
| 52 | Wire Shop tabs → DigiFusion CMS |
