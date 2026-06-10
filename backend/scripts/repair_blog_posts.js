#!/usr/bin/env node
/**
 * One-off repair for DigiFusion posts:
 * - Extract .post-body from legacy full HTML documents
 * - Normalize post_type guide/how-to → article (optional)
 * - Backfill featured_image_url from Pexels when missing
 *
 * Usage:
 *   node --env-file=.env backend/scripts/repair_blog_posts.js
 *   node --env-file=.env backend/scripts/repair_blog_posts.js --fix-types
 *   node --env-file=.env backend/scripts/repair_blog_posts.js --images
 */
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../supabaseClient.js';
import { searchPexels } from '../pexelsAssets.js';
import { extractPostBody } from '../lib/extractPostBody.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

async function main() {
  const db = getSupabase();
  if (!db) {
    console.error('Supabase not configured');
    process.exit(1);
  }

  const fixTypes = process.argv.includes('--fix-types');
  const fixImages = process.argv.includes('--images');

  const { data: posts, error } = await db.from('posts').select('*').order('created_at', { ascending: false });
  if (error) throw error;

  for (const post of posts || []) {
    const updates = {};
    const raw = post.content || '';
    const body = extractPostBody(raw);
    const needsRepair = body && (
      body !== raw
      || /^<!doctype/i.test(raw)
      || (raw.includes('post-body') && body.length > raw.length * 0.5)
    );
    if (needsRepair && body.length > 50) {
      updates.content = body;
      console.log(`✓ Extracted body for: ${post.slug} (${raw.length} → ${body.length} chars)`);
    } else if (!body || body.length < 100) {
      console.warn(`⚠ Short/empty content (${body.length} chars): ${post.slug}`);
    }

    if (fixTypes && ['guide', 'how-to'].includes(post.post_type)) {
      updates.post_type = 'article';
      console.log(`✓ post_type → article: ${post.slug}`);
    }

    if (fixImages && !post.featured_image_url && post.title) {
      try {
        const images = await searchPexels(post.focus_keyword || post.title, { perPage: 3 });
        const url = images?.[0]?.src?.large || images?.[0]?.src?.medium;
        if (url) {
          updates.featured_image_url = url;
          updates.featured_image_credit = images[0].photographer || 'Pexels';
          console.log(`✓ Image for: ${post.slug}`);
        }
      } catch (e) {
        console.warn(`  Image skip ${post.slug}:`, e.message);
      }
    }

    if (Object.keys(updates).length) {
      await db.from('posts').update(updates).eq('id', post.id);
    }
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
