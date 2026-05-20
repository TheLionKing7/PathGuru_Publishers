# PathGuru Publishers — Setup & Testing Guide

## What you need before starting

- Node.js v22+ (check: `node --version`)
- A Gemini API key (free at aistudio.google.com)
- Optional: Tavily key, Pexels key, Cloudflare R2 credentials

---

## Step 1 — Unzip and enter the project

```bash
unzip PathGuru_Publishers_v3.zip
cd pathguru
```

---

## Step 2 — Install dependencies

```bash
npm install
npx playwright install --with-deps chromium
```

Playwright is what generates the PDF from HTML.
The second command downloads the Chromium browser it needs (~300MB, once only).

---

## Step 3 — Create your environment file

Create a file called `.env` in the project root:

```bash
touch .env
```

Open it and add your keys:

```env
# ── Required (pick one AI provider) ──────────────
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash

# ── Strongly recommended ──────────────────────────
TAVILY_API_KEY=your-key-here     # web research
PEXELS_API_KEY=your-key-here     # cover images

# ── Optional (cloud storage) ──────────────────────
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# ── KDP defaults (these are already set correctly) ─
KDP_DEFAULT_TRIM_WIDTH_IN=6
KDP_DEFAULT_TRIM_HEIGHT_IN=9
KDP_DEFAULT_BLEED=false
KDP_DEFAULT_INTERIOR=black-and-white

PORT=8787
```

> The system works without Tavily or Pexels — research falls back to
> Gemini's own knowledge, and the cover uses a gradient instead of a photo.
> But results are significantly better with both keys.

---

## Step 4 — Load the .env file

Node doesn't load .env automatically. Add this one line to the TOP of
`backend/server.js`, before any imports:

```js
// Add this as the very first line:
import 'node:fs';  // already there — add the line below it:
```

Actually the cleanest way is to start the server with the flag:

```bash
node --env-file=.env backend/server.js
```

Or install dotenv:

```bash
npm install dotenv
```

Then add to the top of `backend/server.js`:

```js
import 'dotenv/config';
```

---

## Step 5 — Start the server

```bash
node --env-file=.env backend/server.js
```

You should see:

```
  ┌─────────────────────────────────────────┐
  │   PathGuru Publishers — API Server       │
  │   http://localhost:8787                  │
  │                                          │
  │   GET  /          → Web App UI           │
  │   POST /api/generate                     │
  │   GET  /api/assets                       │
  │   POST /api/upload-assets                │
  │   POST /api/epub                         │
  └─────────────────────────────────────────┘
```

---

## Step 6 — Open the web app

Go to: **http://localhost:8787**

You should see the PathGuru Publishers dark dashboard.

First thing to do: click the **Settings gear icon** (bottom of the sidebar)
and set the Backend URL to:

```
http://localhost:8787
```

Save. You'll see it appear in the header.

---

## Step 7 — Run your first generation

Fill in the Brief tab:

| Field | Example value |
|-------|---------------|
| Topic prompt | A practical guide for salon owners who want to use Instagram Reels to book 5 new high-ticket clients per month — without dancing or going viral |
| Writing mode | Nonfiction guide |
| Voice | Trusted mentor |
| Format | PDF |
| Trim size | 6 × 9 in |
| Length | Standard (40–60 pages) |

Click **Generate Draft**.

Watch the progress bar. It will cycle through:
1. Connecting to backend
2. Running Tavily research
3. Editorial agents drafting
4. Design agent applying layout
5. Formatting for KDP
6. Running compliance checks
7. Compiling output files

Total time: 30–90 seconds depending on content length and API speed.

When done, it automatically switches to the **Compile & Export tab**.

---

## Step 8 — Check the output

On the Compile tab you'll see:

**Left panel:**
- KDP Compliance checklist (green/yellow/red checks)
- Book Strategy (title, positioning, voice)
- Proofreader Notes from the AI

**Right panel:**
- Live document preview (scrollable)

**Header buttons:**
- HTML — download the raw HTML file
- JSON — download the manuscript data
- Download PDF — opens the PDF in a new tab or triggers print
- Download EPUB — downloads the .epub file

---

## Testing the API directly (optional)

You can test without the UI using curl:

```bash
# Health check
curl http://localhost:8787/health

# Generate a book (minimal)
curl -X POST http://localhost:8787/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "How to start a freelance copywriting business with no experience",
    "author": "Jane Smith",
    "publisher": "PathGuru Publishers",
    "format": "pdf",
    "writingMode": "nonfiction guide",
    "writingPersonality": "trusted mentor: clear, reassuring, practical",
    "tone": "expert, clear, persuasive",
    "style": "premium",
    "trimWidthIn": 6,
    "trimHeightIn": 9
  }' \
  --output result.json

# Check the result
cat result.json | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const r=JSON.parse(d); console.log('Title:', r.manuscript?.title); console.log('Sections:', r.manuscript?.sections?.length); console.log('HTML length:', r.html?.length); console.log('Compliance checks:', r.compliance?.checks?.length);"
```

```bash
# Image search
curl "http://localhost:8787/api/assets?query=business+strategy&orientation=portrait"
```

---

## Deploying to Render

1. Push the `pathguru` folder to a GitHub repo

2. Go to render.com → New → Web Service

3. Connect your GitHub repo

4. Render will detect `render.yaml` automatically. The settings it uses:
   - Build: `npm install && npx playwright install --with-deps chromium`
   - Start: `npm start`
   - Health check: `/health`

5. In the Render dashboard → Environment tab, add each key from your `.env`:
   - `GEMINI_API_KEY`
   - `TAVILY_API_KEY`
   - `PEXELS_API_KEY`
   - (R2 keys if you have them)
   - `AI_PROVIDER` = `gemini`
   - `GEMINI_MODEL` = `gemini-2.5-flash`

6. Deploy. Your live URL will be something like:
   `https://pathguru-publishers.onrender.com`

7. Open that URL → Settings → set Backend URL to your Render URL → Save.

---

## Common issues and fixes

| Problem | Fix |
|---------|-----|
| `Cannot find module` error | Check you're running from the `pathguru/` directory |
| `GEMINI_API_KEY not set` | Make sure .env file exists and you're using `--env-file=.env` flag |
| `Playwright browser not found` | Run `npx playwright install --with-deps chromium` again |
| Generation hangs at "Connecting" | Check Backend URL in Settings is `http://localhost:8787` |
| PDF download opens blank | Use the HTML download instead — works in all browsers |
| Cover has no photo | Add `PEXELS_API_KEY` to .env — fallback is a gradient |
| Research is thin | Add `TAVILY_API_KEY` — without it Gemini uses training data only |
| Port already in use | Change `PORT=8787` to `PORT=3000` in .env |

---

## Install the Chrome extension (optional)

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `pathguru/extension/` folder
5. The PathGuru icon appears in your toolbar

To use it: browse any page, click the icon, set your Render URL once,
then click "Open in PathGuru →" to pre-fill the topic from that page.

---

## API keys — where to get them

| Key | URL | Free tier |
|-----|-----|-----------|
| Gemini | aistudio.google.com | Yes, generous |
| Tavily | tavily.com | 1,000 searches/month free |
| Pexels | pexels.com/api | Free, unlimited |
| Cloudflare R2 | cloudflare.com | 10GB free storage |
