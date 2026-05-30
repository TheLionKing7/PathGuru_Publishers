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

// ── Agent network ──────────────────────────────────────────────────────────────
import { synthesizer } from './agents/synthesizer.js';
import { nexus }       from './agents/nexus.js';
import { atlas }       from './agents/atlas.js';
import { nova }        from './agents/nova.js';
import { aether }      from './agents/aether.js';
import { pulse }       from './agents/pulse.js';
import { assistant }   from './agents/assistant.js';

const AGENTS = { synthesizer, nexus, atlas, nova, aether, pulse, assistant };
import { prewarmFonts, describeEmbeddedFonts } from './fontEmbedder.js';
import {
  getLibrarySummary, ensureLibraryDir,
  listIntentFolder, saveIntentFile, deleteIntentFile, isValidIntentFolder,
} from './referenceLibrary.js';
import { extractPdfProfile }                     from './pdfDesignExtractor.js';
import {
  isR2Enabled,
  uploadMediaAsset,
  listMediaAssets,
  deleteMediaAsset,
  uploadLibraryFile,
  listLibraryFiles  as listLibraryFilesR2,
  deleteLibraryFile as deleteLibraryFileR2,
  putJsonCache,
  getJsonCache,
  saveAgencyPlaybook,
  getAgencyPlaybook,
  listAgencyPlaybooks,
  deleteAgencyPlaybook,
} from './cloudflareR2.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBAPP    = join(__dirname, '..', 'webapp');
const PORT      = parseInt(process.env.PORT || '8787', 10);

// ── Vektor users cache ───────────────────────────────────────────────────────
// In-memory for the current process lifetime.
// On first request after a restart, warmed from R2 (cache/vektor-users.json)
// so users never see a cold-start error.
const VEKTOR_CACHE_TTL  = 10 * 60_000; // 10 minutes
const VEKTOR_R2_KEY     = 'cache/vektor-users.json';

let _vektorUsersCache   = null; // in-memory
let _vektorUsersCacheTs = 0;

const STATIC = {
  '/':                      { file: join(WEBAPP, 'index.html'),            mime: 'text/html; charset=utf-8' },
  '/index.html':            { file: join(WEBAPP, 'index.html'),            mime: 'text/html; charset=utf-8' },
  '/style.css':             { file: join(WEBAPP, 'style.css'),             mime: 'text/css; charset=utf-8' },
  '/app.js':                { file: join(WEBAPP, 'app.js'),                mime: 'application/javascript; charset=utf-8' },
  '/blog.js':               { file: join(WEBAPP, 'blog.js'),               mime: 'application/javascript; charset=utf-8' },
  '/shop.js':               { file: join(WEBAPP, 'shop.js'),               mime: 'application/javascript; charset=utf-8' },
  '/analytics.js':          { file: join(WEBAPP, 'analytics.js'),          mime: 'application/javascript; charset=utf-8' },
  '/agents.js':             { file: join(WEBAPP, 'agents.js'),             mime: 'application/javascript; charset=utf-8' },
  // OneSignal service worker — MUST be served as application/javascript from the origin root.
  // Browsers reject service workers with any other Content-Type.
  '/OneSignalSDKWorker.js': { file: join(WEBAPP, 'OneSignalSDKWorker.js'), mime: 'application/javascript; charset=utf-8' },
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
  // Proxy to Vektor admin API.
  // • In-memory cache (TTL 10 min) for the current process
  // • R2-persisted cache (cache/vektor-users.json) survives Render restarts
  // • Auto-retry up to 3× on 429/503 (Render free-tier cold start) with 4 s backoff
  // • Falls back to last-known R2 snapshot rather than surfacing an error
  if (req.method === 'GET' && path === '/api/shop/vektor/users') {
    const adminKey   = process.env.VEKTOR_ADMIN_KEY;
    const serviceKey = process.env.VEKTOR_SERVICE_KEY;
    if (!adminKey || !serviceKey) { err(res, 'Vektor keys not set in environment', 500); return; }

    const now   = Date.now();
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // 1. Serve in-memory cache if still fresh
    if (_vektorUsersCache && (now - _vektorUsersCacheTs) < VEKTOR_CACHE_TTL) {
      json(res, _vektorUsersCache); return;
    }

    let lastStatus = null;
    let lastError  = null;

    // 2. Try to fetch fresh data from Vektor, with retries on cold-start responses
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const vRes = await fetch('https://vektor-xr-1.onrender.com/admin/users', {
          headers: { 'x-api-key': serviceKey, 'x-admin-secret': adminKey },
          signal:  AbortSignal.timeout(35_000), // Render free-tier cold start takes up to ~30 s
        });
        lastStatus = vRes.status;

        if (vRes.status === 429 || vRes.status === 503) {
          if (attempt < 3) { await sleep(4_000); continue; }
          break; // exhausted — fall through to stale cache
        }

        if (!vRes.ok) { lastError = `Vektor API returned ${vRes.status}`; break; }

        // Success — update in-memory cache and persist to R2
        const data          = await vRes.json();
        _vektorUsersCache   = data;
        _vektorUsersCacheTs = now;
        putJsonCache(VEKTOR_R2_KEY, { ...data, _cachedAt: now }).catch(() => {}); // fire-and-forget
        json(res, data);
        return;

      } catch (e) {
        lastError = e.message || 'Network error';
        if (attempt < 3) { await sleep(4_000); continue; }
        break;
      }
    }

    // 3. All live attempts failed — try R2 snapshot first, then in-memory stale
    let stale = _vektorUsersCache;
    if (!stale) {
      try { stale = await getJsonCache(VEKTOR_R2_KEY); } catch {}
      if (stale) { _vektorUsersCache = stale; _vektorUsersCacheTs = stale._cachedAt ?? 0; }
    }

    if (stale) {
      const reason = lastStatus === 429 ? 'rate_limited' : (lastError || `status_${lastStatus}`);
      json(res, { ...stale, _stale: true, _staleReason: reason });
    } else {
      const msg = lastStatus === 429
        ? 'Vektor is warming up — please refresh in a moment.'
        : (lastError || `Vektor API returned ${lastStatus}`);
      err(res, msg, lastStatus || 502);
    }
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
  // LEARNING LIBRARY — /api/library/:folder
  // Uses R2 when credentials are available, local disk otherwise
  // ═══════════════════════════════════════════════════

  // ── GET /api/library/:folder ─────────────────────
  const libListMatch = path.match(/^\/api\/library\/([\w-]+)$/);
  if (req.method === 'GET' && libListMatch) {
    const folder = libListMatch[1];
    if (!isValidIntentFolder(folder)) { err(res, `Invalid folder: ${folder}`, 400); return; }
    try {
      const files = isR2Enabled()
        ? await listLibraryFilesR2(folder)
        : await listIntentFolder(folder);
      json(res, { folder, files, storage: isR2Enabled() ? 'r2' : 'local' });
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
      const file = isR2Enabled()
        ? await uploadLibraryFile(folder, filename, body)
        : await saveIntentFile(folder, filename, body);
      json(res, { ...file, storage: isR2Enabled() ? 'r2' : 'local' }, 201);
    } catch (e) { err(res, e.message || 'Upload failed'); }
    return;
  }

  // ── DELETE /api/library-file/:key* ───────────────
  const libDeleteMatch = path.match(/^\/api\/library-file\/(.+)$/);
  if (req.method === 'DELETE' && libDeleteMatch) {
    try {
      const key    = decodeURIComponent(libDeleteMatch[1]);
      const result = isR2Enabled()
        ? await deleteLibraryFileR2(key)
        : await deleteIntentFile(key);
      json(res, result);
    } catch (e) { err(res, e.message || 'Delete failed'); }
    return;
  }

  // ═══════════════════════════════════════════════════
  // AGENT NETWORK — /api/agents/*
  // ═══════════════════════════════════════════════════

  // ── POST /api/agents/:agentId/run ────────────────────────────────────────
  // Dispatch a task to a specific agent. Body is the task instruction object.
  // Example: POST /api/agents/atlas/run  { action: 'research', topic: 'SaaS BD' }
  const agentRunMatch = path.match(/^\/api\/agents\/([\w-]+)\/run$/);
  if (req.method === 'POST' && agentRunMatch) {
    const agentId = agentRunMatch[1];
    const agent   = AGENTS[agentId];
    if (!agent) { err(res, `Unknown agent: ${agentId}`, 404); return; }
    try {
      const body   = await readBody(req);
      const result = await agent.run(body);
      json(res, result);
    } catch (e) { err(res, e.message || 'Agent run failed', 500); }
    return;
  }

  // ── POST /api/agents/nexus/orchestrate ───────────────────────────────────
  // Send a natural-language instruction — Nexus decomposes and routes it.
  if (req.method === 'POST' && path === '/api/agents/nexus/orchestrate') {
    try {
      const { instruction, priority } = await readBody(req);
      if (!instruction) { err(res, 'instruction required', 400); return; }
      const result = await nexus.orchestrate(instruction, { priority });
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/status ───────────────────────────────────────────────
  // Live snapshot of all agents and their active tasks.
  if (req.method === 'GET' && path === '/api/agents/status') {
    try {
      const status = await nexus.getNetworkStatus();
      json(res, status);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/tasks ────────────────────────────────────────────────
  // Task history with optional ?agent=atlas&status=completed&limit=30 filters
  if (req.method === 'GET' && path === '/api/agents/tasks') {
    try {
      const agentId = url.searchParams.get('agent')  || null;
      const status  = url.searchParams.get('status') || null;
      const limit   = parseInt(url.searchParams.get('limit')  || '30', 10);
      const offset  = parseInt(url.searchParams.get('offset') || '0',  10);
      const result  = await nexus.getTaskHistory({ agentId, status, limit, offset });
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/report ───────────────────────────────────────────────
  // Generate a status report from Nexus. ?type=daily|weekly|monthly
  if (req.method === 'GET' && path === '/api/agents/report') {
    try {
      const period = url.searchParams.get('period') || 'weekly';
      const report = await nexus.generateStatusReport();
      json(res, { report, period });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/synthesizer/ingest ─────────────────────────────────
  // Trigger PDF ingestion. Body: { prefix, domain } or { r2Key, domain }
  if (req.method === 'POST' && path === '/api/agents/synthesizer/ingest') {
    try {
      const { r2Key, prefix, domain } = await readBody(req);
      let result;
      if (r2Key) {
        result = await synthesizer.ingestPDF(r2Key, domain || 'general');
      } else {
        result = await synthesizer.ingestAll(prefix || 'knowledge/', domain || 'general');
      }
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/synthesizer/query ──────────────────────────────────
  // Query the knowledge base. Body: { query, forAgent, domains }
  if (req.method === 'POST' && path === '/api/agents/synthesizer/query') {
    try {
      const { query, forAgent, domains } = await readBody(req);
      if (!query) { err(res, 'query required', 400); return; }
      const answer = await synthesizer.answer(query, forAgent || 'team', domains || []);
      json(res, { answer });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/research ─────────────────────────────────────
  // Full research + document production. Returns JSON with result text + doc metadata.
  // Body: { topic, docType, docFormat, depth, audience, researchType, client, buildDoc }
  if (req.method === 'POST' && path === '/api/agents/atlas/research') {
    try {
      const body   = await readBody(req);
      const { topic, ...options } = body;
      if (!topic) { err(res, 'topic required', 400); return; }
      const output = await atlas.research(topic, options);
      // Strip the raw buffer from JSON response — use /download for file delivery
      const docMeta = output.document
        ? { filename: output.document.filename, format: output.document.format, hasDoc: true }
        : null;
      json(res, { result: output.result || output, sources: output.sources || [], document: docMeta });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/produce-doc ──────────────────────────────────
  // Build a consulting document from provided content (no research step).
  // Body: { content, title, subtitle, docType, format, author, client }
  if (req.method === 'POST' && path === '/api/agents/atlas/produce-doc') {
    try {
      const { buildConsultingDoc, listDocTemplates } = await import('./skills/docBuilder.js');
      const body = await readBody(req);
      if (!body.content || !body.title) { err(res, 'content and title required', 400); return; }
      const doc  = await buildConsultingDoc(body);
      res.setHeader('Content-Type', doc.format === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : doc.format === 'pdf' ? 'application/pdf' : 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
      res.end(doc.buffer);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/synthesize-playbook ──────────────────────────
  // Phase 1+2+3: Extract → Hybridize → Store agency IP.
  // Body: { title, slug, domain, type, sources[], tagline, access, instruction }
  //   sources: array of framework names e.g. ['McKinsey 7S', 'BCG DAI', 'IBM Garage']
  //   instruction: optional extra guidance for hybridisation
  if (req.method === 'POST' && path === '/api/agents/atlas/synthesize-playbook') {
    try {
      const body = await readBody(req);
      const { title, domain = 'business_development', type = 'playbook',
              sources = [], tagline = '', access = 'premium', instruction = '' } = body;
      if (!title) { err(res, 'title is required', 400); return; }

      // Build a URL-safe slug from title if not provided
      const slug = (body.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
        + '-' + Date.now().toString(36);

      // Compose the hybridisation instruction from the guideline's Phase 2 template
      const hybridInstruction = [
        instruction,
        sources.length
          ? `Synthesise logic from: ${sources.join(', ')}.`
          : '',
        `Phase 1 (Audit/Diagnostic): Extract the assessment logic.`,
        `Phase 2 (Setup/Infrastructure): Define the technical and structural approach.`,
        `Phase 3 (Execution): Detail the implementation and iteration process.`,
        `Include: Actionable Checklists for each phase, a Scorecard / Maturity Matrix,`,
        `Diagnostic Questions (5–10), Deliverables per Phase, and a Visual Structure Description.`,
        `Write in a professional consultant-grade tone. This is proprietary DigiFusion IP.`,
      ].filter(Boolean).join(' ');

      const content = await atlas.buildFramework(title, domain, hybridInstruction);
      if (!content) { err(res, 'Atlas returned no content', 500); return; }

      const entry = await saveAgencyPlaybook({ slug, title, domain, type, content, sources, tagline, access });
      json(res, { ok: true, entry, preview: content.slice(0, 500) });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/agency-ip ────────────────────────────────────────────
  // List all generated agency playbooks/frameworks (metadata only).
  if (req.method === 'GET' && path === '/api/agents/agency-ip') {
    try {
      const access = url.searchParams.get('access') || undefined;
      const type   = url.searchParams.get('type')   || undefined;
      const items  = await listAgencyPlaybooks({ access, type });
      json(res, { playbooks: items });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/agency-ip/:slug ─────────────────────────────────────
  // Retrieve full content of one agency playbook.
  if (req.method === 'GET' && /^\/api\/agents\/agency-ip\/[^/]+$/.test(path)) {
    try {
      const slug = path.split('/').pop();
      const pb   = await getAgencyPlaybook(slug);
      if (!pb) { err(res, 'Not found', 404); return; }
      json(res, pb);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── DELETE /api/agents/agency-ip/:slug ───────────────────────────────────
  if (req.method === 'DELETE' && /^\/api\/agents\/agency-ip\/[^/]+$/.test(path)) {
    try {
      const slug = path.split('/').pop();
      const result = await deleteAgencyPlaybook(slug);
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/doc-templates ───────────────────────────────────────
  if (req.method === 'GET' && path === '/api/agents/doc-templates') {
    try {
      const { listDocTemplates } = await import('./skills/docBuilder.js');
      json(res, { templates: listDocTemplates() });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/pulse/sweep ────────────────────────────────────────
  // Run a monitoring sweep manually.
  if (req.method === 'POST' && path === '/api/agents/pulse/sweep') {
    try {
      const report = await pulse.sweep();
      json(res, report);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/pulse/report
  if (req.method === 'GET' && path === '/api/agents/pulse/report') {
    try {
      const period = url.searchParams.get('period') || 'weekly';
      json(res, await pulse.generateReport(period));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/pulse/dispatch ─────────────────────────────────────
  // Manually trigger notification dispatch (push + WhatsApp for all pending).
  if (req.method === 'POST' && path === '/api/agents/pulse/dispatch') {
    try {
      const { dispatchPendingNotifications } = await import('./skills/notifier.js');
      const result = await dispatchPendingNotifications(100);
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/notifications ───────────────────────────────────────
  // Fetch recent notifications for the dashboard.
  if (req.method === 'GET' && path === '/api/agents/notifications') {
    const { getSupabase: _db2 } = await import('./supabaseClient.js');
    const db = _db2();
    if (!db) { err(res, 'Supabase not configured', 503); return; }
    try {
      const status = url.searchParams.get('status') || null;
      const limit  = parseInt(url.searchParams.get('limit') || '50', 10);
      let q = db.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      json(res, { notifications: data || [] });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/assistant/chat
  if (req.method === 'POST' && path === '/api/agents/assistant/chat') {
    try {
      const body = await readBody(req);
      if (!body.message) { err(res, 'message required', 400); return; }
      json(res, await assistant.chat(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/assistant/lead
  if (req.method === 'POST' && path === '/api/agents/assistant/lead') {
    try {
      json(res, await assistant.saveLead(await readBody(req)));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/leads
  if (req.method === 'GET' && path === '/api/agents/leads') {
    const { getSupabase: _getDb } = await import('./supabaseClient.js');
    const db = _getDb();
    if (!db) { err(res, 'Supabase not configured', 503); return; }
    try {
      const status = url.searchParams.get('status') || null;
      const limit  = parseInt(url.searchParams.get('limit') || '50', 10);
      let q = db.from('leads').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(limit);
      if (status) q = q.eq('status', status);
      const { data, count, error } = await q;
      if (error) throw new Error(error.message);
      json(res, { leads: data || [], total: count });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  err(res, `Not found: ${path}`, 404);
});

prewarmFonts().catch((e) => console.warn('[fontEmbedder] prewarm failed:', e.message));

server.listen(PORT, () => {
  console.log(`
  ┌────────────────────────────────────────────┐
  │   PathGuru Publishers v3 + Agent Network     │
  │   http://localhost:${PORT}                        │
  │                                              │
  │   POST /api/agents/nexus/orchestrate          │
  │   GET  /api/agents/status                     │
  │   GET  /api/agents/tasks                      │
  │   POST /api/agents/:id/run                    │
  │   POST /api/agents/synthesizer/ingest         │
  │   POST /api/agents/assistant/chat             │
  └────────────────────────────────────────────┘
`);
});
server.on('error', e => { console.error('[PathGuru] Server error:', e); process.exit(1); });
