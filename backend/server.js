// Load .env — works with Node 20.6+ --env-file flag OR dotenv package
try { const { createRequire } = await import('node:module'); createRequire(import.meta.url)('dotenv').config({ path: new URL('../.env', import.meta.url) }); } catch {}

/**
 * PathGuru Publishers — API Server (Phase 3)
 *
 * GET  /              → web app UI
 * GET  /style.css     → webapp styles
 * GET  /app.js        → webapp logic
 * GET  /health        → status
 * POST /api/generate  → book pipeline
 * GET  /api/assets    → Pexels image search
 * POST /api/upload-assets → R2 upload
 * POST /api/epub      → EPUB-only build
 * POST /api/blog      → blog post generation + publish
 *
 * ── Blog CMS API ─────────────────────────────────────
 * GET    /api/posts           → list blog posts
 * GET    /api/posts/:slug     → get single post by slug
 * POST   /api/posts           → create new blog post
 * PUT    /api/posts/:id       → update blog post
 * PATCH  /api/posts/:id/publish   → publish post
 * PATCH  /api/posts/:id/unpublish → unpublish post
 * DELETE /api/posts/:id       → delete blog post
 */

import { createServer }             from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname }            from 'node:path';
import { fileURLToPath }            from 'node:url';

import { buildProject }                   from './designGuru.js';
import { searchPexels, uploadAssetsToR2 } from './pexelsAssets.js';
import { buildEpub }                      from './epubBuilder.js';
import { generateAndPublishBlogPost, publishBlogPost } from './blogPublisher.js';
import * as cmsClient                     from './cmsClient.js';
import { createPost as dbCreatePost, updatePost as dbUpdatePost } from './supabaseClient.js';
import { prewarmFonts, describeEmbeddedFonts } from './fontEmbedder.js';
import {
  getLibrarySummary, ensureLibraryDir,
  listIntentFolder, saveIntentFile, deleteIntentFile, isValidIntentFolder,
} from './referenceLibrary.js';
import { extractPdfProfile }                     from './pdfDesignExtractor.js';
import {
  uploadMediaAsset,
  listMediaAssets,
  deleteMediaAsset,
  uploadLibraryFile,
  listLibraryFiles,
  deleteLibraryFile,
  isValidLibraryFolder,
} from './cloudflareR2.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBAPP    = join(__dirname, '..', 'webapp');
const PORT      = parseInt(process.env.PORT || '8787', 10);

// Vektor users cache — avoids hammering the Vektor API on every panel open
let _vektorUsersCache   = null;
let _vektorUsersCacheTs = 0;

const STATIC = {
  '/':           { file: join(WEBAPP, 'index.html'),  mime: 'text/html; charset=utf-8' },
  '/index.html': { file: join(WEBAPP, 'index.html'),  mime: 'text/html; charset=utf-8' },
  '/style.css':  { file: join(WEBAPP, 'style.css'),   mime: 'text/css; charset=utf-8' },
  '/app.js':     { file: join(WEBAPP, 'app.js'),      mime: 'application/javascript; charset=utf-8' },
  '/blog.js':    { file: join(WEBAPP, 'blog.js'),     mime: 'application/javascript; charset=utf-8' },
  '/shop.js':    { file: join(WEBAPP, 'shop.js'),     mime: 'application/javascript; charset=utf-8' },
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
function err(res, message, status = 500) {
  console.error('[PathGuru]', message);
  json(res, { error: message }, status);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url  = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // ── Reference Library ───────────────────────────
  if (path === '/api/library' && req.method === 'GET') {
    try {
      const summary = await getLibrarySummary();
      json(res, summary);
    } catch (e) { err(res, e.message); }
    return;
  }

  // POST /api/library/extract — extract design profile from a PDF in the library
  // Body: { pdfPath: string, profileName: string }
  if (path === '/api/library/extract' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { pdfPath, profileName } = body;
      if (!pdfPath || !profileName) {
        return err(res, 'pdfPath and profileName are required', 400);
      }
      const safeProfile = profileName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      console.log(`[Library] Extracting profile "${safeProfile}" from: ${pdfPath}`);
      const profile = await extractPdfProfile(pdfPath, safeProfile);
      json(res, {
        ok: true,
        message: `Profile "${safeProfile}" extracted and saved.`,
        profile: {
          name:      profile.name,
          style:     profile.style,
          books:     profile.books,
          extractedAt: profile.extractedAt,
          calloutTypes: profile.calloutTypes,
          colorPalette: profile.colorPalette,
          typography:   profile.typography,
        },
        usage: `Use in generation: { "publisher": "${safeProfile}" }`,
      });
    } catch (e) { err(res, e.message); }
    return;
  }

  // ── Health ──────────────────────────────────────
  if (path === '/health') {
    const fonts = await describeEmbeddedFonts().catch(() => []);
    json(res, { status: 'ok', service: 'PathGuru Publishers', version: '3.0', ts: new Date().toISOString(),
                fonts: fonts.map(f => ({ family: f.family, italic: f.italic, weight: f.weightRange.join('-'), loaded: f.loaded, kb: Math.round(f.bytes / 1024) })) });
    return;
  }

  // ── Static (webapp) ─────────────────────────────
  if (req.method === 'GET' && STATIC[path]) {
    const { file, mime } = STATIC[path];
    if (existsSync(file)) {
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.end(readFileSync(file));
    } else err(res, `Not found: ${path}`, 404);
    return;
  }

  // ── POST /api/generate ──────────────────────────
  if (req.method === 'POST' && path === '/api/generate') {
    try {
      const input = await readBody(req);
      if (!input.topic && !input.title) { err(res, 'A topic or title is required.', 400); return; }
      console.log(`[PathGuru] Generating book: "${input.title || input.topic}"`);
      const result = await buildProject(input);
      const fmt = (input.format || 'pdf').toLowerCase();
      if (fmt === 'epub' || fmt === 'both') {
        try {
          const buf = await buildEpub(result.project, result.manuscript, result.design);
          result.epubBase64 = buf.toString('base64');
        } catch (e) { result.epubWarning = e.message; }
      }
      json(res, result);
    } catch (e) { err(res, e.message || 'Generation failed'); }
    return;
  }

  // ── GET /api/assets ─────────────────────────────
  if (req.method === 'GET' && path === '/api/assets') {
    try {
      const query = url.searchParams.get('query') || '';
      const orientation = url.searchParams.get('orientation') || '';
      if (!query) { err(res, 'query param required', 400); return; }
      const images = await searchPexels(query, { orientation });
      json(res, { images });
    } catch (e) { err(res, e.message || 'Asset search failed'); }
    return;
  }

  // ── POST /api/upload-assets ─────────────────────
  if (req.method === 'POST' && path === '/api/upload-assets') {
    try {
      const body = await readBody(req);
      if (!(body.assets || []).length) { err(res, 'No assets provided', 400); return; }
      const results = await uploadAssetsToR2(body.assets);
      json(res, { uploaded: results.filter(r => !r.error).length, results });
    } catch (e) { err(res, e.message || 'Upload failed'); }
    return;
  }

  // ── POST /api/epub ──────────────────────────────
  if (req.method === 'POST' && path === '/api/epub') {
    try {
      const body = await readBody(req);
      if (!body.manuscript) { err(res, 'manuscript required', 400); return; }
      const buf = await buildEpub(body.project || {}, body.manuscript, body.design || {});
      res.writeHead(200, { 'Content-Type': 'application/epub+zip', 'Content-Disposition': `attachment; filename="pathguru-${Date.now()}.epub"`, 'Content-Length': buf.length });
      res.end(buf);
    } catch (e) { err(res, e.message || 'EPUB build failed'); }
    return;
  }

  // ── GET /api/personas ──────────────────────────────
  if (req.method === 'GET' && path === '/api/personas') {
    try {
      const { listPersonas } = await import('./skills/personas.js');
      json(res, { personas: listPersonas() });
    } catch (e) { err(res, e.message || 'Failed to list personas'); }
    return;
  }

  // ── POST /api/blog ──────────────────────────────
  // Generate only — saves draft to Supabase, does NOT publish to platforms.
  if (req.method === 'POST' && path === '/api/blog') {
    try {
      const input = await readBody(req);
      if (!input.topic) { err(res, 'topic is required', 400); return; }
      console.log(`[PathGuru] Generating blog post: "${input.topic}"`);
      // Strip platforms so generation never auto-publishes
      const result = await generateAndPublishBlogPost({ ...input, platforms: [] });
      json(res, result);
    } catch (e) { err(res, e.message || 'Blog generation failed'); }
    return;
  }

  // ── POST /api/blog/publish ───────────────────────
  // Publish-only — user has reviewed the draft and approved it.
  // Accepts: { post, html, platforms, postId, featuredImageUrl }
  if (req.method === 'POST' && path === '/api/blog/publish') {
    try {
      const body = await readBody(req);
      if (!body.post || !body.html) { err(res, 'post and html are required', 400); return; }
      if (!Array.isArray(body.platforms) || body.platforms.length === 0) {
        err(res, 'Select at least one publish destination', 400); return;
      }
      console.log(`[PathGuru] Publishing approved post: "${body.post.title}"`);
      const result = await publishBlogPost(body);
      json(res, result);
    } catch (e) { err(res, e.message || 'Publish failed'); }
    return;
  }

  // ═══════════════════════════════════════════════════
  // BLOG CMS API — proxied to DigiFusion CMS
  // Posts are stored in DigiFusion. PathGuru reads/writes via cmsClient
  // so a single Supabase (DigiFusion's) is the source of truth.
  // NOTE: per-post operations use slug as the identifier.
  // ═══════════════════════════════════════════════════

  // ── POST /api/posts — create post in Supabase + DigiFusion ──────────
  // Used by the publish-html-post script (and any other non-AI publish path)
  // to save a pre-built post to BOTH stores, the same way the AI pipeline does.
  if (req.method === 'POST' && path === '/api/posts') {
    try {
      const body = await readBody(req);
      if (!body.title || !body.slug) { err(res, 'title and slug are required', 400); return; }

      const wordCount   = body.word_count || 0;
      const readingTime = body.reading_time_minutes || Math.max(1, Math.round(wordCount / 200));
      const skipCms     = body._skipCms === true;
      const skipDb      = body._skipDb  === true;

      // 1 — Save to Supabase (internal record, powers dashboard/analytics)
      let supabaseResult = null;
      if (!skipDb) try {
        supabaseResult = await dbCreatePost({
          title:               body.title,
          slug:                body.slug,
          excerpt:             body.excerpt             || '',
          content:             body.content             || '',
          postType:            body.post_type           || 'article',
          metaDescription:     body.meta_description    || '',
          focusKeyword:        body.focus_keyword       || '',
          featuredImageUrl:    body.featured_image_url  || null,
          featuredImageCredit: body.featured_image_credit || '',
          socialCaption:       body.social_caption      || '',
          linkedinCaption:     body.linkedin_caption    || '',
          categories:          body.categories          || [],
          tags:                body.tags                || [],
          authorName:          body.author_name         || 'PathGuru Team',
          readingTimeMinutes:  readingTime,
          wordCount,
          status:              body.status              || 'draft',
        });
      } catch (sbErr) {
        console.warn('[POST /api/posts] Supabase save failed:', sbErr.message);
      }

      // 2 — Upsert to DigiFusion CMS (public-facing store)
      let cmsResult = null;
      if (!skipCms) cmsResult = await cmsClient.upsertPost({
        title:                 body.title,
        slug:                  body.slug,
        excerpt:               body.excerpt             || '',
        content:               body.content             || '',
        post_type:             body.post_type           || 'article',
        status:                body.status              || 'draft',
        meta_description:      body.meta_description    || '',
        focus_keyword:         body.focus_keyword       || '',
        featured_image_url:    body.featured_image_url  || null,
        featured_image_credit: body.featured_image_credit || '',
        social_caption:        body.social_caption      || '',
        linkedin_caption:      body.linkedin_caption    || '',
        categories:            body.categories          || [],
        tags:                  body.tags                || [],
        author_name:           body.author_name         || 'PathGuru Team',
        reading_time_minutes:  readingTime,
        word_count:            wordCount,
      });

      json(res, {
        ok:        true,
        skippedCms: skipCms,
        skippedDb:  skipDb,
        supabase:  supabaseResult?.data  || null,
        cms:       cmsResult?.data       || cmsResult || null,
        slug:      body.slug,
      });
    } catch (e) { err(res, e.message || 'Failed to create post'); }
    return;
  }

  // ── GET /api/posts ───────────────────────────────
  if (req.method === 'GET' && path === '/api/posts') {
    try {
      const status   = url.searchParams.get('status')   || undefined;
      const postType = url.searchParams.get('postType') || undefined;
      const per_page = parseInt(url.searchParams.get('limit') || '50', 10);
      const page     = parseInt(url.searchParams.get('page')  || '1',  10);

      const params = { per_page, page };
      if (status)   params.status    = status;
      if (postType) params.post_type = postType;

      const result = await cmsClient.listPosts(params);
      // cmsClient returns { ok: true, data: { posts, pagination } }
      const posts      = result?.data?.posts      || [];
      const pagination = result?.data?.pagination || {};

      // Expose slug as `id` so per-item actions (publish/delete/preview)
      // can use it as a lookup key against DigiFusion's slug-based API.
      const mapped = posts.map(p => ({ ...p, id: p.slug }));

      json(res, {
        posts: mapped,
        pagination: {
          page:       pagination.page       || page,
          perPage:    pagination.per_page   || per_page,
          total:      pagination.total      || 0,
          totalPages: pagination.total_pages || 1,
        },
      });
    } catch (e) { err(res, e.message || 'Failed to load posts', 500); }
    return;
  }

  // ── GET /api/posts/:slug ─────────────────────────
  const postsMatch = path.match(/^\/api\/posts\/([^/]+)$/);
  if (req.method === 'GET' && postsMatch) {
    try {
      const slug   = decodeURIComponent(postsMatch[1]);
      const result = await cmsClient.getPost(slug);
      json(res, result?.data || result);
    } catch (e) { err(res, e.message || 'Post not found', 404); }
    return;
  }

  // ── PATCH /api/posts/:slug/publish ───────────────
  const publishMatch = path.match(/^\/api\/posts\/([^/]+)\/publish$/);
  if (req.method === 'PATCH' && publishMatch) {
    try {
      const slug   = decodeURIComponent(publishMatch[1]);
      const result = await cmsClient.publishPost(slug);
      json(res, result?.data || result);
    } catch (e) { err(res, e.message || 'Failed to publish post', 500); }
    return;
  }

  // ── PATCH /api/posts/:slug/unpublish ─────────────
  const unpublishMatch = path.match(/^\/api\/posts\/([^/]+)\/unpublish$/);
  if (req.method === 'PATCH' && unpublishMatch) {
    try {
      const slug   = decodeURIComponent(unpublishMatch[1]);
      const result = await cmsClient.unpublishPost(slug);
      json(res, result?.data || result);
    } catch (e) { err(res, e.message || 'Failed to unpublish post', 500); }
    return;
  }

  // ── PUT /api/posts/:id — update post (Supabase + DigiFusion) ────
  if (req.method === 'PUT' && postsMatch) {
    try {
      const id   = decodeURIComponent(postsMatch[1]);
      const body = await readBody(req);
      const results = {};

      // 1. Update Supabase
      const sbResult = await dbUpdatePost(id, body);
      if (sbResult?.error) console.warn('[PUT /api/posts] Supabase update warning:', sbResult.error);
      else results.supabase = sbResult;

      // 2. Upsert DigiFusion CMS (uses slug from body or id fallback)
      if (!body._skipCms) {
        const cmsPayload = {
          slug:             body.slug || id,
          title:            body.title,
          content:          body.content,
          excerpt:          body.excerpt          || '',
          meta_description: body.metaDescription  || body.meta_description || '',
          focus_keyword:    body.focusKeyword      || body.focus_keyword    || '',
          post_type:        body.postType          || body.post_type        || 'article',
          status:           body.status            || 'published',
          author_name:      body.authorName        || body.author_name      || '',
          word_count:       body.wordCount         || body.word_count,
          reading_time_minutes: body.readingTime   || body.reading_time_minutes,
        };
        try {
          const cmsRes = await cmsClient.upsertPost(cmsPayload);
          results.cms = cmsRes?.data || cmsRes;
        } catch (cmsErr) {
          console.warn('[PUT /api/posts] CMS update warning:', cmsErr.message);
          results.cmsError = cmsErr.message;
        }
      }

      json(res, { ok: true, ...results });
    } catch (e) { err(res, e.message || 'Failed to update post', 500); }
    return;
  }

  // ── DELETE /api/posts/:slug ──────────────────────
  if (req.method === 'DELETE' && postsMatch) {
    try {
      const slug = decodeURIComponent(postsMatch[1]);
      await cmsClient.archivePost(slug);
      json(res, { success: true });
    } catch (e) { err(res, e.message || 'Failed to delete post', 500); }
    return;
  }

  // ═══════════════════════════════════════════════════
  // SHOP PROXY — forwards to DigiFusion CMS API
  // Browser → PathGuru backend → DigiFusion /api/cms/*
  // Token stays server-side, never exposed to the browser.
  // ═══════════════════════════════════════════════════

  // ── GET /api/shop/products ───────────────────────
  if (req.method === 'GET' && path === '/api/shop/products') {
    try {
      const params = Object.fromEntries(url.searchParams.entries());
      const result = await cmsClient.listProducts(params);
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── POST /api/shop/products ──────────────────────
  if (req.method === 'POST' && path === '/api/shop/products') {
    try {
      const body   = await readBody(req);
      const result = await cmsClient.createProduct(body);
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── PUT /api/shop/products/:id ───────────────────
  const shopProductMatch = path.match(/^\/api\/shop\/products\/([^/]+)$/);
  if (req.method === 'PUT' && shopProductMatch) {
    try {
      const body   = await readBody(req);
      const result = await cmsClient.updateProduct(shopProductMatch[1], body);
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── DELETE /api/shop/products/:id ────────────────
  if (req.method === 'DELETE' && shopProductMatch) {
    try {
      const result = await cmsClient.updateProduct(shopProductMatch[1], { active: false });
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── GET /api/shop/subscriptions ──────────────────
  if (req.method === 'GET' && path === '/api/shop/subscriptions') {
    try {
      const result = await cmsClient.getSubscriptions();
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── GET /api/shop/bookings ───────────────────────
  if (req.method === 'GET' && path === '/api/shop/bookings') {
    try {
      const params = Object.fromEntries(url.searchParams.entries());
      const result = await cmsClient.listBookings(params);
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── GET /api/shop/orders ─────────────────────────
  if (req.method === 'GET' && path === '/api/shop/orders') {
    try {
      const params = Object.fromEntries(url.searchParams.entries());
      const result = await cmsClient.listOrders(params);
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── POST /api/shop/orders/:id/mark-paid ──────────
  const shopMarkPaidMatch = path.match(/^\/api\/shop\/orders\/([^/]+)\/mark-paid$/);
  if (req.method === 'POST' && shopMarkPaidMatch) {
    try {
      const result = await cmsClient.markOrderPaid(shopMarkPaidMatch[1]);
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── POST /api/shop/orders/:id/refund ─────────────
  const shopRefundMatch = path.match(/^\/api\/shop\/orders\/([^/]+)\/refund$/);
  if (req.method === 'POST' && shopRefundMatch) {
    try {
      const body   = await readBody(req);
ent.refundOrder(shopRefundMatch[1], body);
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── GET /api/shop/analytics ──────────────────────
  if (req.method === 'GET' && path === '/api/shop/analytics') {
    try {
      const range  = url.searchParams.get('range') || '30d';
      const result = await cmsClient.getAnalytics(range);
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── GET /api/shop/analytics/pageviews ────────────
  if (req.method === 'GET' && path === '/api/shop/analytics/pageviews') {
    try {
      const range  = url.searchParams.get('range') || '30d';
      const result = await cmsClient.getPageviewAnalytics(range);
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── PUT /api/shop/settings/terms ─────────────────
  if (req.method === 'PUT' && path === '/api/shop/settings/terms') {
    try {
      const body   = await readBody(req);
      const result = await cmsClient.saveTerms(body.content || '');
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── PUT /api/shop/settings/shipping ──────────────
  if (req.method === 'PUT' && path === '/api/shop/settings/shipping') {
    try {
      const body   = await readBody(req);
      const result = await cmsClient.saveShipping(body);
      json(res, result);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ── GET /api/shop/vektor/users ───────────────────
  // Proxy to Vektor admin API — key stays server-side, response cached 60s
  if (req.method === 'GET' && path === '/api/shop/vektor/users') {
    try {
      const adminKey   = process.env.VEKTOR_ADMIN_KEY;
      const serviceKey = process.env.VEKTOR_SERVICE_KEY;
      if (!adminKey || !serviceKey) { err(res, 'Vektor keys not set in environment', 500); return; }

      const now = Date.now();
      if (_vektorUsersCache && (now - _vektorUsersCacheTs) < 60_000) {
        json(res, _vektorUsersCache); return;
      }

      const vRes = await fetch('https://vektor-xr-1.onrender.com/admin/users', {
        headers: { 'x-api-key': serviceKey, 'x-admin-secret': adminKey },
      });
      if (!vRes.ok) throw Object.assign(new Error(`Vektor API ${vRes.status}`), { status: vRes.status });
      const data = await vRes.json();
      _vektorUsersCache   = data;
      _vektorUsersCacheTs = now;
      json(res, data);
    } catch (e) { err(res, e.message, e.status || 502); }
    return;
  }

  // ═══════════════════════════════════════════════════
  // MEDIA LIBRARY — Cloudflare R2 blog-media/ prefix
  // ═══════════════════════════════════════════════════

  // ── GET /api/media/list ──────────────────────────
  if (req.method === 'GET' && path === '/api/media/list') {
    try {
      const assets = await listMediaAssets();
      json(res, { assets });
    } catch (e) { err(res, e.message || 'Failed to list media'); }
    return;
  }

  // ── POST /api/media/upload ───────────────────────
  // Expects raw binary body with ?filename=xxx&type=image/jpeg
  if (req.method === 'POST' && path === '/api/media/upload') {
    try {
      const filename    = url.searchParams.get('filename') || 'upload.bin';
      const contentType = url.searchParams.get('type')     || 'application/octet-stream';
      const body        = await readRawBody(req);
      if (!body.length) { err(res, 'Empty upload body', 400); return; }
      const asset = await uploadMediaAsset(filename, body, contentType);
      json(res, asset, 201);
    } catch (e) { err(res, e.message || 'Upload failed'); }
    return;
  }

  // ── DELETE /api/media/:key* ──────────────────────
  // key may contain slashes (e.g. blog-media/123-file.jpg) — URL-encoded
  const mediaDeleteMatch = path.match(/^\/api\/media\/(.+)$/);
  if (req.method === 'DELETE' && mediaDeleteMatch) {
    try {
      const key    = decodeURIComponent(mediaDeleteMatch[1]);
      const result = await deleteMediaAsset(key);
      json(res, result);
    } catch (e) { err(res, e.message || 'Delete failed'); }
    return;
  }

  // ═══════════════════════════════════════════════════
  // LEARNING LIBRARY — /api/library/:folder  (local disk)
  // ═══════════════════════════════════════════════════

  // ── GET /api/library/:folder ─────────────────────
  const libListMatch = path.match(/^\/api\/library\/([\w-]+)$/);
  if (req.method === 'GET' && libListMatch) {
    const folder = libListMatch[1];
    if (!isValidIntentFolder(folder)) { err(res, `Invalid folder: ${folder}`, 400); return; }
    try {
      const files = await listIntentFolder(folder);
      json(res, { folder, files });
    } catch (e) { err(res, e.message || 'List failed'); }
    return;
  }

  // ── POST /api/library/:folder/upload ─────────────
  const libUploadMatch = path.match(/^\/api\/library\/([\w-]+)\/upload$/);
  if (req.method === 'POST' && libUploadMatch) {
    const folder = libUploadMatch[1];
    if (!isValidIntentFolder(folder)) { err(res, `Invalid folder: ${folder}`, 400); return; }
    try {
      const filename = url.searchParams.get('filename') || 'upload.pdf';
      const body     = await readRawBody(req);
      if (!body.length) { err(res, 'Empty file body', 400); return; }
      const file = await saveIntentFile(folder, filename, body);
      json(res, file, 201);
    } catch (e) { err(res, e.message || 'Upload failed'); }
    return;
  }

  // ── DELETE /api/library-file/:key* ───────────────
  const libDeleteMatch = path.match(/^\/api\/library-file\/(.+)$/);
  if (req.method === 'DELETE' && libDeleteMatch) {
    try {
      const key    = decodeURIComponent(libDeleteMatch[1]);
      const result = await deleteIntentFile(key);
      json(res, result);
    } catch (e) { err(res, e.message || 'Delete failed'); }
    return;
  }

  err(res, `Not found: ${path}`, 404);
});

prewarmFonts().catch((e) => console.warn('[fontEmbedder] prewarm failed:', e.message));

server.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────────┐
  │   PathGuru Publishers v3 — API Server        │
  │   http://localhost:${PORT}                       │
  │                                             │
  │   GET  /            → Web App               │
  │   POST /api/generate → Book pipeline        │
  │   GET  /api/assets   → Pexels search        │
  │   POST /api/blog     → Blog + publish       │
  │   POST /api/epub     → EPUB only            │
  │   GET  /api/media/list   → R2 media list    │
  │   POST /api/media/upload → R2 upload        │
  └─────────────────────────────────────────────┘
`);
});
server.on('error', e => { console.error('[PathGuru] Server error:', e); process.exit(1); });
