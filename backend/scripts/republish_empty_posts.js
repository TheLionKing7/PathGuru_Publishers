#!/usr/bin/env node
/**
 * Regenerate and republish posts with empty/stub body content.
 *
 * Usage:
 *   node --env-file=.env backend/scripts/republish_empty_posts.js
 *   node --env-file=.env backend/scripts/republish_empty_posts.js --slug=rewiring-the-african-c-suite-...
 *   node --env-file=.env backend/scripts/republish_empty_posts.js --min-chars=500
 */
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../supabaseClient.js';
import { extractPostBody } from '../lib/extractPostBody.js';
import { executeApprovedBlogPublish } from '../skills/blogApprovalFlow.js';
import { generateAndPublishBlogPost, DEFAULT_BLOG_AUTHOR } from '../blogPublisher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const siteUrl = (process.env.DIGIFUSION_API_URL || 'https://www.digitafusion.com').replace(/\/$/, '');
const slugArg = process.argv.find(a => a.startsWith('--slug='))?.split('=').slice(1).join('=');
const minChars = Number(process.argv.find(a => a.startsWith('--min-chars='))?.split('=')[1] || 500);

const AFRICAN_SLUG = 'rewiring-the-african-c-suite-the-ai-first-playbook-for-automation-driven-growth';

async function republishAfricanCSuite(db) {
  const { data: task } = await db.from('tasks')
    .select('*')
    .ilike('title', '%African C%')
    .eq('type', 'pending_approval')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!task?.input?.payload) {
    console.warn('No approval task found for African C-Suite — skipping');
    return;
  }

  const feedback = task.output?.feedback || '';
  console.log('\n▶ Republishing African C-Suite (full Aether pipeline)...');
  const result = await executeApprovedBlogPublish({
    ...task.input.payload,
    author: 'Boroji Adebayo-Hopewell, Founder',
    bossCaveats: feedback ? [feedback] : [],
    bossFeedback: feedback,
  });
  console.log('✓', result.url || result.slug, `(${result.post?.sections?.length || '?'} sections)`);
}

async function republishStub(db, post) {
  console.log(`\n▶ Regenerating: ${post.slug} (${(post.content || '').length} chars)`);
  const result = await generateAndPublishBlogPost({
    topic: post.title,
    slug: post.slug,
    seoKeyword: post.focus_keyword || post.title,
    postType: post.post_type || 'article',
    author: post.author_name || DEFAULT_BLOG_AUTHOR,
    audience: 'business executives and operators',
    niche: 'business_development',
    platforms: [{ type: 'digifusion', status: 'published', siteUrl }],
  });
  const bodyLen = result?.html ? extractPostBody(result.html).length : 0;
  const published = result?.publishResults?.[0];
  if (published?.error) throw new Error(published.error);
  console.log('✓', published?.url || post.slug, `body ~${bodyLen} chars`);
}

async function main() {
  const db = getSupabase();
  if (!db) { console.error('Supabase not configured'); process.exit(1); }

  const runAfrican = !process.argv.includes('--stubs-only')
    && (!slugArg || slugArg === AFRICAN_SLUG);
  if (runAfrican) await republishAfricanCSuite(db);

  const { data: posts, error } = await db.from('posts').select('*').eq('status', 'published').order('created_at', { ascending: false });
  if (error) throw error;

  const targets = (posts || []).filter(p => {
    if (slugArg && p.slug !== slugArg) return false;
    if (p.slug === AFRICAN_SLUG && !slugArg) return false; // handled above
    const bodyLen = extractPostBody(p.content || '').length;
    return bodyLen < minChars;
  });

  if (!targets.length) {
    console.log('\nNo stub posts to regenerate.');
    return;
  }

  console.log(`\nRegenerating ${targets.length} stub post(s) under ${minChars} chars...`);
  for (const post of targets) {
    try {
      await republishStub(db, post);
    } catch (e) {
      console.error('✗', post.slug, e.message);
    }
  }

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
