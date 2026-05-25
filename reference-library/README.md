# PathGuru Reference Library

This folder is your **publishing learning library**. Drop any premium PDF ebooks here and they will be:

1. **Listed in AI prompts** so the editorial agent knows they exist as quality benchmarks
2. **Referenced by the design tokens** — Digital Nation Inc. and PathFinda Publishers design DNA is already baked in
3. **Accessible via the API** at `GET /api/library`

## How to use

1. Copy any premium PDF into this folder (subdirectories are ignored — put files in the root)
2. The agent will automatically reference them the next time you generate a book
3. The built-in profiles for Digital Nation Inc. and PathFinda Publishers are already active — no file needed

## Pre-loaded design profiles

Even without PDF files here, the following publisher DNA is already baked into the system:

### Digital Nation Inc. (Van Shelby / Henry Haastrup)
- Deep navy (#1B2A4A) + gold (#C9A446)
- Data-visualization cover (exponential growth chart)
- INSIDER SECRET callout boxes, FORMULA boxes, 90-day checklists
- 1,800–2,500 word chapters minimum

### PathFinda Publishers (James Baldwin)
- Deep navy (#0B172A) + electric blue (#3EA1FF)
- Module-based structure with numbered modules
- Worksheet sections, audience layer labels, 90-day roadmaps

## Activate a publisher style

When generating, set the `publisher` field to one of:
- `"Digital Nation Inc."` → uses digitalNation style tokens
- `"PathFinda Publishers"` → uses pathfinda style tokens

Or set `style` explicitly:
- `"digitalNation"` — navy + gold, data-viz cover
- `"pathfinda"` — navy + blue, editorial cover
- `"premium"` — warm serif, Playfair Display
- `"modern"` — clean sans-serif, teal accents
- `"bold"` — high-contrast, red accents

## Adding a new publisher profile

To add a custom publisher's design DNA, open:
`backend/referenceLibrary.js` → add an entry to `BAKED_PROFILES`

Reference: The profiles for Digital Nation Inc. and PathFinda Publishers were extracted from the PDFs in:
`C:\Users\DELL\Documents\WorkSpace\Products\Ebooks`
