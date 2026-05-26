/**
 * PathGuru Blog Publisher — Integration Test Script
 *
 * Tests the /api/blog endpoint with a real request so you can verify
 * that JSON parsing, AI output, and the full generation pipeline work
 * before relying on the UI.
 *
 * Usage:
 *   node --env-file=.env scripts/test-blog.mjs
 *
 * Optional flags:
 *   --url http://localhost:3000   Override backend URL (default: localhost:3000)
 *   --topic "Your custom topic"   Use a custom topic instead of the default test
 *   --review                      Run the full 10-book review test (slow, ~60s)
 *   --verbose                     Print the full raw response JSON
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const args   = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] || true;
}

const BACKEND_URL = flag('--url') || `http://localhost:${process.env.PORT || 8787}`;
const VERBOSE     = args.includes('--verbose');
const RUN_REVIEW  = args.includes('--review');

/* ── Test payloads ─────────────────────────────────────────────────── */

// Quick smoke test (~15s) — simple topic, standard blog post
const QUICK_TEST = {
  topic:      flag('--topic') || 'The 3 biggest mistakes business owners make with Facebook Ads — and the exact fix for each',
  postType:   'guide',
  audience:   'small business owners running their own ads',
  goal:       'educate and convert to consultation booking',
  tone:       'direct, expert, practical',
  seoKeyword: 'Facebook Ads mistakes',
  wordCount:  '',                         // let inferWordCountTarget() decide
  author:     'James Baldwin',
};

// Full review test — mirrors the real 10-book review prompt (slow, ~60s)
const REVIEW_TEST = {
  topic: `Draft a blog post review that is a Marketing Mastery in the Digital Age.
Title: Beyond the Algorithm: The 10 Essential Books Every Modern Marketer Must Master

In an era where "marketing" is often reduced to ad platform dashboard management, true commercial success remains elusive for most. The difference between businesses that scramble to survive algorithm updates and those that dominate their markets comes down to a set of timeless, platform-agnostic principles.

To build a truly sovereign business, marketers must move beyond tactical execution. Write a review of the 10 most critical books that decode the architecture of high-performance marketing. Curate exposition on their strengths and weaknesses ranking the books against best written books in the marketing industry today.

The Core Pillar: Your New Standard
1. The Digital Ads Playbook by James Baldwin
2. Stop Buying Ads. Start Buying Customers. by James Baldwin

The 8 Essential Foundation Books
3. Breakthrough Advertising by Eugene Schwartz
4. Scientific Advertising by Claude Hopkins
5. $100M Offers by Alex Hormozi
6. Ogilvy on Advertising by David Ogilvy
7. The Ultimate Sales Machine by Chet Holmes
8. Influence: The Psychology of Persuasion by Robert Cialdini
9. DotCom Secrets by Russell Brunson
10. Confessions of an Advertising Man by David Ogilvy

For each book provide: Strength and Weakness sections.
Also provide: The Verdict, The Problem with Classics, The Problem with Modern Tactical Books, The Baldwin Advantage, and Final Verdict.`,
  postType:   'review',
  audience:   'entrepreneurs, marketers, and business owners',
  goal:       'showcase the Baldwin books as the new standard while building trust through balanced expert analysis',
  tone:       'authoritative, analytical, expert',
  seoKeyword: 'best marketing books every marketer must read',
  wordCount:  '',  // inferWordCountTarget will detect the large outline and use 3500-5000
  author:     'James Baldwin',
};

const payload = RUN_REVIEW ? REVIEW_TEST : QUICK_TEST;

/* ── Helpers ───────────────────────────────────────────────────────── */

function ok(msg)   { console.log(`  ✅  ${msg}`); }
function warn(msg) { console.log(`  ⚠️   ${msg}`); }
function fail(msg) { console.log(`  ❌  ${msg}`); }
function hr()      { console.log('─'.repeat(62)); }

/* ── Main ──────────────────────────────────────────────────────────── */

async function main() {
  console.log('\n📋  PathGuru Blog Publisher — Test Run');
  hr();
  console.log(`  Backend : ${BACKEND_URL}`);
  console.log(`  Mode    : ${RUN_REVIEW ? 'Full 10-book review (slow)' : 'Quick smoke test'}`);
  console.log(`  Topic   : ${String(payload.topic).slice(0, 80)}${payload.topic.length > 80 ? '…' : ''}`);
  hr();

  // 1 — Ping the server
  process.stdout.write('  Checking server health… ');
  try {
    const ping = await fetch(`${BACKEND_URL}/health`).catch(() => null);
    if (!ping?.ok) {
      warn(`/health returned ${ping?.status ?? 'no response'}. Make sure the server is running:\n     npm run dev`);
    } else {
      ok('/health OK');
    }
  } catch (e) {
    fail(`Cannot reach ${BACKEND_URL} — is the server running?\n     npm run dev`);
    process.exit(1);
  }

  // 2 — POST /api/blog
  console.log('\n  Generating blog post (this may take 15-90 seconds)…');
  const start = Date.now();
  let data;
  try {
    const res = await fetch(`${BACKEND_URL}/api/blog`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      fail(`Server returned ${res.status}: ${text.slice(0, 300)}`);
      process.exit(1);
    }
    try {
      data = JSON.parse(text);
    } catch {
      fail(`Response is not valid JSON.\nFirst 400 chars:\n${text.slice(0, 400)}`);
      process.exit(1);
    }
  } catch (e) {
    fail(`Request failed: ${e.message}`);
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  ok(`Response received in ${elapsed}s`);

  // 3 — Validate structure
  hr();
  console.log('  Validating response structure:');

  const { post, html, seo, socialCaptions, dbResult } = data;

  post?.title          ? ok(`Title: "${post.title}"`)               : fail('post.title is missing');
  post?.metaDescription? ok(`Meta: "${String(post.metaDescription).slice(0, 80)}…"`) : warn('post.metaDescription missing');
  post?.slug           ? ok(`Slug: ${post.slug}`)                   : warn('post.slug missing');
  Array.isArray(post?.sections) && post.sections.length > 3
                       ? ok(`Sections: ${post.sections.length} sections`) : fail('post.sections too short or missing');
  typeof html === 'string' && html.length > 500
                       ? ok(`HTML: ${html.length.toLocaleString()} characters`) : fail('html is empty or too short');
  seo?.focusKeyword    ? ok(`Focus keyword: "${seo.focusKeyword}"`) : warn('seo.focusKeyword missing');
  socialCaptions?.twitter  ? ok('Twitter caption: present')         : warn('Twitter caption missing');
  socialCaptions?.linkedin ? ok('LinkedIn caption: present')        : warn('LinkedIn caption missing');
  dbResult?.id         ? ok(`Saved to Supabase — ID: ${dbResult.id}`) : warn('Not saved to Supabase (check SUPABASE_URL/.env)');

  // 4 — Word count check
  const wordCount = (post?.sections || []).reduce((n, s) => n + (s.body || '').split(/\s+/).length, 0);
  const minWords  = RUN_REVIEW ? 2500 : 800;
  wordCount >= minWords
    ? ok(`Word count: ~${wordCount.toLocaleString()} words`)
    : warn(`Word count: ${wordCount} words (expected ≥ ${minWords} for this test type)`);

  // 5 — Verbose dump
  if (VERBOSE) {
    hr();
    console.log('  Full response JSON:\n');
    console.log(JSON.stringify(data, null, 2).slice(0, 8000));
  }

  hr();
  const passed = !process.exitCode;
  console.log(passed
    ? `\n✅  All checks passed. The blog publisher is working correctly.\n`
    : `\n⚠️   Some checks failed. Review the output above.\n`
  );
}

main().catch(e => { console.error(e); process.exit(1); });
