/**
 * PathGuru Publishers — Reference Library
 * =========================================
 * Manages a folder of premium reference ebooks that the publishing
 * pipeline can learn design patterns and editorial standards from.
 *
 * Usage:
 *   1. Place any reference PDFs into the folder defined by REFERENCE_LIBRARY_DIR
 *      (default: ../reference-library/ relative to this file, or set
 *       REFERENCE_LIBRARY_DIR env var to an absolute path).
 *
 *   2. Call getLibraryContext(style) to get a design brief injected into
 *      the editorial and design prompts.
 *
 *   3. The library auto-indexes on first call and caches for the session.
 *
 * Supported reference books (pre-loaded profiles based on your Ebooks folder):
 *   - Digital Nation Inc. books (Van Shelby, Henry Haastrup)
 *   - PathFinda Publishers books (James Baldwin)
 *   - Any PDF placed in the reference-library folder
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync, mkdirSync }    from 'node:fs';
import path                          from 'node:path';
import { loadSavedProfiles }         from './pdfDesignExtractor.js';

/* ── Library location ─────────────────────────────────────────────────── */
const DEFAULT_LIBRARY_DIR = process.env.REFERENCE_LIBRARY_DIR
  || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'reference-library');

/* ── Pre-baked design profiles extracted from your reference library ──── */
// These were reverse-engineered from the actual PDFs in your Ebooks folder.
// They are injected into AI prompts as concrete style guidance.
const BAKED_PROFILES = {

  digitalNation: {
    name: 'Digital Nation Inc.',
    books: ['Decode Financing (Van Shelby)', 'AI Passive Income for Beginners (Henry Haastrup)', 'Investing for Beginners (Van Shelby)'],
    coverDNA: `
COVER DNA — Digital Nation Inc.:
- Background: Deep navy (#1B2A4A) with subtle dot-grid overlay
- Primary visual: Exponential growth chart (green fill area) as hero element
- Data callout dots on chart with labelled values
- Stats bar below chart: 3–4 boxes showing key metrics (chapter count, difficulty, edition)
- Typography: Title in two lines — supporting words in white bold, KEY WORD in very large amber/gold bold
- Subtitle: small white text below main title
- Author name: amber/gold bold, uppercase
- Publisher brand: top-right, gold small caps
- Gold horizontal rules separating sections
- NO stock photography — data visualization only`,
    interiorDNA: `
INTERIOR DNA — Digital Nation Inc.:
- Chapter opener: Full-page dark navy background, centered 'CHAPTER X' in gold small caps with tracking, large bold white chapter title, gold horizontal rule underline
- Running headers: book title left, chapter title right, separated by hairline rule
- Footer: '© Year Publisher · All Rights Reserved · Page X'
- Body text: justified, 10.5pt DM Sans, 1.65 leading, first-line indent after first paragraph
- H2 headings: 22pt bold navy, spaceBefore 18pt
- INSIDER SECRET boxes: navy background (#1B2A4A), gold left border (4pt), 'INSIDER SECRET' label in gold small caps, body in white
- FORMULA boxes: cream (#F5F0DC) background, 'FORMULA' in gold small caps, large bold centered formula
- Checklist boxes: navy header bar with white bold text, checkbox items below with gold left border
- Pull quotes: centered italic, gold left and right vertical rules
- Tables: navy header row with gold bottom border, alternating light blue (#EEF1F8) and white rows
- Part openers: full-page navy with gold rules, gold 'PART I' label, large white part title`,
    editorialDNA: `
EDITORIAL STANDARDS — Digital Nation Inc.:
- Voice: trusted expert with insider knowledge, commercially aware, myth-busting
- Chapter length: 1,800–2,500 words minimum per chapter
- Every chapter opens with a striking statistic or market reality
- INSIDER SECRET callouts: actionable intelligence the reader cannot get elsewhere
- Checklists: 5–10 items, action-oriented, checkbox format
- Pull quotes: counterintuitive financial/business truths or hard-won insights
- TOC: clear hierarchy with part numbers and chapter titles
- No empty pages — every page carries content
- Formula callouts for key principles or calculations`,
  },

  pathfinda: {
    name: 'PathFinda Publishers',
    books: ['The Digital Ads Playbook (James Baldwin)', 'Digital Ads Playbook Workbook', 'Stop Buying Ads (James Baldwin)'],
    coverDNA: `
COVER DNA — PathFinda Publishers:
- Background: Deep navy (#0B172A) with clean geometric overlay
- 'THE SOVEREIGN BUSINESS SERIES · BOOK N' label at top
- Title split into visual hierarchy: large bold main word, smaller supporting words
- Part preview boxes showing 3 key parts of the book
- Author name: white or teal, with role descriptor
- Publisher branding: bottom`,
    interiorDNA: `
INTERIOR DNA — PathFinda Publishers:
- Module openers: full-page navy, centered 'MODULE ONE/TWO/THREE' in gold small caps, large bold white title, gold horizontal rule
- Worksheet headers: dark navy bar with white ALL CAPS bold text, gold left border accent
- Audience layer labels: color-coded chips (COLD/WARM/HOT/CUSTOMER layers)
- Tables: navy header with gold border, alternating light rows
- Callout boxes: navy background, gold border accent, white text
- Dense content — 64+ pages with no empty pages
- Formula callouts with cream background
- Running headers with module + section name`,
    editorialDNA: `
EDITORIAL STANDARDS — PathFinda Publishers:
- Voice: revenue architect, conversion-focused, business strategist
- Chapters structured as numbered modules
- Heavy use of frameworks with named components
- Worksheet sections with fill-in fields
- Audience segmentation frameworks (cold/warm/hot layers)
- Action steps at end of every module
- 90-day execution roadmaps for implementation`,
  },
};

/* ── Session cache ────────────────────────────────────────────────────── */
let _libraryFiles = null;
let _lastScanMs   = 0;
const SCAN_TTL_MS = 5 * 60 * 1000; // re-scan every 5 minutes

/* ── Ensure the library folder exists ────────────────────────────────── */
export function ensureLibraryDir(dir = DEFAULT_LIBRARY_DIR) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`[PathGuru Library] Created reference library folder: ${dir}`);
  }
  return dir;
}

/* ── List PDF files in the library ───────────────────────────────────── */
export async function listLibraryFiles(dir = DEFAULT_LIBRARY_DIR) {
  const now = Date.now();
  if (_libraryFiles && (now - _lastScanMs) < SCAN_TTL_MS) return _libraryFiles;

  ensureLibraryDir(dir);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    _libraryFiles = entries
      .filter(e => e.isFile() && /\.(pdf|txt|md)$/i.test(e.name))
      .map(e => ({ name: e.name, path: path.join(dir, e.name) }));
    _lastScanMs = now;
    return _libraryFiles;
  } catch {
    return [];
  }
}

/* ── Get the library context string for a given style ────────────────── */
export async function getLibraryContext(style = 'modern', dir = DEFAULT_LIBRARY_DIR) {
  // Check extracted profiles first, then fall back to baked profiles
  const savedProfiles = await loadSavedProfiles().catch(() => ({}));
  const profile = savedProfiles[style] || BAKED_PROFILES[style];
  const files   = await listLibraryFiles(dir);

  const fileList = files.length
    ? `\nReference PDFs in library (${files.length} files):\n${files.map(f => `  • ${f.name}`).join('\n')}`
    : '';

  if (!profile) {
    return fileList
      ? `REFERENCE LIBRARY:${fileList}\n\nApply professional non-fiction publishing standards matching these reference works.`
      : '';
  }

  return `
REFERENCE LIBRARY — MATCH THESE STANDARDS:
Publisher: ${profile.name}
Reference books: ${profile.books.join(', ')}
${fileList}

${profile.coverDNA}

${profile.interiorDNA}

${profile.editorialDNA}

INSTRUCTION: The output must be indistinguishable in quality and design from the above reference works.
`.trim();
}

/* ── Inject library context into editorial prompt ────────────────────── */
export async function injectLibraryContext(basePrompt, style = 'modern', dir = DEFAULT_LIBRARY_DIR) {
  const ctx = await getLibraryContext(style, dir);
  if (!ctx) return basePrompt;

  // Insert before the ABSOLUTE RULES section
  return basePrompt.replace(
    /ABSOLUTE RULES/,
    `${ctx}\n\nABSOLUTE RULES`
  );
}

/* ── Get library summary for display ─────────────────────────────────── */
export async function getLibrarySummary(dir = DEFAULT_LIBRARY_DIR) {
  const files = await listLibraryFiles(dir);
  return {
    location: dir,
    fileCount: files.length,
    files: files.map(f => f.name),
    bakedProfiles: Object.keys(BAKED_PROFILES).map(k => ({
      style: k,
      publisher: BAKED_PROFILES[k].name,
      books: BAKED_PROFILES[k].books,
    })),
    instructions: [
      `Drop any PDF into: ${dir}`,
      'The agent will list it in prompts automatically.',
      'For full design DNA extraction, baked profiles cover Digital Nation Inc. and PathFinda Publishers.',
      'To add a new publisher profile, add an entry to BAKED_PROFILES in referenceLibrary.js.',
    ],
  };
}
