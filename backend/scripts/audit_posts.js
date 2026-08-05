#!/usr/bin/env node
/**
 * Corpus health check: every post with its raw length, extracted body length,
 * section count, type and status. Run it when the blog looks wrong and you need
 * to know whether the problem is storage or extraction.
 *
 *   node --env-file=.env.local backend/scripts/audit_posts.js
 */
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../supabaseClient.js';
import { extractPostBody } from '../lib/extractPostBody.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const db = getSupabase();
const { data: posts, error } = await db.from('posts').select('slug,title,content,post_type,status').order('created_at', { ascending: false });
if (error) { console.error(error); process.exit(1); }
console.log('Total posts:', posts?.length || 0);

for (const p of posts || []) {
  const raw = p.content || '';
  const body = extractPostBody(raw);
  const hasSections = !!(p.metadata?.sections?.length);
  console.log([
    p.slug?.slice(0, 50),
    `raw:${raw.length}`,
    `body:${body.length}`,
    `sections:${hasSections ? p.metadata.sections.length : 0}`,
    p.post_type,
    p.status,
  ].join(' | '));
}
