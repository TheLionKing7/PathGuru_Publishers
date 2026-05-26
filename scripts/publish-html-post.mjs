/**
 * PathGuru — Publish Pre-Written HTML Post
 *
 * Reads a local HTML file and saves it to BOTH Supabase and DigiFusion CMS
 * by routing through the PathGuru backend server (POST /api/posts).
 * This uses the same Supabase connection the AI pipeline uses, so RLS
 * is never an issue.
 *
 * REQUIRES: the backend server must be running  →  npm run dev
 *
 * Usage (PowerShell — everything on one line):
 *   node --env-file=.env scripts/publish-html-post.mjs --file ./scripts/posts/beyond-the-algorithm-10-books-every-marketer-must-master.html --status published
 *
 * Flags:
 *   --file      Path to the HTML file (required)
 *   --url       Backend URL (default: http://localhost:3000)
 *   --title     Post title (extracted from <title> tag if omitted)
 *   --slug      URL slug (derived from title if omitted)
 *   --meta      Meta description (from <meta name="description"> if omitted)
 *   --keyword   SEO focus keyword
 *   --author    Author name (default: James Baldwin)
 *   --type      Post type: article | guide | review | case_study (default: review)
 *   --status    published | draft (default: published)
 *   --dry-run   Print the payload without sending anything
 */

import { readFileSync } from 'fs';
import { resolve }      from 'path';

const args = process.argv.slice(2);

function flag(name, fallback = null) {
  const i = args.indexOf(name);
  if (i === -1 || !args[i + 1]) return fallback;
  return args[i + 1];
}

const DRY_RUN     = args.includes('--dry-run');
const SKIP_CMS    = args.includes('--skip-cms');    // skip DigiFusion, Supabase only
const SKIP_DB     = args.includes('--skip-db');     // skip Supabase, DigiFusion only
const FILE_PATH   = flag('--file');
const BACKEND_URL = (flag('--url') || 'http://localhost:8787').replace(/\/$/, '');

if (!FILE_PATH) {
  console.error('\n  --file is required. Example:\n');
  console.error('  node --env-file=.env scripts/publish-html-post.mjs --file ./scripts/posts/my-post.html --status published\n');
  process.exit(1);
}

/* ── Load HTML ─────────────────────────────────────────────────────── */
const html = readFileSync(resolve(FILE_PATH), 'utf8');

/* ── Extract meta from HTML tags ───────────────────────────────────── */
function extract(pattern) {
  const m = html.match(pattern);
  return m ? m[1].trim() : null;
}

const htmlTitle   = extract(/<title>([^<]+)<\/title>/i);
const htmlMeta    = extract(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
                 || extract(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
const htmlKeyword = extract(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i);

const title    = flag('--title')   || htmlTitle  || 'Untitled Post';
const metaDesc = flag('--meta')    || htmlMeta   || '';
const keyword  = flag('--keyword') || (htmlKeyword || '').split(',')[0].trim();
const author   = flag('--author')  || 'James Baldwin';
const postType = flag('--type')    || 'review';
const status   = flag('--status')  || 'published';

const rawSlug  = flag('--slug') || title
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 100);

const plainText   = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const wordCount   = plainText.split(/\s+/).length;
const readingTime = Math.max(1, Math.round(wordCount / 200));

/* ── Build payload ─────────────────────────────────────────────────── */
const payload = {
  title,
  slug:                  rawSlug,
  excerpt:               metaDesc.slice(0, 200) || '',
  content:               html,
  post_type:             postType,
  status,
  meta_description:      metaDesc,
  focus_keyword:         keyword,
  featured_image_url:    null,
  featured_image_credit: '',
  social_caption:        '',
  linkedin_caption:      '',
  categories:            ['Marketing', 'Book Reviews'],
  tags:                  ['marketing books', 'digital advertising', 'James Baldwin', 'sovereign business', 'book review'],
  author_name:           author,
  reading_time_minutes:  readingTime,
  word_count:            wordCount,
};

/* ── Helpers ───────────────────────────────────────────────────────── */
function hr()      { console.log('─'.repeat(62)); }
function ok(m)     { console.log(`  ✅  ${m}`); }
function warn(m)   { console.log(`  ⚠️   ${m}`); }
function fail(m)   { console.log(`  ❌  ${m}`); }

/* ── Summary ───────────────────────────────────────────────────────── */
console.log('\n📤  PathGuru — Publish HTML Post');
console.log('    Supabase DB  +  DigiFusion CMS  (via backend)');
hr();
console.log(`  File    : ${FILE_PATH}`);
console.log(`  Title   : ${title}`);
console.log(`  Slug    : ${rawSlug}`);
console.log(`  Type    : ${postType}`);
console.log(`  Status  : ${status}`);
console.log(`  Words   : ~${wordCount.toLocaleString()} (${readingTime} min read)`);
console.log(`  Author  : ${author}`);
console.log(`  Backend : ${BACKEND_URL}`);
if (SKIP_CMS) console.log('  Mode    : Supabase only (--skip-cms)');
if (SKIP_DB)  console.log('  Mode    : DigiFusion only (--skip-db)');
hr();

/* ── Dry run ───────────────────────────────────────────────────────── */
if (DRY_RUN) {
  console.log('\n  DRY RUN — payload that would be sent to POST /api/posts:\n');
  const preview = { ...payload, content: `[${html.length.toLocaleString()} chars of HTML — omitted for readability]` };
  console.log(JSON.stringify(preview, null, 2));
  console.log('\n  Remove --dry-run to actually publish.\n');
  process.exit(0);
}

/* ── Ping server ───────────────────────────────────────────────────── */
try {
  const ping = await fetch(`${BACKEND_URL}/health`).catch(() => null);
  if (!ping?.ok) {
    fail(`Cannot reach ${BACKEND_URL} — start the server first:\n\n     npm run dev\n`);
    process.exit(1);
  }
} catch {
  fail(`Cannot reach ${BACKEND_URL} — start the server first:\n\n     npm run dev\n`);
  process.exit(1);
}

/* ── POST /api/posts ───────────────────────────────────────────────── */
// The backend endpoint saves to Supabase first, then upserts to DigiFusion.
// Using the backend means we get the same authenticated Supabase client
// that the AI pipeline uses — no RLS issues.
console.log('\n  Saving post via backend…');

try {
  const res  = await fetch(`${BACKEND_URL}/api/posts`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...payload, _skipCms: SKIP_CMS, _skipDb: SKIP_DB }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    fail(`Backend returned ${res.status}: ${data?.error || JSON.stringify(data).slice(0, 200)}`);
    process.exit(1);
  }

  hr();

  // Supabase result
  if (data.supabase?.id) {
    ok(`Supabase saved — ID: ${data.supabase.id}`);
  } else {
    warn('Supabase: not saved (check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env)');
  }

  // DigiFusion CMS result
  const cms = data.cms;
  if (cms) {
    ok(`DigiFusion CMS saved — slug: ${cms.slug || rawSlug}`);
    if (cms.id) console.log(`  CMS ID   : ${cms.id}`);
  } else {
    warn('DigiFusion CMS: no response (check DIGIFUSION_API_URL and DIGIFUSION_CMS_TOKEN in .env)');
  }

  const cmsBase = (process.env.DIGIFUSION_API_URL || '').replace(/\/api.*/, '').replace(/\/$/, '');
  if (cmsBase) {
    console.log(`\n  Live URL : ${cmsBase}/blog/${cms?.slug || rawSlug}`);
  }

  hr();
  console.log();

} catch (e) {
  fail(`Request failed: ${e.message}`);
  process.exit(1);
}
