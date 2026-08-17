#!/usr/bin/env node
/**
 * Set a distinct featured image on each of the three articles.
 *
 * Article 3 is published and the date is fixed; only the images are outstanding.
 * The previous run failed because uploadMediaAsset returns { url: null } when
 * R2_PUBLIC_URL is not set — the object uploads fine, but there is no public URL
 * to hand the CMS. This resolves a usable URL, PROVES it serves a 200 before
 * writing, and refuses to write null.
 *
 *   node --env-file=.env --env-file=.env.local backend/scripts/fix_images.mjs
 *
 * --dry  resolve and verify URLs, write nothing
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = (r) => path.join(REPO, ...r.split('/'));
const LOG = P('content/fix_images.log');
const buf = [];
const line = (...a) => { const s = a.join(' '); buf.push(s); console.log(s);
  try { fs.writeFileSync(LOG, buf.join('\n') + '\n'); } catch {} };
const rule = () => line('-'.repeat(88));
const DRY = process.argv.includes('--dry');

const PROD = 'https://www.digitafusion.com';
let base = process.env.DIGIFUSION_API_URL || PROD;
if (/localhost|127\.0\.0\.1/.test(base)) base = PROD;
process.env.DIGIFUSION_API_URL = base.replace(/\/$/, '');
const SITE = process.env.DIGIFUSION_API_URL;

const JOBS = [
  ['the-friction-tax',                                             'content/article1-friction-tax-hero.png'],
  ['why-corporate-ai-pilots-fail',                                 'content/article2-legibility-threshold-hero.png'],
  ['the-arithmetic-audit-six-questions-that-break-most-business-cases', 'content/article3-arithmetic-audit-hero.png'],
];

line(`fix_images — ${new Date().toISOString()}`);
line(`CMS: ${SITE} · DRY=${DRY}`);
rule();

/* ── where can a stored object actually be served from? ─────────────────── */
line('R2 / MEDIA CONFIGURATION');
const r2pub = process.env.R2_PUBLIC_URL || process.env.CLOUDFLARE_R2_PUBLIC_URL || '';
line(`  R2_PUBLIC_URL        : ${r2pub || '*** NOT SET — this is why url came back null ***'}`);
for (const k of ['CLOUDFLARE_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_BUCKET', 'CLOUDFLARE_API_TOKEN', 'R2_ACCESS_KEY_ID'])
  line(`  ${k.padEnd(21)}: ${process.env[k] ? 'set' : 'not set'}`);

// candidate hosts that might serve /api/media/<key>
const mediaHosts = [
  process.env.PATHGURU_PUBLIC_URL,
  process.env.PUBLIC_BASE_URL,
  'https://pathguru-publishers-api.onrender.com',
  'https://pathguru-publishers.onrender.com',
  SITE,
].filter(Boolean);
line(`  media host candidates: ${mediaHosts.join(', ')}`);
rule();

const ok200 = async (url) => {
  try {
    const r = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15000) });
    const ct = r.headers.get('content-type') || '';
    return { ok: r.ok && /image/i.test(ct), status: r.status, ct };
  } catch (e) { return { ok: false, status: 0, ct: e.cause?.code || e.message }; }
};

const { getPost, upsertPost } = await import('../cmsClient.js');
const { uploadMediaAsset } = await import('../cloudflareR2.js');

const results = [];
for (const [slug, file] of JOBS) {
  line(''); line(slug); rule();
  const abs = P(file);
  if (!fs.existsSync(abs)) { line(`  MISSING FILE ${file}`); results.push([slug, null]); continue; }

  // 1. upload
  let asset;
  try {
    asset = await uploadMediaAsset(path.basename(abs), fs.readFileSync(abs), 'image/png');
    line(`  uploaded  key       : ${asset.key}`);
    line(`            url       : ${asset.url || 'null (R2_PUBLIC_URL unset)'}`);
    line(`            servePath : ${asset.servePath}`);
  } catch (e) { line(`  UPLOAD FAILED: ${e.message}`); results.push([slug, null]); continue; }

  // 2. resolve a URL that actually serves an image
  const candidates = [];
  if (asset.url) candidates.push(asset.url);
  if (r2pub) candidates.push(`${r2pub.replace(/\/$/, '')}/${asset.key}`);
  for (const h of mediaHosts) candidates.push(`${h.replace(/\/$/, '')}${asset.servePath}`);

  let usable = null;
  for (const c of candidates) {
    const v = await ok200(c);
    line(`  probe ${v.ok ? 'OK  ' : 'no  '} HTTP ${String(v.status).padEnd(3)} ${v.ct.slice(0, 28).padEnd(28)} ${c.slice(0, 92)}`);
    if (v.ok) { usable = c; break; }
  }

  if (!usable) {
    line('  NO SERVABLE URL FOUND — refusing to write null again.');
    results.push([slug, null]);
    continue;
  }
  line(`  using: ${usable}`);

  if (DRY) { results.push([slug, usable + ' (dry)']); continue; }

  // 3. write, re-reading the full post first so the body is never clobbered
  const cur = (await getPost(slug))?.data;
  if (!cur?.slug) { line('  could not read post'); results.push([slug, null]); continue; }
  if (!cur.content || cur.content.length < 200) {
    line(`  REFUSING — body is ${(cur.content || '').length} bytes`); results.push([slug, null]); continue;
  }
  await upsertPost({
    slug: cur.slug, title: cur.title, content: cur.content,
    excerpt: cur.excerpt || '', status: cur.status || 'published',
    post_type: cur.post_type || 'article',
    meta_description: cur.meta_description || '', focus_keyword: cur.focus_keyword || '',
    categories: cur.categories || [], tags: cur.tags || [],
    author_name: cur.author_name || 'Boroji Adebayo-Hopewell',
    reading_time_minutes: cur.reading_time_minutes || 5, word_count: cur.word_count || 0,
    social_caption: cur.social_caption || '', linkedin_caption: cur.linkedin_caption || '',
    featured_image_url: usable, featured_image_credit: 'DigiFusion',
  });

  // 4. verify
  const after = (await getPost(slug))?.data;
  const got = after?.featured_image_url;
  line(`  verified: ${got || 'STILL NULL — the CMS discarded it'}`);
  results.push([slug, got || null]);
}

/* ── summary: are all three different? ────────────────────────────────── */
line(''); line('SUMMARY'); rule();
for (const [slug, url] of results) line(`  ${url ? 'SET ' : 'FAIL'} ${slug}\n       ${url || '(none — still showing the site fallback)'}`);
const set = results.map(([, u]) => u).filter(Boolean);
const distinct = new Set(set).size;
line('');
line(`  ${set.length} of ${results.length} images set · ${distinct} distinct URL${distinct === 1 ? '' : 's'}`);
if (set.length === 3 && distinct === 3) line('  ALL THREE ARTICLES NOW HAVE THEIR OWN IMAGE.');
else if (!set.length) {
  line('');
  line('  NOTHING WAS SET. The images are in R2 but nothing can serve them publicly.');
  line('  Fix by adding to .env the public base for your R2 bucket:');
  line('');
  line('     R2_PUBLIC_URL=https://<your-r2-public-domain>');
  line('');
  line('  It is already expected in render.yaml (sync: false), so the production');
  line('  service has it — copy the value from the Render dashboard for');
  line('  pathguru-publishers-api into your local .env, then re-run this script.');
}
line(''); line(`log: ${LOG}`);
