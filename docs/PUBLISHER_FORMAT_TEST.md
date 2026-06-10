# Publisher department — formatting reliability test

Test **interior layout and export** without cover generation. Cover art, Pexels, back-cover copy, and cover PDF are skipped when **Interior formatting only** is checked on the brief.

**Pass criteria:** manuscript in → formatted interior out (HTML preview, PDF, optional DOCX) with compliance checks and no pipeline crash.

---

## What formatting covers (this test scope)

| Layer | What it proves |
|-------|----------------|
| Manuscript structure | Imprint, title page, copyright, TOC, chapters, references |
| Layout engine | KDP trim, gutter, chapter openers, pull quotes, callouts, widow/orphan |
| Typography | Publisher style tokens (PathFinda / Digital Nation / niche overrides) |
| Feedback loop | Weak sections flagged → revised → re-laid out (up to 3 passes) |
| PDF export | Playwright render + metadata, bookmarks, font embedding check |
| DOCX export | Optional — `PDF + DOCX` or `DOCX` output format |
| Compliance | Preflight + font embedding reported on Compile tab |

**Out of scope for this pass:** cover image, cover PDF, back cover blurb, interior Pexels images.

---

## Recommended test matrix

Run each row once. Use **Refine** job mode with a short imported `.txt` or `.docx` to avoid full research + writing cost.

| # | Publisher profile | Trim | Length | Output | Pass |
|---|-------------------|------|--------|--------|------|
| 1 | PathFinda | 6×9 | Concise | PDF | ☐ |
| 2 | Digital Nation | 6×9 | Standard | PDF | ☐ |
| 3 | PathFinda | 5.5×8.5 | Concise | PDF + DOCX | ☐ |
| 4 | Default | 6×9 | Concise | EPUB | ☐ |

**Brief settings for every run:**
- Job mode: **Refine**
- Upload or paste a manuscript (≥ 3 chapters, ~2–5 pages each)
- Check **Interior formatting only**
- Leave cover / back-cover fields empty

---

## Step-by-step (per run)

### 1. Prepare manuscript
- Use an existing draft or paste structured text with clear chapter headings.
- Optional: upload `.docx` on brief → confirm parse populates the manuscript field.

### 2. Generate
- **Generate Draft** → progress completes without error.
- Long runs: confirm async job polls until `complete` (not stuck `queued`).

### 3. Compile tab — preview
- Preview iframe shows interior pages (no cover page at top).
- TOC lists all chapters.
- Chapter openers show number + title + body with justified text.

### 4. Compliance
- Compliance list renders (pass / warn / fail per check).
- Note any **fail** on font embedding or preflight — log for fix.

### 5. Downloads
| Action | Pass if |
|--------|---------|
| Download PDF | File > 100 KB; opens in reader; starts at imprint/title (not cover art) |
| Download DOCX | Opens in Word; headings and body present |
| Download EPUB | Valid `.epub` when format includes EPUB |

### 6. Render report (optional, dev)
- Response includes `renderReport.sections[]` with per-section `issues`.
- Zero issues on concise refine manuscript is ideal; note any recurring flags.

---

## Failure log template

When a step fails, record:

1. Matrix row # and publisher profile  
2. Request: `POST /api/generate` — `jobMode`, `skipCover`, `trimWidthIn` × `trimHeightIn`  
3. Response status + `generationReport` / error message  
4. Render log timestamp (Render dashboard)  
5. Screenshot of Compile preview or compliance panel  

---

## API shortcut (curl / Postman)

```json
POST /api/generate
{
  "jobMode": "refine",
  "title": "Formatting Test — PathFinda",
  "publisherProfile": "pathfinda",
  "manuscriptText": "Chapter 1: Introduction\n\n...",
  "skipCover": true,
  "formatFocus": "interior",
  "format": "pdf",
  "trimWidthIn": 6,
  "trimHeightIn": 9,
  "length": "concise",
  "async": false
}
```

Set `"async": true` for standard-length books to avoid HTTP timeout on Render.

---

## After formatting passes

Only then move to cover/back-cover reliability as a **separate** test pass (uncheck Interior formatting only).
