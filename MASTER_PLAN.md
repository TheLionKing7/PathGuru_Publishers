# PathGuru Publishers — Complete Rebuild Master Plan

## Verdict Summary

The existing backend is genuinely solid and stays largely unchanged. The extension is retired as the primary UI and demoted to an optional research clipper. A full-page web app replaces it.

---

## What We Keep (Unchanged)

| File | Status | Reason |
|------|--------|--------|
| `backend/server.js` | ✅ Keep | Clean HTTP server, CORS, health route |
| `backend/aiPipeline.js` | ✅ Keep | Multi-provider Gemini/Cerebras/DeepSeek logic is good |
| `backend/kdpCompliance.js` | ✅ Keep | KDP profile + compliance report is correct |
| `backend/cloudflareR2.js` | ✅ Keep | R2 upload logic is fine |
| `backend/skills/research.js` | ✅ Keep | Tavily integration works |
| `backend/skills/editorial.js` | ✅ Keep | Prompt is well-structured |
| `render.yaml` | ✅ Keep | Already configured correctly |
| `package.json` | ✅ Keep | Dependencies are right |

---

## What We Replace

| Old | New | Why |
|-----|-----|-----|
| `extension/popup.html` | `webapp/index.html` | Full-page app, no popup height limits |
| `extension/popup.css` | `webapp/style.css` | Premium dark design system |
| `extension/popup.js` | `webapp/app.js` | State-driven, no DOM thrashing |
| `extension/editor.html` | `webapp/preview.html` | Embedded preview pane in app |
| `backend/skills/design.js` | `backend/skills/design.js` | Replaced with Pexels integration |
| `backend/skills/formatting.js` | `backend/skills/formatting.js` | Full KDP-compliant HTML output |
| `backend/exporter.js` | `backend/exporter.js` | EPUB generation added |

---

## New Files

| File | Purpose |
|------|---------|
| `webapp/index.html` | Main three-tab publishing dashboard |
| `webapp/style.css` | PathGuru design system (dark premium) |
| `webapp/app.js` | State engine + all tab logic |
| `backend/epubBuilder.js` | EPUB 3 assembler (KDP-compatible) |
| `backend/pexelsAssets.js` | Pexels image search + R2 upload |
| `backend/server.js` | Updated: add /api/assets and /api/epub routes |
| `extension/clipper.html` | Minimal "clip to PathGuru" popup |
| `extension/clipper.js` | One-button research URL sender |

---

## Architecture

```
User → webapp/index.html (served by Node on Render)
         ↓ Tab 1: Brief & Research
         ↓ Tab 2: Visual Assets (Pexels)
         ↓ Tab 3: Compile + Export
              ↓
       backend/server.js
         ├── POST /api/generate   → aiPipeline → designGuru → formatting → PDF
         ├── POST /api/assets     → pexelsAssets → R2 upload
         └── POST /api/epub       → epubBuilder → R2 upload
              ↓
       External APIs:
         ├── Tavily (research)
         ├── Gemini/Cerebras/DeepSeek (writing)
         ├── Pexels (images)
         └── Cloudflare R2 (storage)
```

---

## KDP Compliance Improvements

### Current gaps (we fix these):
1. `formatting.js` uses `@page { size: A4 }` — KDP paperback is 6×9in, not A4
2. No EPUB output at all
3. `design.js` cover is a placeholder — no real image sourcing
4. Font embedding is noted as a warning but never attempted
5. Page margins are not KDP-spec (inside margin must be wider for spine)

### What we fix:
- `formatting.js` → KDP-correct `@page { size: 6in 9in }` with proper margins
- Inside margin (gutter) = 0.75in for books under 300 pages
- Outside/top/bottom = 0.5in
- `epubBuilder.js` → generates valid EPUB 3 with OPF, NCX, content.opf
- `design.js` → queries Pexels for cover image, composites with title overlay

---

## UI Design Direction

**Aesthetic**: Dark editorial luxury — like a premium publishing house's internal tool. Not SaaS-generic. Specific choices:
- Font: `Playfair Display` for headings (editorial gravitas), `DM Sans` for UI chrome
- Base: `#0a0e17` near-black with `#1a2236` surface containers
- Accent: `#c9a84c` warm gold (publishing, authority, premium)
- Status: `#3ecf8e` green (success), `#ef4444` red (error)
- Three-column layout: nav sidebar (64px) + form panel (380px) + live preview (flex)
- Skeleton states with gold shimmer animation
- Smooth tab transitions, progress bar during generation

---

## Tab Breakdown

### Tab 1 — Brief & Research
- Topic prompt (auto-expanding textarea)
- Book metadata fields (title, subtitle, author, publisher)
- Audience + outcome + writing mode selectors
- Format (PDF / EPUB / Both) + KDP trim size
- Style + tone + personality
- [Generate] button → progress states → live status feed

### Tab 2 — Visual Assets
- Pexels keyword search
- Masonry grid with skeleton loaders
- Hover: "Use as Cover" / "Add to Book" / "Upload to R2"
- Selected assets tray at bottom

### Tab 3 — Compile & Export
- Compliance checklist (live, from backend)
- Proofreader notes from AI
- Download PDF / Download EPUB / Download HTML buttons
- Live document preview (iframe)
- Cloudflare R2 storage URLs (if configured)

---

## Render Deployment

The webapp is served by the same Node server. We add:
```js
// In server.js — serve webapp as static files
import { readFileSync } from 'node:fs';
// GET / → webapp/index.html
// GET /style.css → webapp/style.css
// GET /app.js → webapp/app.js
```

No separate frontend hosting needed. One Render service, one deploy.

---

## Extension (Reduced Role)

The Chrome extension becomes a single-button research clipper:
- Captures current tab URL + title
- Sends to `https://your-render-url.onrender.com/?clip=<url>&topic=<title>`
- Web app opens with research pre-filled

Manifest stays MV3. Permissions reduced to `activeTab` only.

---

## File Delivery Order

1. `webapp/index.html` — the full dashboard UI
2. `webapp/style.css` — PathGuru design system
3. `webapp/app.js` — state engine + all interactions
4. `backend/skills/formatting.js` — KDP-correct HTML
5. `backend/epubBuilder.js` — EPUB 3 generator
6. `backend/pexelsAssets.js` — image search
7. `backend/server.js` — updated with new routes + static serving
8. `extension/clipper.html` + `clipper.js` — new minimal extension
