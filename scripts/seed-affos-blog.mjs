#!/usr/bin/env node
/**
 * Publish AffOS executive brief to DigiFusion blog via PathGuru CMS client.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-affos-blog.mjs
 *   node --env-file=.env.local scripts/seed-affos-blog.mjs --dry-run
 *
 * Requires: DIGIFUSION_API_URL + DIGIFUSION_CMS_TOKEN in .env.local
 *
 * Editorial rules: docs/BLOG_EDITORIAL_STANDARDS.md (digifusion repo)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = path.join(root, 'content', 'affos-article.md');
const dryRun = process.argv.includes('--dry-run');

const BASE = (process.env.DIGIFUSION_API_URL || 'https://www.digitafusion.com').replace(/\/$/, '');
const TOKEN = process.env.DIGIFUSION_CMS_TOKEN || '';

const SLUG = 'your-followers-are-ready-to-buy-affiliateos-infrastructure';
const TITLE = 'Your Followers Are Ready to Buy. Your Infrastructure Is Killing the Sale.';
const FEATURED_IMAGE = `${BASE}/assets/blog/affiliateos-creator-checkout-hero.png`;

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (inList) { out.push('</ul>'); inList = false; }
      continue;
    }
    if (t.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${inline(t.slice(3))}</h2>`);
    } else if (t.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${inline(t.slice(4))}</h3>`);
    } else if (t === '---') {
      out.push('<hr/>');
    } else if (t.startsWith('- ')) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(t.slice(2))}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${inline(t)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const md = fs.readFileSync(mdPath, 'utf8');
const html = mdToHtml(md);
const excerpt =
  'A techno-economic analysis of the creator economy\'s most expensive blind spot — and the headless settlement architecture that finally closes it.';
const wordCount = md.split(/\s+/).filter(Boolean).length;

const payload = {
  slug: SLUG,
  title: TITLE,
  excerpt,
  content: html,
  post_type: 'article',
  status: 'published',
  meta_description: excerpt.slice(0, 155),
  focus_keyword: 'African creator economy checkout infrastructure',
  categories: ['Intelligence', 'Creator Commerce'],
  tags: ['AffiliateOS', 'creator economy', 'WhatsApp commerce', 'headless commerce'],
  reading_time_minutes: Math.max(1, Math.round(wordCount / 200)),
  word_count: wordCount,
  author_name: 'Boroji Adebayo-Hopewell',
  featured_image_url: FEATURED_IMAGE,
  featured_image_credit: 'DigiFusion',
  published_at: new Date().toISOString(),
};

if (dryRun) {
  console.log('Dry run — would POST', SLUG, `(${wordCount} words)`);
  console.log('featured_image_url:', FEATURED_IMAGE);
  process.exit(0);
}

if (!TOKEN) {
  console.error('Set DIGIFUSION_CMS_TOKEN in .env.local');
  process.exit(1);
}

const res = await fetch(`${BASE}/api/cms/posts`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`,
  },
  body: JSON.stringify(payload),
});

const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('CMS upsert failed:', data?.error || data?.message || res.status);
  process.exit(1);
}

console.log('✓ Published:', `${BASE}/blog/${SLUG}`);
