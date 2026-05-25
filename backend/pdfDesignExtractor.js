/**
 * PathGuru Publishers — PDF Design Extractor
 * ============================================
 * Analyses a reference PDF and uses AI to extract its complete design DNA,
 * then stores it as a named profile you can call by name in any generation.
 *
 * Called from:  scripts/extract-pdf-profile.js  (CLI)
 * Called from:  server.js  POST /api/library/extract
 *
 * How it works:
 *   1. Reads the PDF text using pdf-lib (basic) + pdftotext if available
 *   2. Sends text + metadata to AI with a structured extraction prompt
 *   3. Saves the result to reference-library/profiles/{name}.json
 *   4. referenceLibrary.js auto-loads all saved profiles on next call
 *
 * Stored profile shape:
 * {
 *   name:          "Van Shelby — Decode Financing",
 *   style:         "decode_financing",
 *   sourceFile:    "Decode_Financing_Van_Shelby.pdf",
 *   extractedAt:   "2026-05-25T...",
 *   coverDNA:      "...",
 *   interiorDNA:   "...",
 *   editorialDNA:  "...",
 *   colorPalette:  { primary, secondary, accent, background, callout },
 *   typography:    { heading, body, accent },
 *   calloutTypes:  ["insider", "formula", "checklist", ...],
 *   pageSpec:      { width, height, margins, columns },
 * }
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync }                 from 'node:fs';
import { execSync }                   from 'node:child_process';
import path                           from 'node:path';
import { PDFDocument }                from 'pdf-lib';
import { callAiProvider, resolveProvider } from './aiPipeline.js';

const PROFILES_DIR = process.env.REFERENCE_LIBRARY_DIR
  ? path.join(process.env.REFERENCE_LIBRARY_DIR, 'profiles')
  : path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'reference-library', 'profiles');

/* ── Main export ─────────────────────────────────────────────────── */
export async function extractPdfProfile(pdfPath, profileName) {
  if (!existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  console.log(`[Extractor] Reading PDF: ${path.basename(pdfPath)}`);
  const { text, pageCount, fileSizeKb } = await extractPdfContent(pdfPath);

  console.log(`[Extractor] Extracted ${text.length} chars from ${pageCount} pages`);
  console.log(`[Extractor] Sending to AI for design analysis...`);

  const profile = await analyseWithAi(text, pdfPath, pageCount, fileSizeKb, profileName);

  await saveProfile(profileName, profile);
  console.log(`[Extractor] ✓ Profile saved: ${profileName}`);
  return profile;
}

/* ── PDF text extraction ─────────────────────────────────────────── */
async function extractPdfContent(pdfPath) {
  const bytes = await readFile(pdfPath);
  const fileSizeKb = Math.round(bytes.length / 1024);

  // Basic info from pdf-lib
  let pageCount = 0;
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    pageCount = doc.getPageCount();
  } catch {}

  // Try pdftotext (poppler) for clean text extraction
  let text = '';
  try {
    text = execSync(`pdftotext "${pdfPath}" -`, { maxBuffer: 5 * 1024 * 1024 }).toString('utf8');
  } catch {
    // pdftotext not available — use raw byte text extraction
    text = bytes.toString('latin1').replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Limit to first 12,000 chars (enough for structure analysis, not overwhelming)
  const sample = text.slice(0, 12000);

  return { text: sample, pageCount, fileSizeKb };
}

/* ── AI design analysis prompt ───────────────────────────────────── */
function buildExtractionPrompt(text, fileName, pageCount, fileSizeKb) {
  return `You are a senior book designer and brand analyst at a top publishing house.

Analyse the following PDF book content and extract its complete design DNA.
This profile will be used to replicate this publisher's exact visual and editorial style.

PDF METADATA:
- File: ${fileName}
- Pages: ${pageCount}
- Size: ${fileSizeKb} KB

PDF TEXT SAMPLE (first portion of book):
"""
${text}
"""

Return STRICT JSON ONLY — no markdown, no explanation, no code fences.

{
  "publisherName": "inferred publisher name",
  "bookTitle": "book title if identifiable",
  "authorName": "author name if identifiable",

  "colorPalette": {
    "primary": "#hex — main background or dominant colour",
    "secondary": "#hex — heading/title colour",
    "accent": "#hex — callout boxes, rules, borders",
    "pageBackground": "#hex — body page background",
    "calloutBackground": "#hex — callout box background",
    "textColor": "#hex — main body text"
  },

  "typography": {
    "headingFont": "font family name or 'serif'/'sans-serif'",
    "bodyFont": "font family name or description",
    "accentFont": "font used for labels/eyebrows",
    "bodySize": "e.g. 10.5pt",
    "leading": "e.g. 1.65",
    "headingSize": "e.g. 22pt"
  },

  "pageSpec": {
    "trimSize": "e.g. 6x9in or Letter",
    "marginInner": "e.g. 0.875in",
    "marginOuter": "e.g. 0.75in",
    "columns": 1
  },

  "coverDNA": "3–5 sentence description of the cover design: background, hero visual element, title treatment, author placement, colour usage, any stats bars or data elements",

  "interiorDNA": "5–8 sentence description of interior layout: chapter openers, running headers, footer style, callout box types and styling, table styling, list styling, pull quote treatment, any special page types",

  "editorialDNA": "3–5 sentence description of the writing style: chapter length, voice, paragraph rhythm, use of data and statistics, how callouts are used, checklist format, how the book flows",

  "calloutTypes": ["list each callout box type found, e.g. 'insider_secret', 'formula', 'checklist', 'pullquote', 'tip', 'warning'"],

  "structurePattern": "describe the book's section structure: parts, chapters, special sections like worksheets or reference appendices",

  "coverDnaShort": "one sentence: the single most distinctive visual element of this cover that makes it premium",

  "recommendedStyle": "premium | modern | bold | digitalNation | pathfinda — which closest matches this publisher's DNA"
}

Be specific and actionable. If you cannot determine something from the text, make an educated inference based on industry standards for this type of book.`;
}

/* ── Call AI ─────────────────────────────────────────────────────── */
async function analyseWithAi(text, pdfPath, pageCount, fileSizeKb, profileName) {
  const provider = resolveProvider();
  if (!provider) {
    throw new Error('No AI provider configured. Add GEMINI_API_KEY or CLAUDE_API_KEY to .env');
  }

  const prompt = buildExtractionPrompt(text, path.basename(pdfPath), pageCount, fileSizeKb);
  const raw = await callAiProvider(provider, prompt);

  let parsed;
  try {
    const clean = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error(`AI returned non-JSON response. First 200 chars: ${raw.slice(0, 200)}`);
    }
  }

  // Build the full profile
  return {
    name:          parsed.publisherName || profileName,
    style:         toStyleKey(profileName),
    sourceFile:    path.basename(pdfPath),
    extractedAt:   new Date().toISOString(),
    books:         parsed.bookTitle ? [`${parsed.bookTitle}${parsed.authorName ? ` (${parsed.authorName})` : ''}`] : [],
    colorPalette:  parsed.colorPalette   || {},
    typography:    parsed.typography     || {},
    pageSpec:      parsed.pageSpec       || {},
    coverDNA:      buildCoverDna(parsed),
    interiorDNA:   buildInteriorDna(parsed),
    editorialDNA:  buildEditorialDna(parsed),
    calloutTypes:  parsed.calloutTypes   || [],
    structurePattern: parsed.structurePattern || '',
    recommendedStyle: parsed.recommendedStyle || 'modern',
    _raw:          parsed,
  };
}

/* ── Profile builders ────────────────────────────────────────────── */
function buildCoverDna(p) {
  const pal = p.colorPalette || {};
  return `
COVER DNA — ${p.publisherName || 'Publisher'}:
${p.coverDNA || 'Premium professional cover design.'}
Key visual: ${p.coverDnaShort || 'Strong typographic hierarchy with brand colours.'}
Palette: Primary ${pal.primary || 'dark'}, Accent ${pal.accent || 'gold'}, Background ${pal.pageBackground || 'white'}`.trim();
}

function buildInteriorDna(p) {
  const pal = p.colorPalette || {};
  const typo = p.typography || {};
  return `
INTERIOR DNA — ${p.publisherName || 'Publisher'}:
${p.interiorDNA || 'Clean professional interior layout.'}
Typography: Headings in ${typo.headingFont || 'bold sans-serif'} ${typo.headingSize || '22pt'}, body in ${typo.bodyFont || 'sans-serif'} ${typo.bodySize || '10.5pt'} / ${typo.leading || '1.65'} leading.
Callout types used: ${(p.calloutTypes || []).join(', ') || 'standard callouts'}
Page spec: ${p.pageSpec?.trimSize || '6x9in'}, inner margin ${p.pageSpec?.marginInner || '0.875in'}`.trim();
}

function buildEditorialDna(p) {
  return `
EDITORIAL STANDARDS — ${p.publisherName || 'Publisher'}:
${p.editorialDNA || 'Professional non-fiction editorial standards.'}
Structure: ${p.structurePattern || 'Standard chapter-based non-fiction structure.'}`.trim();
}

/* ── Save to disk ────────────────────────────────────────────────── */
async function saveProfile(profileName, profile) {
  if (!existsSync(PROFILES_DIR)) {
    await mkdir(PROFILES_DIR, { recursive: true });
  }
  const filePath = path.join(PROFILES_DIR, `${toStyleKey(profileName)}.json`);
  await writeFile(filePath, JSON.stringify(profile, null, 2), 'utf8');
  return filePath;
}

/* ── Load all saved profiles ─────────────────────────────────────── */
export async function loadSavedProfiles() {
  if (!existsSync(PROFILES_DIR)) return {};
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(PROFILES_DIR).catch(() => []);
  const profiles = {};
  for (const f of files.filter(f => f.endsWith('.json'))) {
    try {
      const content = await readFile(path.join(PROFILES_DIR, f), 'utf8');
      const profile = JSON.parse(content);
      profiles[profile.style || f.replace('.json', '')] = profile;
    } catch {}
  }
  return profiles;
}

/* ── Helper ──────────────────────────────────────────────────────── */
function toStyleKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
