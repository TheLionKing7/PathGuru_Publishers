#!/usr/bin/env node
/**
 * PathGuru — PDF Design Profile Extractor
 * =========================================
 * Drop a reference PDF and extract its design DNA into a named profile.
 *
 * Usage:
 *   node scripts/extract-pdf-profile.js <pdf-path> <profile-name>
 *
 * Examples:
 *   node scripts/extract-pdf-profile.js "reference-library/Decode_Financing.pdf" "van_shelby"
 *   node scripts/extract-pdf-profile.js "reference-library/Digital_Ads_Playbook.pdf" "james_baldwin"
 *   node scripts/extract-pdf-profile.js "C:/Users/DELL/Documents/WorkSpace/Products/Ebooks/Real Estate/Decode_Financing_Van_Shelby.pdf" "van_shelby_finance"
 *
 * After running, use the profile by name in any generation request:
 *   POST /api/generate  { "publisher": "van_shelby", ... }
 *   -- OR --
 *   POST /api/generate  { "style": "van_shelby_finance", ... }
 *
 * The profile is stored at:
 *   reference-library/profiles/<profile-name>.json
 */

// Load .env
try {
  const { createRequire } = await import('node:module');
  createRequire(import.meta.url)('dotenv').config({ path: new URL('../.env', import.meta.url) });
} catch {}

import { extractPdfProfile } from '../backend/pdfDesignExtractor.js';
import path from 'node:path';

const args = process.argv.slice(2);

if (args.length < 2 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         PathGuru — PDF Design Profile Extractor              ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  node scripts/extract-pdf-profile.js <pdf-path> <profile-name>

Arguments:
  pdf-path       Path to the reference PDF (absolute or relative to project root)
  profile-name   Short name to save the profile as (letters, numbers, underscores)
                 e.g. van_shelby, james_baldwin, my_premium_style

Examples:
  node scripts/extract-pdf-profile.js "reference-library/MyBook.pdf" "my_style"
  node scripts/extract-pdf-profile.js "C:/Users/DELL/Documents/WorkSpace/Products/Ebooks/Real Estate/Decode_Financing_Van_Shelby.pdf" "van_shelby_finance"

After extraction, use the profile name in generation:
  { "publisher": "van_shelby_finance" }   -- in your POST /api/generate body

Profiles are stored in:  reference-library/profiles/
  `);
  process.exit(0);
}

const [pdfPathRaw, profileName] = args;

// Resolve path relative to project root if not absolute
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pdfPath = path.isAbsolute(pdfPathRaw)
  ? pdfPathRaw
  : path.resolve(projectRoot, pdfPathRaw);

const safeName = profileName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

console.log(`\n📚 PathGuru PDF Design Extractor`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`PDF:     ${pdfPath}`);
console.log(`Profile: ${safeName}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

try {
  const profile = await extractPdfProfile(pdfPath, safeName);

  console.log(`\n✅ Profile extracted successfully!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Name:       ${profile.name}`);
  console.log(`Style key:  ${profile.style}`);
  console.log(`Pages:      ${profile._raw?.pageSpec?.trimSize || 'detected'}`);
  console.log(`Palette:    Primary ${profile.colorPalette?.primary || 'n/a'}, Accent ${profile.colorPalette?.accent || 'n/a'}`);
  console.log(`Fonts:      ${profile.typography?.headingFont || 'n/a'} / ${profile.typography?.bodyFont || 'n/a'}`);
  console.log(`Callouts:   ${profile.calloutTypes?.join(', ') || 'n/a'}`);
  console.log(`Saved to:   reference-library/profiles/${safeName}.json`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\nTo use in generation, add to your request body:`);
  console.log(`  { "publisher": "${safeName}" }`);
  console.log(`  -- or --`);
  console.log(`  { "style": "${safeName}" }\n`);

} catch (err) {
  console.error(`\n❌ Extraction failed: ${err.message}`);
  if (err.message.includes('No AI provider')) {
    console.error(`   Add GEMINI_API_KEY or CLAUDE_API_KEY to your .env file.`);
  }
  process.exit(1);
}
