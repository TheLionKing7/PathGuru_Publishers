/**
 * PathGuru Publishers — Supabase Client
 *
 * Provides database access for blog posts and other content.
 * Uses environment variables for configuration.
 */

import { createClient } from '@supabase/supabase-js';

function envValue(name) {
  return typeof process.env[name] === 'string' ? process.env[name].trim() : '';
}

const supabaseUrl = envValue('SUPABASE_URL');
const supabaseKey = envValue('SUPABASE_SERVICE_ROLE_KEY');

let supabase = null;

export function getSupabase() {
  if (!supabase) {
    if (!supabaseUrl || !supabaseKey) {
      console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Database features disabled.');
      return null;
    }
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
    console.log('[Supabase] Client initialized');
  }
  return supabase;
}

export function isSupabaseEnabled() {
  return Boolean(supabaseUrl && supabaseKey);
}

/* ── Blog Posts CRUD ─────────────────────────────────── */

export async function listPosts(options = {}) {
  const db = getSupabase();
  if (!db) return { error: 'Supabase not configured' };

  const { status, limit = 50, offset = 0, postType } = options;

  let query = db
    .from('posts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }
  if (postType) {
    query = query.eq('post_type', postType);
  }

  const { data, error, count } = await query;
  if (error) return { error: error.message };
  return { data, count, limit, offset };
}

export async function getPostBySlug(slug) {
  const db = getSupabase();
  if (!db) return { error: 'Supabase not configured' };

  const { data, error } = await db
    .from('posts')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function getPostById(id) {
  const db = getSupabase();
  if (!db) return { error: 'Supabase not configured' };

  const { data, error } = await db
    .from('posts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function createPost(post) {
  const db = getSupabase();
  if (!db) return { error: 'Supabase not configured' };

  const { data, error } = await db
    .from('posts')
    .insert({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || null,
      content: post.content || null,
      post_type: post.postType || 'guide',
      meta_description: post.metaDescription || null,
      focus_keyword: post.focusKeyword || null,
      featured_image_url: post.featuredImageUrl || null,
      featured_image_credit: post.featuredImageCredit || null,
      social_caption: post.socialCaption || null,
      linkedin_caption: post.linkedinCaption || null,
      categories: post.categories || [],
      tags: post.tags || [],
      author_name: post.authorName || 'DigiFusion Team',
      author_avatar: post.authorAvatar || null,
      reading_time_minutes: post.readingTimeMinutes || null,
      word_count: post.wordCount || null,
      status: post.status || 'draft',
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function updatePost(id, updates) {
  const db = getSupabase();
  if (!db) return { error: 'Supabase not configured' };

  const updateData = { updated_at: new Date().toISOString() };

  const fieldMap = {
    title: 'title',
    slug: 'slug',
    excerpt: 'excerpt',
    content: 'content',
    postType: 'post_type',
    metaDescription: 'meta_description',
    focusKeyword: 'focus_keyword',
    featuredImageUrl: 'featured_image_url',
    featuredImageCredit: 'featured_image_credit',
    socialCaption: 'social_caption',
    linkedinCaption: 'linkedin_caption',
    categories: 'categories',
    tags: 'tags',
    authorName: 'author_name',
    authorAvatar: 'author_avatar',
    readingTimeMinutes: 'reading_time_minutes',
    wordCount: 'word_count',
    status: 'status',
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (updates[key] !== undefined) {
      updateData[dbField] = updates[key];
    }
  }

  const { data, error } = await db
    .from('posts')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function publishPost(id) {
  const db = getSupabase();
  if (!db) return { error: 'Supabase not configured' };

  const { data, error } = await db
    .from('posts')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function unpublishPost(id) {
  const db = getSupabase();
  if (!db) return { error: 'Supabase not configured' };

  const { data, error } = await db
    .from('posts')
    .update({
      status: 'draft',
      published_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function deletePost(id) {
  const db = getSupabase();
  if (!db) return { error: 'Supabase not configured' };

  const { error } = await db
    .from('posts')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  return { success: true };
}
