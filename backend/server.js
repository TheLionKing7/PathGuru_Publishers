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
import * as cmsClient                    from './cmsClient.js';
import { prewarmFonts, describeEmbeddedFonts } from './fontEmbedder.js';
import {
  uploadMediaAsset,
  listMediaAssets,
  deleteMediaAsset,
} from './cloudflareR2.js';
import {
  listPosts,
  getPostBySlug,
  getPostById,
  createPost,
  updatePost,
  publishPost,
  unpublishPost,
  deletePost,
} from './supabaseClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBAPP    = join(__dirname, '..', 'webapp');
const PORT      = parseInt(process.env.PORT || '8787', 10);

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
    if (existsSync(file)) { res.writeHead(200, { 'Content-Type': mime }); res.end(readFileSync(file)); }
    else err(res, `Not found: ${path}`, 404);
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
  // BLOG CMS API — Supabase-backed CRUD
  // ═══════════════════════════════════════════════════

  // ── GET /api/posts ───────────────────────────────
  if (req.method === 'GET' && path === '/api/posts') {
    try {
      const status   = url.searchParams.get('status') || null;
      const postType = url.searchParams.get('postType') || null;
      const limit    = parseInt(url.searchParams.get('limit') || '50', 10);
      const page     = parseInt(url.searchParams.get('page') || '1', 10);
      const offset   = (page - 1) * limit;

      const result = await listPosts({ status, limit, offset, postType });
      if (result.error) { err(res, result.error, 500); return; }

      json(res, {
        posts: result.data || [],
        pagination: {
          page,
          perPage: limit,
          total: result.count || 0,
          totalPages: Math.ceil((result.count || 0) / limit),
        },
      });
    } catch (e) { err(res, e.message || 'Failed to list posts'); }
    return;
  }

  // ── GET /api/posts/:slug ─────────────────────────
  const postsMatch = path.match(/^\/api\/posts\/([^/]+)$/);
  if (req.method === 'GET' && postsMatch) {
    try {
      const slugOrId = postsMatch[1];
      // Try slug first, then ID
      let result = await getPostBySlug(slugOrId);
      if (result.error || !result.data) {
        result = await getPostById(slugOrId);
      }
      if (result.error) { err(res, result.error, 500); return; }
      if (!result.data) { err(res, 'Post not found', 404); return; }
      json(res, result.data);
    } catch (e) { err(res, e.message || 'Failed to get post'); }
    return;
  }

  // ── POST /api/posts ──────────────────────────────
  if (req.method === 'POST' && path === '/api/posts') {
    try {
      const body = await readBody(req);
      if (!body.title) { err(res, 'title is required', 400); return; }

      // Auto-generate slug if not provided
      if (!body.slug) {
        body.slug = body.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 100);
      }

      const result = await createPost(body);
      if (result.error) { err(res, result.error, 500); return; }
      json(res, result.data, 201);
    } catch (e) { err(res, e.message || 'Failed to create post'); }
    return;
  }

  // ── PUT /api/posts/:id ───────────────────────────
  if (req.method === 'PUT' && postsMatch) {
    try {
      const id   = postsMatch[1];
      const body = await readBody(req);
      const result = await updatePost(id, body);
      if (result.error) { err(res, result.error, 500); return; }
      if (!result.data) { err(res, 'Post not found', 404); return; }
      json(res, result.data);
    } catch (e) { err(res, e.message || 'Failed to update post'); }
    return;
  }

  // ── PATCH /api/posts/:id/publish ─────────────────
  const publishMatch = path.match(/^\/api\/posts\/([^/]+)\/publish$/);
  if (req.method === 'PATCH' && publishMatch) {
    try {
      const id = publishMatch[1];
      const result = await publishPost(id);
      if (result.error) { err(res, result.error, 500); return; }
      if (!result.data) { err(res, 'Post not found', 404); return; }
      json(res, result.data);
    } catch (e) { err(res, e.message || 'Failed to publish post'); }
    return;
  }

  // ── PATCH /api/posts/:id/unpublish ───────────────
  const unpublishMatch = path.match(/^\/api\/posts\/([^/]+)\/unpublish$/);
  if (req.method === 'PATCH' && unpublishMatch) {
    try {
      const id = unpublishMatch[1];
      const result = await unpublishPost(id);
      if (result.error) { err(res, result.error, 500); return; }
      if (!result.data) { err(res, 'Post not found', 404); return; }
      json(res, result.data);
    } catch (e) { err(res, e.message || 'Failed to unpublish post'); }
    return;
  }

  // ── DELETE /api/posts/:id ────────────────────────
  if (req.method === 'DELETE' && postsMatch) {
    try {
      const id = postsMatch[1];
      const result = await deletePost(id);
      if (result.error) { err(res, result.error, 500); return; }
      json(res, { success: true });
    } catch (e) { err(res, e.message || 'Failed to delete post'); }
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
      const result = await cmsClient.updateProduct(shopProductMatch[1], { status: 'archived' });
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
