#!/usr/bin/env node
/**
 * Print the first 600 characters of named posts, or of the five most recent.
 *
 *   node --env-file=.env.local backend/scripts/preview_posts.js [slug ...]
 */
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../supabaseClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const slugs = process.argv.slice(2);
const db = getSupabase();
const q = slugs.length
  ? db.from('posts').select('slug,content,word_count').in('slug', slugs)
  : db.from('posts').select('slug,content,word_count').order('created_at', { ascending: false }).limit(5);

const { data } = await q;
for (const p of data || []) {
  console.log('\n===', p.slug, 'word_count:', p.word_count, '===');
  console.log(p.content?.slice(0, 600));
}
