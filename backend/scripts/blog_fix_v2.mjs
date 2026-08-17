#!/usr/bin/env node
/**
 * Publishes Article 3 and repairs the date/image collision on the two earlier
 * articles. Writes a full transcript to content/blog_fix.log so a failure can be
 * diagnosed without anyone copying terminal output.
 *
 * From the repo root:
 *   node --env-file=.env --env-file=.env.local backend/scripts/blog_fix_v2.mjs
 *
 * --dry   report only, write nothing
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const P = (rel) => path.join(REPO, ...rel.split('/'));
const LOG = P('content/blog_fix.log');

const DRY = process.argv.includes('--dry');

/* ── tee every line to console AND the log file ───────────────────────── */
const buf = [];
const line = (...a) => {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  buf.push(s); console.log(s);
  try { fs.writeFileSync(LOG, buf.join('\n') + '\n'); } catch { /* ignore */ }
};
const rule = () => line('-'.repeat(88));

const FRICTION = 'the-friction-tax';
const PILOTS   = 'why-corporate-ai-pilots-fail';

async function main() {
  line(`blog_fix_v2 — started ${new Date().toISOString()}`);
  line(`node ${process.version} · platform ${process.platform}`);
  line(`REPO resolved to: ${REPO}`);
  line(`DRY = ${DRY}`);
  rule();

  /* ── PREFLIGHT: say exactly what is missing, rather than dying vaguely ── */
  line('PREFLIGHT');
  const need = {
    DIGIFUSION_API_URL: process.env.DIGIFUSION_API_URL,
    DIGIFUSION_CMS_TOKEN: process.env.DIGIFUSION_CMS_TOKEN,
  };
  // Trim the token: .env values routinely carry trailing whitespace or a CR on
  // Windows, and an illegal header character breaks fetch in a way that reports
  // only as "fetch failed".
  if (process.env.DIGIFUSION_CMS_TOKEN) {
    const before = process.env.DIGIFUSION_CMS_TOKEN;
    const after = before.trim().replace(/^["']|["']$/g, '');
    if (after !== before) line(`  token trimmed: ${before.length} chars -> ${after.length}`);
    process.env.DIGIFUSION_CMS_TOKEN = after;
    need.DIGIFUSION_CMS_TOKEN = after;
  }

  let fatal = false;
  for (const [k, v] of Object.entries(need)) {
    line(`  ${k.padEnd(22)} ${v ? `SET (${k.includes('TOKEN') ? v.length + ' chars' : v})` : '*** MISSING ***'}`);
    if (!v && k === 'DIGIFUSION_CMS_TOKEN') fatal = true;
  }
  // The repo's .env.local points at a local dev server. set-featured-image.mjs
  // already guards against this; carry the same guard here, or every fetch dies
  // with an unexplained "fetch failed".
  const PROD = 'https://www.digitafusion.com';
  const override = process.argv.find((a) => a.startsWith('--cms='));
  let base = override ? override.slice(6) : (process.env.DIGIFUSION_API_URL || PROD);
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(base)) {
    line(`  !! DIGIFUSION_API_URL is a local address (${base}).`);
    line(`  !! Overriding to ${PROD} — pass --cms=<url> to force something else.`);
    base = PROD;
  }
  process.env.DIGIFUSION_API_URL = base.replace(/\/$/, '');
  const SITE = process.env.DIGIFUSION_API_URL;
  line(`  CMS target: ${SITE}`);

  const r2Keys = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET',
                  'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_R2_ACCESS_KEY_ID'];
  const r2Present = r2Keys.filter((k) => process.env[k]);
  line(`  R2 vars present: ${r2Present.length ? r2Present.join(', ') : 'NONE FOUND — image upload will fail'}`);

  for (const f of ['content/article3.payload.json',
                   'content/article3-arithmetic-audit-hero.png',
                   'content/article2-legibility-threshold-hero.png',
                   'content/article1-friction-tax-hero.png']) {
    const ok = fs.existsSync(P(f));
    line(`  ${ok ? 'found  ' : 'MISSING'} ${f}`);
    if (!ok) fatal = true;
  }
  if (fatal) { line(''); line('ABORTING — fix the MISSING items above.'); return; }

  // Prove we can actually reach the CMS before doing any work. Retry — a single
  // transient failure should not abort the whole run.
  let probe = null, probeErr = '';
  for (let attempt = 1; attempt <= 3 && !probe; attempt++) {
    try {
      probe = await fetch(`${SITE}/api/cms/posts?per_page=1`, {
        headers: { Authorization: `Bearer ${process.env.DIGIFUSION_CMS_TOKEN}` },
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      probeErr = `${e.name}: ${e.message} | cause: ${e.cause ? (e.cause.code || e.cause.message) : '(none)'}`;
      line(`  connectivity attempt ${attempt}/3 failed — ${probeErr}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  try {
    if (!probe) throw Object.assign(new Error('all attempts failed'), { cause: { code: probeErr } });
    line(`  connectivity: GET ${SITE}/api/cms/posts → HTTP ${probe.status}`);
    if (!probe.ok && probe.status !== 404) {
      line(`  !! CMS returned ${probe.status}. Body: ${(await probe.text()).slice(0, 200)}`);
      if (probe.status === 401 || probe.status === 403) {
        line('  !! That is an auth failure — DIGIFUSION_CMS_TOKEN is set but not accepted.');
        line(''); line('ABORTING.'); return;
      }
    }
  } catch (e) {
    const cause = e.cause ? (e.cause.code || e.cause.message) : '(no cause reported)';
    line(`  !! CANNOT REACH ${SITE} — ${e.name}: ${e.message}`);
    line(`  !! underlying cause: ${cause}`);
    line('  !! Node cannot open this connection even though a browser can.');
    line('  !! Run: node backend/scripts/net_diag.mjs   — it isolates which cause it is.');
    line(''); line('ABORTING.'); return;
  }
  rule();

  const { getPost, upsertPost } = await import('../cmsClient.js');
  line('cmsClient imported OK');

  /* ── read the three posts we care about, individually (no list needed) ── */
  const read = async (slug) => {
    try {
      const r = await getPost(slug);
      const p = r?.data || r;
      if (!p?.slug) { line(`  ${slug}: no post returned`); return null; }
      const date = p.published_at || p.created_at || p.date || '';
      line(`  ${slug}`);
      line(`     date  : ${date}`);
      line(`     image : ${p.featured_image_url || '(none)'}`);
      line(`     body  : ${(p.content || '').length} bytes · ${p.word_count || '?'} words · ${p.reading_time_minutes || '?'} min`);
      line(`     fields: ${Object.keys(p).join(', ')}`);
      return p;
    } catch (e) {
      line(`  ${slug}: ERROR ${e.status || ''} ${e.message}${e.cause ? ' | cause: ' + (e.cause.code || e.cause.message) : ''}`);
      return null;
    }
  };

  line(''); line('CURRENT STATE'); rule();
  const friction = await read(FRICTION);
  const pilots   = await read(PILOTS);
  if (!friction || !pilots) { line(''); line('ABORTING — could not read both articles.'); return; }

  /* ── image uploader ───────────────────────────────────────────────────── */
  let uploadMediaAsset = null;
  const upload = async (rel) => {
    if (!uploadMediaAsset) {
      const m = await import('../cloudflareR2.js');
      uploadMediaAsset = m.uploadMediaAsset;
      line(`  cloudflareR2 imported; uploadMediaAsset is ${typeof uploadMediaAsset}`);
    }
    const abs = P(rel);
    const bytes = fs.readFileSync(abs);
    line(`  uploading ${path.basename(abs)} (${Math.round(bytes.length / 1024)} KB)`);
    const asset = await uploadMediaAsset(path.basename(abs), bytes, 'image/png');
    line(`  -> ${asset.url}`);
    return asset.url;
  };

  /* ── safe update: never write a body we have not verified ─────────────── */
  const updatePost = async (post, changes) => {
    if (!post.content || post.content.length < 200) {
      line(`  REFUSING to write ${post.slug} — content is ${(post.content || '').length} bytes`);
      return false;
    }
    const payload = {
      slug: post.slug,
      title: post.title,
      content: post.content,
      excerpt: post.excerpt || '',
      status: post.status || 'published',
      post_type: post.post_type || 'article',
      meta_description: post.meta_description || '',
      focus_keyword: post.focus_keyword || '',
      categories: post.categories || [],
      tags: post.tags || [],
      author_name: post.author_name || 'Boroji Adebayo-Hopewell',
      reading_time_minutes: post.reading_time_minutes || 5,
      word_count: post.word_count || 0,
      featured_image_url: post.featured_image_url || null,
      featured_image_credit: post.featured_image_credit || 'DigiFusion',
      ...changes,
    };
    const res = await upsertPost(payload);
    line(`  upsert ${post.slug}: ${res?.ok === false ? 'FAILED' : 'ok'}`);
    return true;
  };

  /* ══ 1. PUBLISH ARTICLE 3 ═══════════════════════════════════════════ */
  line(''); line('PUBLISH ARTICLE 3'); rule();
  const payload = JSON.parse(fs.readFileSync(P('content/article3.payload.json'), 'utf8'));
  let a3 = null;
  try { const r = await getPost(payload.slug); a3 = r?.data || r; } catch (e) { if (e.status !== 404) line(`  getPost: ${e.message}`); }
  line(`  slug ${payload.slug} — ${a3?.slug ? 'EXISTS, will update' : 'new, will create'}`);
  line(`  ${payload.word_count} words → ${payload.reading_time_minutes} min`);

  if (DRY) { line('  [dry] skipped'); }
  else {
    try {
      payload.featured_image_url = await upload('content/article3-arithmetic-audit-hero.png');
    } catch (e) {
      line(`  IMAGE UPLOAD FAILED: ${e.message}`);
      line('  Publishing without a featured image; set it afterwards with set-featured-image.mjs');
      payload.featured_image_url = null;
    }
    const saved = (await upsertPost(payload))?.data;
    line(`  PUBLISHED -> ${SITE}/blog/${saved?.slug || payload.slug}`);
  }

  /* ══ 2. GIVE BOTH EARLIER ARTICLES THEIR OWN IMAGE ══════════════════ */
  // Both came back with featured_image_url = null, which is why the theme was
  // rendering the same Pexels fallback on both. Setting one would not have been
  // enough — the other would have kept the shared stock photo.
  line(''); line('FIX FEATURED IMAGES'); rule();
  const imageJobs = [
    [PILOTS,   pilots,   'content/article2-legibility-threshold-hero.png'],
    [FRICTION, friction, 'content/article1-friction-tax-hero.png'],
  ];
  if (DRY) { line('  [dry] skipped'); }
  else for (const [slug, post, file] of imageJobs) {
    line(`  ${slug} (currently: ${post.featured_image_url || 'none — using site fallback'})`);
    try {
      const url = await upload(file);
      await updatePost(post, { featured_image_url: url, featured_image_credit: 'DigiFusion' });
      const after = (await getPost(slug))?.data;
      const got = after?.featured_image_url;
      line(`  verified: ${got || 'STILL NULL — the write did not take'}`);
    } catch (e) { line(`  FAILED on ${slug}: ${e.message}`); }
  }

  /* ══ 3. MOVE THE FRICTION TAX DATE BACK ═════════════════════════════ */
  line(''); line('FIX DATE ON ' + FRICTION); rule();
  const cur = friction.published_at || friction.created_at || friction.date;
  const target = new Date(new Date(cur).getTime() - 7 * 24 * 3600 * 1000).toISOString();
  line(`  current ${String(cur).slice(0, 10)} → target ${target.slice(0, 10)}`);

  if (DRY) { line('  [dry] skipped'); }
  else {
    let ok = false;
    // (a) try it through the normal upsert path
    for (const field of ['published_at']) {
      try {
        await updatePost(friction, { [field]: target });
        const after = (await getPost(FRICTION))?.data;
        const got = String(after?.published_at || after?.created_at || after?.date || '').slice(0, 10);
        line(`  upsert { ${field} } → now reads ${got}`);
        if (got === target.slice(0, 10)) { ok = true; break; }
      } catch (e) { line(`  upsert { ${field} }: ${e.message}`); }
    }
    // (b) try a PATCH
    if (!ok) for (const field of ['published_at']) {
      try {
        const r = await fetch(`${SITE}/api/cms/posts/${encodeURIComponent(FRICTION)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DIGIFUSION_CMS_TOKEN}` },
          body: JSON.stringify({ [field]: target }),
        });
        const txt = await r.text();
        line(`  PATCH { ${field} } → HTTP ${r.status} ${txt.slice(0, 140)}`);
        const after = (await getPost(FRICTION))?.data;
        const got = String(after?.published_at || after?.created_at || after?.date || '').slice(0, 10);
        if (got === target.slice(0, 10)) { line(`  date is now ${got}`); ok = true; break; }
      } catch (e) { line(`  PATCH { ${field} }: ${e.message}`); }
    }
    if (!ok) {
      line('');
      line('  DATE IS NOT WRITABLE THROUGH THE API — published_at is set server-side.');
      line('  Run this in the DigiFusion Supabase SQL editor. One row:');
      line('');
      line(`    UPDATE posts SET published_at = '${target}' WHERE slug = '${FRICTION}';`);
      line('');
      line('  published_at is confirmed as the display field: the live page showed');
      line('  6 August 2026 and published_at reads 2026-08-06, while created_at is');
      line('  2026-08-04. So published_at is the one to change, not created_at.');
    }
  }

  line(''); line(`FINISHED ${new Date().toISOString()}`);
  line(`Check ${SITE}/blog`);
}

try { await main(); }
catch (e) {
  line('');
  line('UNCAUGHT ERROR — this is why nothing happened:');
  line(String(e && e.stack ? e.stack : e));
}
line('');
line(`log written to: ${LOG}`);
