# PathGuru — Wiring verification guide

Use this checklist against **production** (`https://pathguru-publishers.onrender.com`) after each deploy. Env keys live on Render — you only confirm behavior.

**Pass criteria:** UI action → API call → persisted or downloadable result. Agent claims must include proof (`taskId`, `pageId`, `slug`, etc.).

---

## Recent wiring fixes (deploy before verifying)

These changes are in the repo; production must be redeployed on Render for them to take effect.

| Area | Fix |
|------|-----|
| Backend URL | `webapp/js/core/backend.js` — shared `PathGuruBackend.getBackendUrl()` / `apiUrl()`; used by `app.js`, `agents.js`, `shop.js`, `blog.js`, `analytics.js` |
| Desktop | Electron defaults to **bundled local webapp** + Render API via preload (`__PATHGURU_DESKTOP__.defaultBackendUrl`); set `PATHGURU_DESKTOP_CLOUD=1` to load cloud UI instead |
| Vektor | `GET /api/shop/vektor/users` and `PATCH /api/shop/vektor/plan` proxied server-side (no direct browser calls to `vektor-xr-1.onrender.com`) |
| Atlas docs | Completed tasks persist DOCX/PDF to R2; download via `GET /api/agents/atlas/download/:filename` |
| Tasks guard | `POST /api/agents/tasks` returns `503` with clear message when Supabase env is missing (instead of crashing) |

**Env required for full pass:**

| Variable | Affects |
|----------|---------|
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Agent tasks, chat, leads |
| `DIGIFUSION_CMS_TOKEN` | Shop catalog, blog posts |
| `VEKTOR_ADMIN_KEY` + `VEKTOR_SERVICE_KEY` | Vektor users tab + plan changes |
| R2 credentials | Async jobs, format library, Atlas/research deliverables |
| `PATHGURU_PUBLIC_URL` | PDF imprint asset URLs |

---

## 0. Platform bootstrap

| Step | How to verify | Pass |
|------|---------------|------|
| Health | `GET https://pathguru-publishers.onrender.com/health` → `"status":"ok"` | ☐ |
| Platform config | `GET .../api/platform/config` → `products` array with `publisher`, `digifusion`, `full` | ☐ |
| Ping | `GET .../ping` → `"ok":true` | ☐ |

---

## 1. Publisher department

| Step | How to verify | Pass |
|------|---------------|------|
| Brief form | Open app → Publisher → enter topic → **Generate Draft** → progress bar runs | ☐ |
| Async job | Long book: Network tab shows `POST /api/generate` then polls `/api/generate/status/{id}` until `complete` | ☐ |
| Compile preview | Export tab shows preview iframe + compliance checks | ☐ |
| PDF download | **Download PDF** saves a file > 100 KB | ☐ |
| EPUB download | **Download EPUB** saves `.epub` | ☐ |
| Manuscript refine | Job mode **Refine** → upload TXT → generate → output respects refine instructions | ☐ |
| Manuscript parse | Upload DOCX on brief → `POST /api/manuscript/parse` → text populates | ☐ |
| Pexels | Assets → search keyword → grid fills → select image | ☐ |
| Format library | Assets → Format Library → upload PDF to `playbooks` → file appears in list | ☐ |
| Settings | Settings → backend URL = Render URL → save → sidebar shows URL | ☐ |

---

## 2. Intelligence department

| Step | How to verify | Pass |
|------|---------------|------|
| Blueprint library | Intelligence → Playbooks → list loads (`/api/agency-ip` or library UI) | ☐ |
| Content schedule | Schedule tab shows calendar or empty state without JS errors | ☐ |
| Blog-room | Blog-room → post list loads from `/api/posts` | ☐ |
| Write blog | Blog-room → create draft via Aether path → draft appears in list | ☐ |
| Blog assets | Brand/voice sub-tabs switch without error | ☐ |

---

## 3. Network department (agents)

| Step | How to verify | Pass |
|------|---------------|------|
| Nexus command | Network → Nexus Command → chat sends `POST /api/agents/nexus/chat` | ☐ |
| Research status | Ask *"Where is Orion's research on [topic]?"* → reply cites real `taskId` / deliverable, not invented Notion URL | ☐ |
| Create task | New Task modal → submit → task appears in Task History | ☐ |
| Task output | Open completed research task → output drawer shows `brief` or R2 link | ☐ |
| Atlas download | Completed Atlas task with document → **Download** opens `GET /api/agents/atlas/download/{filename}` | ☐ |
| Orchestrate | Approved workflow → `/api/agents/nexus/orchestrate` → campaign or next step in task output | ☐ |
| Task hygiene | `POST /api/agents/nexus/task-hygiene` with `CRON_SECRET` header → JSON summary (can be all zeros) | ☐ |
| Agent roster | Agent Network tab lists agents without console errors | ☐ |
| Agent chat DB | If using per-agent chat: confirm `015_agent_chat.sql` applied in Supabase | ☐ |

---

## 4. Products department

| Step | How to verify | Pass |
|------|---------------|------|
| Catalog | Products → catalog loads | ☐ |
| Services / bookings | Consulting tab renders | ☐ |
| Payments | Revenue tab loads (may be empty) | ☐ |
| Vektor users | Products → Vektor tab → `GET /api/shop/vektor/users` returns user list (or cached `_stale` snapshot) | ☐ |
| Vektor plan | Change a test user plan → `PATCH /api/shop/vektor/plan` → UI updates without CORS error | ☐ |

---

## 5. Analytics department

| Step | How to verify | Pass |
|------|---------------|------|
| Site analytics | Analytics tab → fetches DigiFusion analytics API → chart or empty state | ☐ |

---

## 6. Cross-product (Publisher ↔ Command)

| Step | How to verify | Pass |
|------|---------------|------|
| Shared backend | Same `backendUrl` in Settings after switching product (localStorage `pg_settings`) | ☐ |
| Blog publish | Publisher settings `cmsToken` + blog path publishes to `digitafusion.com` | ☐ |
| Author routing | Published blog shows correct byline (Boroji / Kayode / DigiFusion per domain rules) | ☐ |

---

## 7. Cron / background (desktop off)

| Step | How to verify | Pass |
|------|---------------|------|
| Orchestration cron | `GET .../api/cron/process-orchestration` with cron auth → `200` | ☐ |
| Scheduled hygiene | Render cron logs show task-hygiene or orchestration runs | ☐ |
| Blog cadence | Pending approval tasks created for scheduled content (not auto-published) | ☐ |

---

## 8. Anti-hallucination spot checks

| Prompt | Expected | Pass |
|--------|----------|------|
| "Log Orion research to Notion" (without completed research) | Honest "not found" or runs real pipeline — no fake `pageId` | ☐ |
| "Did the blog publish?" | Cites real post `slug` or says not published | ☐ |
| "Still waiting on approval" | Does not trigger blog publish handler | ☐ |

---

## 9. Desktop (when installer ships)

| Step | How to verify | Pass |
|------|---------------|------|
| Local bundle | App opens without Chrome; UI from bundled `webapp/` (default; not cloud URL) | ☐ |
| Cloud API | Network tab: API calls go to `pathguru-publishers.onrender.com`, not `file://` origin | ☐ |
| Product sign-in | First screen: PathGuru vs DigiFusion | ☐ |
| Close app | Submit research task → close desktop → task still completes on Render | ☐ |

---

## Reporting issues

When a step fails, note:

1. Department + UI action  
2. Network request (method + path + status)  
3. Response body or screenshot  
4. Render log timestamp  

Fix in PathGuru first; merge KDP-only fixes to `TheScribe/` per `FORK_MANIFEST.md`.

---

## Supabase migrations to confirm applied

Run in Supabase SQL editor if features are broken:

- `015_agent_chat.sql` — agent chat persistence  
- Earlier migrations — tasks, posts, orchestration (if tables missing)

Check: `SELECT COUNT(*) FROM agent_chat_messages;` (after 015) should not error.
