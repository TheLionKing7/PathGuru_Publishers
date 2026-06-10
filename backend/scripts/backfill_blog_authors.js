#!/usr/bin/env node
/** Backfill author_name on all published posts. */
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../supabaseClient.js';
import { DEFAULT_BLOG_AUTHOR } from '../blogPublisher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const db = getSupabase();
const { data: posts } = await db.from('posts').select('id,slug,author_name').eq('status', 'published');
let n = 0;
for (const p of posts || []) {
  if (!p.author_name || p.author_name === 'DigiFusion' || p.author_name.trim().length < 3) {
    await db.from('posts').update({ author_name: DEFAULT_BLOG_AUTHOR }).eq('id', p.id);
    console.log('✓', p.slug);
    n++;
  }
}
console.log(`Updated ${n} posts.`);
