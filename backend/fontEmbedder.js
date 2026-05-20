/**
 * PathGuru Publishers — Font Embedder
 *
 * Reads bundled TTFs from backend/fonts/ once at first use, caches them as
 * base64 strings, and exposes an inline @font-face <style> block per design
 * style. Replaces the Google Fonts CDN <link> dependency so PDF rendering
 * has zero outbound HTTP for fonts.
 *
 * All four files are variable fonts — one file covers every weight 400–900
 * for Playfair Display and 100–1000 for DM Sans. That's why each @font-face
 * declaration uses a `font-weight: 100 900` range instead of a single weight.
 *
 * Public API:
 *   getInlineFontCss(style)  → string <style>...</style>  (or '' if no fonts)
 *   prewarmFonts()           → Promise<void> — call at server boot to load+cache
 *   describeEmbeddedFonts()  → { name, weightRange, italic, bytes }[]
 */

import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');

/* ── Font registry ─────────────────────────────────────
   Each entry → one @font-face declaration in the output.
   `family` is the CSS font-family name (matches what design.js writes).
   `file` is the TTF filename in backend/fonts/.
   `weightRange` is a [min, max] pair for variable fonts (CSS spec form).
   `italic` flips font-style to italic. ──────────────── */
const FONT_REGISTRY = [
  { family: 'Playfair Display', file: 'PlayfairDisplay-Variable.ttf',         weightRange: [400, 900], italic: false },
  { family: 'Playfair Display', file: 'PlayfairDisplay-Italic-Variable.ttf',  weightRange: [400, 900], italic: true  },
  { family: 'DM Sans',          file: 'DMSans-Variable.ttf',                  weightRange: [100, 1000], italic: false },
  { family: 'DM Sans',          file: 'DMSans-Italic-Variable.ttf',           weightRange: [100, 1000], italic: true  },
];

/**
 * Which families each design theme actually uses. Pulled directly from the
 * three STYLE_TOKENS in design.js so we don't ship 1 MB of unused @font-face
 * blocks to themes that only need DM Sans.
 */
const STYLE_FAMILIES = {
  premium: ['Playfair Display', 'DM Sans'],
  modern:  ['DM Sans'],
  bold:    ['DM Sans'],
};

/* ── State (lazy-loaded, cached for process lifetime) ── */
let cache = null; // { [file]: base64 } once loaded
let loadingPromise = null;

async function loadAll() {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const out = {};
    for (const entry of FONT_REGISTRY) {
      const full = path.join(FONTS_DIR, entry.file);
      try {
        const s = await stat(full);
        if (s.size < 1024) {
          // Treat near-empty files as missing — they're stubs from a failed
          // download attempt. Don't error: callers can degrade to system fonts.
          console.warn(`[fontEmbedder] Skipping ${entry.file} — too small (${s.size}B)`);
          continue;
        }
        const buf = await readFile(full);
        out[entry.file] = buf.toString('base64');
      } catch (err) {
        console.warn(`[fontEmbedder] Missing ${entry.file}: ${err.message}`);
      }
    }
    cache = out;
    return out;
  })();

  return loadingPromise;
}

/**
 * Builds a single `<style>@font-face …</style>` block for the given style.
 * Returns '' when no fonts are loaded (graceful degrade to system fonts).
 */
export async function getInlineFontCss(style = 'modern') {
  const loaded = await loadAll();
  const wanted = STYLE_FAMILIES[style] || STYLE_FAMILIES.modern;

  const blocks = [];
  for (const entry of FONT_REGISTRY) {
    if (!wanted.includes(entry.family)) continue;
    const b64 = loaded[entry.file];
    if (!b64) continue;

    blocks.push(
      `@font-face{` +
        `font-family:'${entry.family}';` +
        `font-style:${entry.italic ? 'italic' : 'normal'};` +
        `font-weight:${entry.weightRange[0]} ${entry.weightRange[1]};` +
        `font-display:block;` +
        `src:url(data:font/ttf;base64,${b64}) format('truetype-variations');` +
      `}`
    );
  }

  if (!blocks.length) return '';
  return `<style>${blocks.join('')}</style>`;
}

/**
 * Synchronous helper used by callers that already got the loaded cache via
 * prewarmFonts(). Keeps the hot path in render handlers off the I/O loop.
 */
export function getInlineFontCssSync(style = 'modern') {
  if (!cache) return '';
  const wanted = STYLE_FAMILIES[style] || STYLE_FAMILIES.modern;
  const blocks = [];
  for (const entry of FONT_REGISTRY) {
    if (!wanted.includes(entry.family)) continue;
    const b64 = cache[entry.file];
    if (!b64) continue;
    blocks.push(
      `@font-face{` +
        `font-family:'${entry.family}';` +
        `font-style:${entry.italic ? 'italic' : 'normal'};` +
        `font-weight:${entry.weightRange[0]} ${entry.weightRange[1]};` +
        `font-display:block;` +
        `src:url(data:font/ttf;base64,${b64}) format('truetype-variations');` +
      `}`
    );
  }
  return blocks.length ? `<style>${blocks.join('')}</style>` : '';
}

/** Boot-time warmer. Safe to call multiple times. */
export async function prewarmFonts() {
  await loadAll();
}

/** Diagnostic — used by tests and the /health endpoint. */
export async function describeEmbeddedFonts() {
  const loaded = await loadAll();
  return FONT_REGISTRY.map((e) => ({
    family:      e.family,
    file:        e.file,
    weightRange: e.weightRange,
    italic:      e.italic,
    bytes:       loaded[e.file] ? Math.floor((loaded[e.file].length * 3) / 4) : 0,
    loaded:      Boolean(loaded[e.file]),
  }));
}
