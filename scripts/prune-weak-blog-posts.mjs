#!/usr/bin/env node
/**
 * Archive weak / duplicate blog posts (keeps curated Intelligence teasers + AffOS).
 *
 * Usage:
 *   node --env-file=.env.local scripts/prune-weak-blog-posts.mjs --dry-run
 *   node --env-file=.env.local scripts/prune-weak-blog-posts.mjs --apply
 *
 * Archives posts NOT in KEEP_SLUGS when body extract < MIN_BODY_CHARS.
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(root, '.env.local') });
config({ path: path.join(root, '.env') });

const BASE = (process.env.DIGIFUSION_API_URL || 'https://www.digitafusion.com').replace(/\/$/, '');
const TOKEN = process.env.DIGIFUSION_CMS_TOKEN || '';
const dryRun = !process.argv.includes('--apply');
const MIN_BODY_CHARS = 1200;

const KEEP_SLUGS = new Set([
  'your-followers-are-ready-to-buy-affiliateos-infrastructure',
  'ai-automation-diagnostic-most-teams-skip',
  'rewiring-the-african-c-suite-the-ai-first-playbook-for-automation-driven-growth',
  'pillar-cluster-authority-architecture',
  'the-dream-50-mistake-why-b2b-teams-target-the-wrong-accounts-first',
  'why-most-ai-automation-projects-fail-before-go-live',
]);

function stripHtml(s = '') {
  return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

if (!TOKEN) {
  console.error('Set DIGIFUSION_CMS_TOKEN');
  process.exit(1);
}

const res = await fetch(`${BASE}/api/cms/posts?limit=100`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
const data = await res.json().catch(() => ({}));
const posts = data?.data?.posts || data?.posts || [];
if (!posts.length) {
  console.log('No posts returned from CMS');
  process.exit(0);
}

const candidates = [];
for (const p of posts) {
  if (KEEP_SLUGS.has(p.slug)) continue;
  const body = stripHtml(p.excerpt || p.content || '');
  if (body.length < MIN_BODY_CHARS) candidates.push({ slug: p.slug, title: p.title, len: body.length, status: p.status });
}

console.log(`Posts: ${posts.length} | Weak (to archive): ${candidates.length} | Mode: ${dryRun ? 'dry-run' : 'apply'}`);
for (const c of candidates) console.log(`  - ${c.slug} (${c.len} chars) [${c.status}]`);

if (dryRun || !candidates.length) process.exit(0);

for (const c of candidates) {
  const del = await fetch(`${BASE}/api/cms/posts/${encodeURIComponent(c.slug)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!del.ok) {
    const patch = await fetch(`${BASE}/api/cms/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ slug: c.slug, title: c.title || c.slug, content: c.content || '', status: 'archived', post_type: 'article' }),
    });
    console.log(patch.ok ? `✓ archived ${c.slug}` : `✗ failed ${c.slug}`);
  } else {
    console.log(`✓ deleted ${c.slug}`);
  }
}
