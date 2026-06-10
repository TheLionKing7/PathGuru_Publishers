# Publisher split — Command vs The Scribe

**DigiFusion Command** (`PathGuru_Publishers_v3`) is CMS + agents + shop only.

**KDP book pipeline** lives in **`Frastructure/TheScribe`** — separate codebase, separate deploy (port 8790).

## What stayed on Command

| Area | Paths |
|------|--------|
| Blog publishing | `backend/blogPublisher.js`, `POST /api/blog`, `/api/posts/*` |
| CMS proxy | `backend/cmsClient.js` |
| Agents | `backend/agents/*` |
| AI providers | `backend/aiProviders.js` (shared DeepSeek/Groq/Claude chain) |
| Research (blog/agents) | `backend/skills/research.js` |
| Editorial (blog) | `backend/skills/editorial.js` |
| Blog Room UI | `webapp/blog.js`, `#module-blog` |

## What moved to The Scribe

- `designGuru.js`, `aiPipeline.js`, `epubBuilder.js`, `exporter.js`, `kdpCompliance.js`
- `referenceLibrary.js`, `pdfDesignExtractor.js`, `fontEmbedder.js`
- `skills/design.js`, `skills/formatting.js`, `skills/kdp/*`
- Full publisher UI: `TheScribe/webapp/app.js`, Brief / Assets / Export

## Run locally

```bash
# Command (CMS + agents)
cd PathGuru_Publishers_v3 && npm start

# Publisher (books only)
cd TheScribe && npm start
```

## Deploy

- **Render service 1:** `pathguru-publishers.onrender.com` → Command repo root
- **Render service 2 (optional):** The Scribe → `TheScribe/` when Publisher is revived
