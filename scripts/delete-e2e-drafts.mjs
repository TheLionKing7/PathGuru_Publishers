#!/usr/bin/env node
/**
 * Permanently delete E2E CMS smoke test posts (not archive).
 *
 * Usage:
 *   node --env-file=.env scripts/delete-e2e-drafts.mjs
 *   node --env-file=.env scripts/delete-e2e-drafts.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(root, '.env.local') });
config({ path: path.join(root, '.env') });

const BASE = (process.env.DIGIFUSION_API_URL || 'https://www.digitafusion.com').replace(/\/$/, '');
const TOKEN = process.env.DIGIFUSION_CMS_TOKEN || process.env.PATHGURU_CMS_TOKEN || '';
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes('--dry-run');
const PATTERN = /E2E CMS smoke/i;

async function listAllPosts() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${BASE}/api/cms/posts?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await res.json().catch(() => ({}));
    const posts = data?.data?.posts || data?.posts || [];
    out.push(...posts);
    const totalPages = data?.data?.pagination?.total_pages || data?.pagination?.total_pages || 1;
    if (page >= totalPages || !posts.length) break;
  }
  return out;
}

if (!TOKEN && !serviceKey) {
  console.error('Set DIGIFUSION_CMS_TOKEN or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const posts = TOKEN ? await listAllPosts() : [];
const matches = posts.filter(
  (p) =>
    PATTERN.test(p.title || '') ||
    PATTERN.test(p.slug || '') ||
    /^e2e-cms-/i.test(p.slug || ''),
);

console.log(`Found ${matches.length} E2E post(s) to permanently delete${dryRun ? ' (dry-run)' : ''}`);
for (const p of matches) console.log(`  - ${p.slug} [${p.status}] ${p.title || ''}`);

if (dryRun || !matches.length) process.exit(0);

// Prefer direct Supabase delete (handles archived rows in one pass)
if (url && serviceKey) {
  const db = createClient(url, serviceKey);
  const slugs = matches.map((p) => p.slug);
  const { data, error } = await db.from('posts').delete().in('slug', slugs).select('slug');
  if (error) {
    console.error('Supabase delete failed:', error.message);
    process.exit(1);
  }
  console.log(`✓ Permanently deleted ${data?.length || 0} row(s) from posts table`);
  process.exit(0);
}

// Fallback: CMS permanent delete per slug
for (const p of matches) {
  const del = await fetch(
    `${BASE}/api/cms/posts/${encodeURIComponent(p.slug)}?permanent=1`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  console.log(del.ok ? `✓ deleted ${p.slug}` : `✗ failed ${p.slug} (${del.status})`);
}
