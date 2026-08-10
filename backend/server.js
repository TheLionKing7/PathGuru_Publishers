// Load .env — works with Node 20.6+ --env-file flag OR dotenv package
try { const { createRequire } = await import('node:module'); createRequire(import.meta.url)('dotenv').config({ path: new URL('../.env', import.meta.url) }); } catch {}

/**
 * PathGuru Publishers — API Server (DigiFusion Command)
 *
 * GET  /              → desktop shell UI
 * GET  /ping            → lightweight keep-alive
 * GET  /health          → status
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

import { generateAndPublishBlogPost, publishBlogPost } from './blogPublisher.js';
import * as cmsClient                     from './cmsClient.js';
import { createPost as dbCreatePost, updatePost as dbUpdatePost, getSupabase, supabaseWrite } from './supabaseClient.js';

// ── Agent network ──────────────────────────────────────────────────────────────
import { synthesizer } from './agents/synthesizer.js';
import { nexus, _notifyOwnerWhatsApp } from './agents/nexus.js';
import { researcher }  from './agents/researcher.js';
import { atlas }       from './agents/atlas.js';
import { nova }        from './agents/nova.js';
import { aether }      from './agents/aether.js';
import { pulse }       from './agents/pulse.js';
import { assistant }   from './agents/assistant.js';

// ── Phase 2: Godmode — Delivery Leverage harness modules ────────────────────
import {
  runExceptionHarvest,
  runFrictionTaxAssembly,
  runThreeInkFirstPass,
  recordReclassification,
  getAggregateReclassificationRate,
  recordEngagementOutcome,
  getCalibrationStatus,
  computeMeasuredPriors,
  getActivePriors,
  isCalibrated,
  computeDivergence,
  extractEngagementOutcome,
  scoreHarnessHealth,
  getHarnessHealthBand,
  generateCharter,
  saveCharter,
  getCharter,
  listCharters,
} from './harness/godmode/index.js';

const AGENTS = { synthesizer, nexus, researcher, atlas, nova, aether, pulse, assistant };
import {
  isR2Enabled,
  uploadMediaAsset,
  listMediaAssets,
  deleteMediaAsset,
  fetchMediaObject,
  putJsonCache,
  getJsonCache,
  saveAgencyPlaybook,
  getAgencyPlaybook,
  listAgencyPlaybooks,
  deleteAgencyPlaybook,
  listFirmIpDocuments,
  getFirmIpMeta,
  getFirmIpDownloadUrl,
  getFirmIpDocumentBytes,
} from './cloudflareR2.js';
import { verifyCronAuth, cronAuthFail, isCronAuthRequired } from './http/cronAuth.js';
import {
  applyCors, isPublicPath, verifyOperator, operatorAuthFail,
  isOperatorAuthConfigured, checkPassword, issueSession,
  setSessionCookie, clearSessionCookie, logOperatorAuthStatus,
} from './http/operatorAuth.js';
import { enforce as rateLimit } from './http/rateLimit.js';
import { buildPlatformConfig } from './skills/productRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBAPP    = join(__dirname, '..', 'webapp');
const PORT      = parseInt(process.env.PORT || '8787', 10);

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.md': 'text/markdown; charset=utf-8',
};

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
  '/css/departments.css':        { file: join(WEBAPP, 'css', 'departments.css'),        mime: 'text/css; charset=utf-8' },
  '/css/command-dashboard.css':  { file: join(WEBAPP, 'css', 'command-dashboard.css'),  mime: 'text/css; charset=utf-8' },
  '/app.js':                { file: join(WEBAPP, 'app.js'),                mime: 'application/javascript; charset=utf-8' },
  '/js/core/shell.js':      { file: join(WEBAPP, 'js', 'core', 'shell.js'), mime: 'application/javascript; charset=utf-8' },
  '/blog.js':               { file: join(WEBAPP, 'blog.js'),               mime: 'application/javascript; charset=utf-8' },
  '/shop.js':               { file: join(WEBAPP, 'shop.js'),               mime: 'application/javascript; charset=utf-8' },
  '/analytics.js':          { file: join(WEBAPP, 'analytics.js'),          mime: 'application/javascript; charset=utf-8' },
  '/agents.js':             { file: join(WEBAPP, 'agents.js'),             mime: 'application/javascript; charset=utf-8' },
  '/frictioniq.js':         { file: join(WEBAPP, 'frictioniq.js'),         mime: 'application/javascript; charset=utf-8' },
  // OneSignal service worker — MUST be served as application/javascript from the origin root.
  // Browsers reject service workers with any other Content-Type.
  '/OneSignalSDKWorker.js': { file: join(WEBAPP, 'OneSignalSDKWorker.js'), mime: 'application/javascript; charset=utf-8' },
};

/**
 * CORS now comes from http/operatorAuth.js, which replaces the old
 * `Access-Control-Allow-Origin: *` with an origin allowlist. The wildcard and
 * credentialed requests are mutually exclusive by specification — and this API
 * now carries a session cookie, so it has to know who is allowed to call it.
 */
function cors(req, res) {
  applyCors(req, res);
}

function serveWebappFile(res, filePath, mime) {
  if (!existsSync(filePath)) return false;
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(readFileSync(filePath));
  return true;
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
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  /**
   * Collapse repeated leading slashes BEFORE parsing. This is not tidiness.
   *
   * `//api/frictioniq/sessions` is a PROTOCOL-RELATIVE url. Passed to
   * `new URL(req.url, base)` it resolved the host to `api` and the path to
   * `/frictioniq/sessions`, which matched no route — and that is exactly why
   * the FrictionIQ console sat on its loading spinner forever. Normalising
   * after parsing would be too late: by then the path has already lost its
   * first segment. The client bug that produced the double slash is fixed in
   * webapp/js/core/backend.js; this is the second lock on the same door.
   */
  const rawUrl = String(req.url || '/').replace(/^\/{2,}/, '/');
  const url  = new URL(rawUrl, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/{2,}/g, '/');

  /* ── The gate ────────────────────────────────────────────────────────────
   *
   * Deny by default: everything under /api/ needs an operator session unless
   * http/operatorAuth.js lists it as public. A route added next month is
   * protected the moment it is written. The opposite arrangement — gating a
   * list of sensitive routes — fails on the first route somebody forgets, and
   * that route is always the interesting one.
   *
   * This sits above every handler on purpose. Anything below it can assume the
   * caller is authorised, which is the only assumption that stays true as the
   * file grows.
   */
  if (!isPublicPath(path)) {
    if (!verifyOperator(req)) { operatorAuthFail(res, err); return; }
  }

  /* ── Auth routes ─────────────────────────────────────────────────────── */

  if (path === '/api/auth/status') {
    json(res, {
      configured: isOperatorAuthConfigured(),
      authenticated: verifyOperator(req),
    });
    return;
  }

  if (req.method === 'POST' && path === '/api/auth/login') {
    if (!isOperatorAuthConfigured()) {
      err(res, 'Operator auth is not configured. Set PATHGURU_OPERATOR_PASSWORD.', 503);
      return;
    }
    const body = await readBody(req);
    if (!checkPassword(body.password)) {
      // Deliberately slow and deliberately vague. A precise error message here
      // is a hint, and this endpoint is reachable by anyone.
      await new Promise((r) => setTimeout(r, 400));
      err(res, 'Incorrect password', 401);
      return;
    }
    const token = issueSession();
    if (!token) { err(res, 'Cannot issue a session — no signing secret', 503); return; }
    setSessionCookie(res, req, token);
    json(res, { ok: true });
    return;
  }

  if (req.method === 'POST' && path === '/api/auth/logout') {
    clearSessionCookie(res, req);
    json(res, { ok: true });
    return;
  }

  // ── Ping (lightweight — point UptimeRobot here, 60s timeout) ─────────────
  if (path === '/ping' || path === '/api/cron/ping') {
    json(res, { ok: true, service: 'digifusion-command', ts: new Date().toISOString() });
    return;
  }

  // ── Platform config (product launcher + desktop hybrid bootstrap) ───────
  if (path === '/api/platform/config' || path === '/api/platform') {
    json(res, buildPlatformConfig());
    return;
  }

  // ── Health (full diagnostics — Render dashboard; avoid for 5-min keep-alive) ──
  if (path === '/health') {
    const platform = buildPlatformConfig();
    json(res, {
      status:  'ok',
      service: 'DigiFusion Command',
      version: '3.0',
      ts:      new Date().toISOString(),
      platform: {
        products: platform.products.map(p => p.id),
        hybrid:   platform.hybrid,
      },
    });
    return;
  }

  // ── Static (webapp) — /css/* and /js/* auto-served from webapp folders ──
  if (req.method === 'GET' && path.startsWith('/css/')) {
    const rel = decodeURIComponent(path.slice(5)).replace(/\\/g, '/').replace(/\.\./g, '');
    if (rel && rel.endsWith('.css') && !rel.startsWith('/')) {
      const filePath = join(WEBAPP, 'css', rel);
      if (serveWebappFile(res, filePath, 'text/css; charset=utf-8')) return;
      err(res, `Not found: ${path}`, 404);
      return;
    }
  }

  if (req.method === 'GET' && path.startsWith('/js/')) {
    const rel = decodeURIComponent(path.slice(4)).replace(/\\/g, '/').replace(/\.\./g, '');
    if (rel && rel.endsWith('.js') && !rel.startsWith('/')) {
      const filePath = join(WEBAPP, 'js', rel);
      if (serveWebappFile(res, filePath, 'application/javascript; charset=utf-8')) return;
      err(res, `Not found: ${path}`, 404);
      return;
    }
  }

  if (req.method === 'GET' && path.startsWith('/assets/')) {
    const rel = decodeURIComponent(path.slice(8)).replace(/\\/g, '/').replace(/\.\./g, '');
    const ASSET_MIME = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };
    const ext = rel.includes('.') ? rel.slice(rel.lastIndexOf('.')).toLowerCase() : '';
    if (rel && ext && ASSET_MIME[ext] && !rel.startsWith('/')) {
      const filePath = join(WEBAPP, 'assets', rel);
      if (serveWebappFile(res, filePath, ASSET_MIME[ext])) return;
      err(res, `Not found: ${path}`, 404);
      return;
    }
  }

  if (req.method === 'GET' && STATIC[path]) {
    const { file, mime } = STATIC[path];
    if (serveWebappFile(res, file, mime)) return;
    err(res, `Not found: ${path}`, 404);
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

      // ── Approval gate ─────────────────────────────────────────────────────
      // initiatedBy === 'user'  (default) → Boss is driving from the blog publisher.
      //   No approval needed. Generate and return immediately.
      // initiatedBy === 'agent' → An agent (Nexus/Aether) is trying to push a post.
      //   Must pause, fire WhatsApp to Boss, and wait for explicit YES.
      const initiatedBy = (input.initiatedBy || 'user').toLowerCase();

      if (initiatedBy === 'agent') {
        console.log(`[PathGuru] Agent-initiated blog — routing through approval gate`);
        const { createApprovalRequest } = await import('./skills/approvalGate.js');
        const { approvalId, whatsappSent } = await createApprovalRequest({
          approvalType: 'blog_post',
          subject:      `Blog post approval — ${input.topic.slice(0, 60)}`,
          detail: [
            `An agent wants to write and publish a blog post.`,
            ``,
            `📌 *Topic:* ${input.topic}`,
            `✍️  *Author:* ${input.author || 'Not specified — please confirm'}`,
            `🎯 *Tone:* ${input.tone || 'Not specified'}`,
            `👥 *Audience:* ${input.audience || 'Not specified'}`,
          ].join('\n'),
          payload: { ...input, platforms: [] },
        });
        json(res, {
          status:      'pending_approval',
          approvalId,
          whatsappSent,
          message:     'Approval request sent to Boss via WhatsApp. Nothing will be written until Boss confirms.',
        });
        return;
      }

      // User-initiated — proceed immediately, no gate needed
      console.log(`[PathGuru] Generating blog post: "${input.topic}"`);
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
          authorName:          body.author_name         || null,
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
        author_name:           body.author_name         || null,
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
        const lookupSlug = body.slug || id;
        let status = body.status || body.post_status;
        if (!status) {
          try {
            const existing = await cmsClient.getPost(lookupSlug);
            const post = existing?.data || existing;
            status = post?.status || 'draft';
          } catch {
            status = 'draft';
          }
        }
        const cmsPayload = {
          slug:             lookupSlug,
          title:            body.title,
          content:          body.content,
          excerpt:          body.excerpt          || '',
          meta_description: body.metaDescription  || body.meta_description || '',
          focus_keyword:    body.focusKeyword      || body.focus_keyword    || '',
          featured_image_url:    body.featured_image_url  || body.featuredImageUrl  || null,
          featured_image_credit: body.featured_image_credit || body.featuredImageCredit || '',
          post_type:        body.postType          || body.post_type        || 'article',
          status,
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
      const result = await cmsClient.refundOrder(shopRefundMatch[1], body);
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

  // ── GET /api/shop/settings/terms ─────────────────
  if (req.method === 'GET' && path === '/api/shop/settings/terms') {
    try {
      const result = await cmsClient.getTerms();
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

  // ── GET /api/shop/settings/shipping ──────────────
  if (req.method === 'GET' && path === '/api/shop/settings/shipping') {
    try {
      const result = await cmsClient.getShipping();
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

  // ── PATCH /api/shop/vektor/plan ──────────────────
  // Proxy plan changes to Vektor admin API (avoids browser CORS).
  if (req.method === 'PATCH' && path === '/api/shop/vektor/plan') {
    const adminKey   = process.env.VEKTOR_ADMIN_KEY;
    const serviceKey = process.env.VEKTOR_SERVICE_KEY;
    if (!adminKey || !serviceKey) { err(res, 'Vektor keys not set in environment', 500); return; }
    try {
      const body = await readBody(req);
      if (!body.email || !body.plan) { err(res, 'email and plan required', 400); return; }
      const vRes = await fetch('https://vektor-xr-1.onrender.com/admin/users/plan', {
        method:  'PATCH',
        headers: {
          'Content-Type':   'application/json',
          'x-api-key':      serviceKey,
          'x-admin-secret': adminKey,
        },
        body: JSON.stringify({ email: body.email, plan: body.plan }),
        signal: AbortSignal.timeout(35_000),
      });
      const data = await vRes.json().catch(() => ({}));
      if (!vRes.ok) { err(res, data.error || `Vektor API returned ${vRes.status}`, vRes.status); return; }
      _vektorUsersCache   = null;
      _vektorUsersCacheTs = 0;
      json(res, data);
    } catch (e) { err(res, e.message, 500); }
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

  // ── GET /api/media/:key — stream blog-media asset (writer preview + public fallback) ──
  const mediaFileMatch = path.match(/^\/api\/media\/(.+)$/);
  if (req.method === 'GET' && mediaFileMatch) {
    try {
      const key = decodeURIComponent(mediaFileMatch[1]);
      if (!key.startsWith('blog-media/')) { err(res, 'Forbidden', 403); return; }
      const { body, contentType } = await fetchMediaObject(key);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(body);
    } catch (e) { err(res, e.message || 'Not found', 404); }
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
  // AGENT NETWORK — /api/agents/*
  // ═══════════════════════════════════════════════════

  // ── POST /api/agents/:agentId/run  (and /task alias) ───────────────────────
  // Dispatch a task to a specific agent. Body is the task instruction object.
  // Example: POST /api/agents/atlas/run  { action: 'research', topic: 'SaaS BD' }
  //          POST /api/agents/synthesizer/task  { action: 'ingest_all' }
  const agentRunMatch = path.match(/^\/api\/agents\/([\w-]+)\/(run|task)$/);
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
      const { instruction, priority, researchBrief, nextStep } = await readBody(req);
      if (!instruction) { err(res, 'instruction required', 400); return; }
      const result = await nexus.orchestrate(instruction, { priority, researchBrief, nextStep });
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

  // ── POST /api/agents/tasks ───────────────────────────────────────────────
  // Create a manual task and optionally dispatch it to an agent immediately.
  // Body: { title, description, agent_id, priority, type, due_at }
  if (req.method === 'POST' && path === '/api/agents/tasks') {
    try {
      const body = await readBody(req);
      const { title, description, agent_id, priority = 3, type = 'general', due_at } = body;
      if (!title) { err(res, 'title is required', 400); return; }

      const db = getSupabase();
      if (!db) {
        err(res, 'Task storage unavailable — configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Render', 503);
        return;
      }
      const taskRow = {
        title,
        description:  description || null,
        agent_id:     agent_id    || null,
        created_by:   'team',
        status:       'pending',
        priority:     Math.min(5, Math.max(1, parseInt(priority, 10) || 3)),
        type:         type || 'general',
        due_at:       due_at || null,
        input:        description ? { instruction: description } : null,
      };
      const { data, error: dbErr } = await db.from('tasks').insert(taskRow).select().single();
      if (dbErr) { err(res, dbErr.message, 500); return; }

      // If an agent is assigned, dispatch with full lifecycle management
      // so the task moves through pending → in_progress → completed/failed
      // and never gets stuck triggering escalation alerts.
      if (agent_id && data) {
        const agentMap = { nexus, atlas, nova, aether, pulse, synthesizer, researcher };
        const agent = agentMap[agent_id];
        if (agent) {
          const taskId = data.id;
          (async () => {
            try {
              if (taskId && typeof agent.startTask === 'function') await agent.startTask(taskId);
              const result = await agent.execute({ ...data, instruction: description || title });
              if (taskId && typeof agent.completeTask === 'function') await agent.completeTask(taskId, result);
            } catch (e) {
              console.warn(`[Server] Task dispatch to ${agent_id} failed:`, e.message);
              if (taskId && typeof agent.failTask === 'function') await agent.failTask(taskId, e.message);
            }
          })();
        }
      }

      // Nexus acknowledges task creation to owner via WhatsApp SMS only (no Chrome push)
      const agentLabel    = agent_id ? agent_id.charAt(0).toUpperCase() + agent_id.slice(1) : 'Unassigned';
      const priorityMap   = { 1: '🔴 Critical', 2: '🟠 High', 3: '🟡 Normal', 4: '🟢 Low', 5: '⚪ Minimal' };
      const priorityLabel = priorityMap[taskRow.priority] || 'Normal';
      const waMessage     = `✅ *Task Logged — Nexus*\n\n*${title}*\n• Agent: ${agentLabel}\n• Priority: ${priorityLabel}\n• Type: ${type}${description ? `\n• Brief: ${description.slice(0, 150)}` : ''}`;
      _notifyOwnerWhatsApp(waMessage)
        .catch(e => console.warn('[Server] Nexus WhatsApp task-ack failed:', e.message));

      json(res, { success: true, task: data });
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

  // ── GET /api/agents/synthesizer/debug-r2 ────────────────────────────────
  // Diagnostic: shows which env vars are present and attempts an R2 listing.
  // Returns env key names (never values) + raw API response for debugging.
  if (req.method === 'GET' && path === '/api/agents/synthesizer/debug-r2') {
    const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const bucket    = (process.env.CLOUDFLARE_R2_BUCKET  || process.env.R2_BUCKET_NAME || '').trim();
    const apiToken  = (process.env.CLOUDFLARE_API_TOKEN  || '').trim();
    const s3Key     = (process.env.R2_ACCESS_KEY_ID      || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '').trim();
    const s3Secret  = (process.env.R2_SECRET_ACCESS_KEY  || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '').trim();

    const envReport = {
      CLOUDFLARE_ACCOUNT_ID:  accountId  ? `set (${accountId.length} chars)` : 'MISSING',
      CLOUDFLARE_R2_BUCKET:   process.env.CLOUDFLARE_R2_BUCKET   ? `set → "${process.env.CLOUDFLARE_R2_BUCKET}"` : 'not set',
      R2_BUCKET_NAME:         process.env.R2_BUCKET_NAME         ? `set → "${process.env.R2_BUCKET_NAME}"` : 'not set',
      CLOUDFLARE_API_TOKEN:   apiToken   ? `set (${apiToken.length} chars)` : 'MISSING',
      R2_ACCESS_KEY_ID:       s3Key      ? `set (${s3Key.length} chars)`    : 'not set',
      R2_SECRET_ACCESS_KEY:   s3Secret   ? 'set' : 'not set',
      resolvedBucket:         bucket     || 'NONE — neither CLOUDFLARE_R2_BUCKET nor R2_BUCKET_NAME is set!',
    };

    // Test S3 listing (preferred path) if credentials are available
    let s3Test = null;
    if (accountId && bucket && s3Key && s3Secret) {
      try {
        const { synthesizer: _syn } = await import('./agents/synthesizer.js');
        // We can't call the private helper directly, so just try ingestAll with limit=0 dry-run
        // Instead, manually do a small S3 list to verify credentials
        const { createHash, createHmac } = await import('crypto');
        const now      = new Date();
        const amzDate  = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
        const dateStamp = amzDate.slice(0, 8);
        const host     = `${accountId}.r2.cloudflarestorage.com`;
        const path_    = `/${bucket}`;
        const qparams  = `list-type=2&max-keys=5&prefix=knowledge%2F`;
        const payloadHash = createHash('sha256').update('').digest('hex');
        const hdrs = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
        const sortedHdrs = Object.keys(hdrs).sort();
        const canonicalHeaders = sortedHdrs.map(k => `${k}:${hdrs[k]}\n`).join('');
        const signedHeaders = sortedHdrs.join(';');
        const canonicalRequest = ['GET', path_, qparams, canonicalHeaders, signedHeaders, payloadHash].join('\n');
        const credScope = `${dateStamp}/auto/s3/aws4_request`;
        const strToSign = ['AWS4-HMAC-SHA256', amzDate, credScope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
        const kDate    = createHmac('sha256', 'AWS4' + s3Secret).update(dateStamp).digest();
        const kRegion  = createHmac('sha256', kDate).update('auto').digest();
        const kService = createHmac('sha256', kRegion).update('s3').digest();
        const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
        const signature = createHmac('sha256', kSigning).update(strToSign).digest('hex');
        const auth = `AWS4-HMAC-SHA256 Credential=${s3Key}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
        const s3Url = `https://${host}${path_}?${qparams}`;
        const s3r = await fetch(s3Url, { headers: { ...hdrs, Authorization: auth } });
        const s3body = await s3r.text();
        const keys = [...s3body.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
        s3Test = { status: s3r.status, objectsFound: keys.length, sampleKeys: keys.slice(0, 5) };
      } catch (e) {
        s3Test = { error: e.message };
      }
    } else {
      s3Test = { skipped: 'S3 credentials not set — add R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY on Render' };
    }

    // Also test REST API (for reference — expected to 401 unless you have a dashboard token)
    let restTest = null;
    if (accountId && bucket && apiToken) {
      try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects?prefix=knowledge%2F&limit=5`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
        const body = await r.text();
        restTest = { status: r.status, note: r.status === 401 ? 'Expected — CLOUDFLARE_API_TOKEN is not a dashboard REST token' : 'OK', body: body.slice(0, 200) };
      } catch (e) {
        restTest = { error: e.message };
      }
    }

    json(res, { env: envReport, s3Test, restTest });
    return;
  }

  // ── GET /api/agents/synthesizer/knowledge-stats ──────────────────────────
  // Returns the count, domain breakdown, and recent entries in the knowledge_base.
  if (req.method === 'GET' && path === '/api/agents/synthesizer/knowledge-stats') {
    try {
      const { getSupabase: _kdb } = await import('./supabaseClient.js');
      const db = _kdb();
      if (!db) { json(res, { error: 'Supabase not configured' }, 503); return; }

      // Total count
      const { count: total } = await db.from('knowledge_base').select('*', { count: 'exact', head: true });

      // Count per domain — must set limit > 1000 to avoid Supabase default cap
      const { data: domainRows } = await db.from('knowledge_base').select('domain').order('domain').limit(20000);
      const domainCounts = {};
      for (const row of (domainRows || [])) {
        domainCounts[row.domain] = (domainCounts[row.domain] || 0) + 1;
      }

      // Unique PDFs ingested — same high limit
      const { data: sourceRows } = await db.from('knowledge_base').select('source_key').order('source_key').limit(20000);
      const uniqueSources = [...new Set((sourceRows || []).map(r => r.source_key))];

      // 5 most recent entries
      const { data: recent } = await db.from('knowledge_base')
        .select('id, title, domain, source_name, relevance_score, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      json(res, {
        totalUnits:      total || 0,
        uniquePDFs:      uniqueSources.length,
        domainCounts,
        ingestedSources: uniqueSources,
        recentEntries:   recent || [],
        status: (total || 0) > 0 ? '✅ Knowledge base populated' : '⚠️ Knowledge base is empty',
      });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── GET /api/agents/tasks/:taskId ───────────────────────────────────────
  // Poll a single task by its Supabase UUID — used by the frontend to track
  // long-running agent jobs (ingest, research, synthesis, etc.)
  const taskPollMatch = path.match(/^\/api\/agents\/tasks\/([\w-]+)$/);
  if (req.method === 'GET' && taskPollMatch) {
    const taskId = taskPollMatch[1];
    try {
      const { getSupabase: _db3 } = await import('./supabaseClient.js');
      const db = _db3();
      if (!db) { err(res, 'Supabase not configured', 503); return; }
      const { data, error } = await db
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      if (error || !data) { err(res, 'Task not found', 404); return; }

      // Normalise status: Supabase uses 'in_progress'/'completed', frontend also checks 'done'
      const status = data.status === 'completed' ? 'done' : data.status;

      // Extract a readable result string from the JSONB output blob
      const raw = data.output || {};
      let result = null;
      if (typeof raw.result === 'string')       result = raw.result;
      else if (typeof raw.result === 'object')  result = JSON.stringify(raw.result, null, 2);
      else if (typeof raw === 'string')         result = raw;
      else                                       result = JSON.stringify(raw, null, 2);

      json(res, {
        ...data,
        taskId:    data.id,
        status,
        result,
        output:    data.output || null,
        error:     data.error_message || data.error || null,
      });
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

  // ── GET /api/firm-ip/library ─────────────────────────────────────────────
  // Unified catalog: operating frameworks (agent DNA) + Intelligence Library (paywalled).
  if (req.method === 'GET' && path === '/api/firm-ip/library') {
    try {
      const { buildFirmIpLibraryCatalog, seedEngagementModelKnowledge } = await import('./skills/firmKnowledge.js');
      const db = getSupabase();
      if (db) await seedEngagementModelKnowledge(db);
      const manifest = await listFirmIpDocuments();
      const catalog = buildFirmIpLibraryCatalog(manifest);
      json(res, catalog);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/synthesizer/frameworks ───────────────────────────────
  // Probe knowledge_base for firm operating frameworks (registry + KB status).
  if (req.method === 'GET' && path === '/api/agents/synthesizer/frameworks') {
    try {
      const result = await synthesizer.getFirmFrameworks();
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

  // ── GET /api/agents/atlas/download/:filename ─────────────────────────────
  // Serve persisted Atlas DOCX/PDF from R2 (see atlasDeliverables.js).
  const atlasDlMatch = path.match(/^\/api\/agents\/atlas\/download\/(.+)$/);
  if (req.method === 'GET' && atlasDlMatch) {
    try {
      const filename = decodeURIComponent(atlasDlMatch[1]);
      const { getAtlasDocumentByFilename } = await import('./lib/atlasDeliverables.js');
      const doc = await getAtlasDocumentByFilename(filename);
      if (!doc?.buffer) { err(res, 'Document not found or R2 not configured', 404); return; }
      const ct = doc.format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      res.setHeader('Content-Type', ct);
      res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
      res.end(doc.buffer);
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
      if (!body.title) { err(res, 'title is required', 400); return; }
      const { runIpFactory } = await import('./skills/ipFactory.js');
      const result = await runIpFactory({
        title:              body.title,
        domain:             body.domain || 'business_development',
        type:               body.type || 'playbook',
        sources:            body.sources || [],
        instruction:        body.instruction || '',
        tagline:            body.tagline || '',
        access:             body.access || 'premium',
        promote:            body.promote === true,
        promoteAsOperating: body.promoteAsOperating === true,
        audience:           body.audience,
        industry:           body.industry,
      });
      json(res, { ok: true, entry: result.entry, slug: result.slug, quality: result.quality, promotion: result.promotion, preview: result.preview });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AETHER — Marketing Studio Routes
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/agents/aether/ops — marketing queue + frameworks snapshot ───
  if (req.method === 'GET' && path === '/api/agents/aether/ops') {
    try {
      json(res, await aether.getMarketingOpsStatus());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/aether/strategy-session ─────────────────────────────
  // Interactive strategy session with note-taking. Aether as co-strategist.
  // Body: { message, sessionId, brand?, topic?, goals? }
  if (req.method === 'POST' && path === '/api/agents/aether/strategy-session') {
    try {
      const body = await readBody(req);
      const { message, sessionId, brand = '', topic = '', goals = '' } = body;
      if (!message) { err(res, 'message is required', 400); return; }
      const sid = sessionId || `session-${Date.now()}`;
      const result = await aether.strategySession(message, sid, { brand, topic, goals });
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/aether/session-notes/:sessionId ──────────────────────
  // Retrieve all notes and compiled brief from a strategy session.
  const sessionNotesMatch = path.match(/^\/api\/agents\/aether\/session-notes\/([^/]+)$/);
  if (req.method === 'GET' && sessionNotesMatch) {
    try {
      const sessionId = decodeURIComponent(sessionNotesMatch[1]);
      const result = await aether.getSessionNotes(sessionId);
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/aether/diagnostic ───────────────────────────────────
  // Run the Content Maturity Scorecard for a client.
  // Body: { brand, answers: { q1: 3, q2: 4, ... } | "free text description", context? }
  if (req.method === 'POST' && path === '/api/agents/aether/diagnostic') {
    try {
      const body = await readBody(req);
      const { brand, answers, context = '' } = body;
      if (!brand) { err(res, 'brand is required', 400); return; }
      const result = await aether.runDiagnostic(brand, answers || '', context);
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/aether/c2c-pipeline ─────────────────────────────────
  // Run the full 4-phase Content-to-Capital Pipeline for a brand.
  // Body: { brand, audience?, goals?, channels?, context? }
  if (req.method === 'POST' && path === '/api/agents/aether/c2c-pipeline') {
    try {
      const body = await readBody(req);
      const { brand, audience, goals, channels, context, topicArea, hubTopic } = body;
      if (!brand) { err(res, 'brand is required', 400); return; }
      const result = await aether.runFullPipeline(brand, { audience, goals, channels, context, topicArea, hubTopic });
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/aether/framework ────────────────────────────────────
  // Build a proprietary digital media framework using the C2C architecture.
  // Body: { frameworkName, targetAudience?, industry?, instruction? }
  if (req.method === 'POST' && path === '/api/agents/aether/framework') {
    try {
      const body = await readBody(req);
      const { frameworkName, targetAudience, industry, instruction } = body;
      if (!frameworkName) { err(res, 'frameworkName is required', 400); return; }
      const result = await aether.buildDigitalMediaFramework(frameworkName, { targetAudience, industry, instruction });
      json(res, { ok: true, framework: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/aether/write-blog ───────────────────────────────────
  // Aether writes a blog derivative (teaser) from Orion research or a stored playbook.
  // Body: { topic, researchBrief? | playbookSlug?, force?, audience?, tone?, wordCount?,
  //         seoKeyword?, niche?, ctaGoal?, personaId?, frameworkId?, publish? (default true) }
  if (req.method === 'POST' && path === '/api/agents/aether/write-blog') {
    try {
      const body = await readBody(req);
      const {
        topic, audience, tone, wordCount, seoKeyword, niche, ctaGoal, personaId,
        voiceNotes, publish = true, researchBrief, playbookSlug, frameworkId, force = false,
      } = body;
      if (!topic?.trim()) { err(res, 'topic is required', 400); return; }

      const { validateBlogDerivativeInput } = await import('./skills/contentAdvocate.js');
      const gate = validateBlogDerivativeInput({ researchBrief, playbookSlug, force });
      if (!gate.ok) { err(res, gate.error, 422); return; }

      let playbookTitle   = '';
      let playbookExcerpt = '';
      if (playbookSlug?.trim()) {
        const pb = await getAgencyPlaybook(playbookSlug.trim());
        if (!pb) { err(res, `Playbook not found: ${playbookSlug}`, 404); return; }
        playbookTitle   = pb.title || playbookSlug;
        const raw       = pb.content ?? pb.body ?? '';
        playbookExcerpt = typeof raw === 'string' ? raw : JSON.stringify(raw);
      }

      // Step 1 — Aether produces raw content grounded in research / playbook IP
      const rawContent = await aether.produceContent('blog post', topic, {
        audience: audience || 'business professionals in digital transformation, automation, or media',
        voiceNotes: voiceNotes || '',
        callToAction: ctaGoal || 'Book a free strategy session at digitafusion.com/agency/booking',
        wordCount: wordCount || 1200,
        stdcStage: 'THINK — consideration and authority-building',
        researchBrief: researchBrief || '',
        playbookTitle,
        playbookExcerpt,
        frameworkId: frameworkId || '',
      });

      const { resolveContentAuthor } = await import('./skills/contentAuthorRegistry.js');
      const { loadContentAuthorSettings } = await import('./skills/contentAuthorSettings.js');
      const authorSettings = await loadContentAuthorSettings().catch(() => ({}));
      const resolvedAuthor = resolveContentAuthor({
        topic,
        niche:         niche || body.domain,
        domain:        body.domain || body.contentDomain,
        category:      body.category,
        authorId:      body.authorId,
        domainAuthors: authorSettings.domainAuthors,
      });

      // Step 2 — Pass through the full blog publisher pipeline (HTML + image + CMS)
      const result = await generateAndPublishBlogPost({
        topic,
        audience,
        tone:           tone || 'authoritative yet accessible',
        seoKeyword:     seoKeyword || topic,
        niche:          niche || resolvedAuthor.contentDomain,
        ctaGoal,
        personaId,
        aetherContent:  rawContent,
        postType:       body.postType || 'article',
        author:         body.author || resolvedAuthor.byline,
        researchBrief:  researchBrief || '',
        playbookSlug:   playbookSlug || '',
        playbookTitle,
        playbookExcerpt,
        frameworkId:    frameworkId || '',
        platforms: publish ? [{
          type:    'digifusion',
          status:  'published',
          siteUrl: process.env.DIGIFUSION_API_URL || 'http://localhost:3000',
        }] : [],
      });

      json(res, { ok: true, ...result, agent: 'aether', published: publish });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ATLAS — Senior Research Partner & BD Director (Deal Engine)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /api/agents/atlas/strategy-session ───────────────────────────────
  // Interactive BD strategy session with note-taking. Atlas as co-strategist.
  // Body: { message, sessionId, accountName?, dealStage?, context? }
  if (req.method === 'POST' && path === '/api/agents/atlas/strategy-session') {
    try {
      const body = await readBody(req);
      const { message, sessionId, accountName = '', dealStage = '', context = '' } = body;
      if (!message) { err(res, 'message is required', 400); return; }
      const sid = sessionId || `session-${Date.now()}`;
      const result = await atlas.strategySession(message, sid, { accountName, dealStage, context });
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/atlas/ops — pipeline + BD tools snapshot ─────────────
  if (req.method === 'GET' && path === '/api/agents/atlas/ops') {
    try {
      json(res, await atlas.getBdOpsStatus());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/atlas/session-notes/:sessionId ───────────────────────
  // Retrieve compiled Deal Brief from a strategy session.
  const atlasSessionNotesMatch = path.match(/^\/api\/agents\/atlas\/session-notes\/([^/]+)$/);
  if (req.method === 'GET' && atlasSessionNotesMatch) {
    try {
      const sessionId = decodeURIComponent(atlasSessionNotesMatch[1]);
      const result = await atlas.getSessionNotes(sessionId);
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/deal-diagnostic ────────────────────────────────
  // Run the BD Maturity Scorecard for a prospect account.
  // Body: { accountName, answers: { q1: 3, q2: 4, ... } | "free text", context? }
  if (req.method === 'POST' && path === '/api/agents/atlas/deal-diagnostic') {
    try {
      const body = await readBody(req);
      const { accountName, answers, context = '' } = body;
      if (!accountName) { err(res, 'accountName is required', 400); return; }
      const result = await atlas.runDealDiagnostic(accountName, answers || '', context);
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/deal-engine ────────────────────────────────────
  // Run the full 4-phase Deal Engine for a target account.
  // Body: { accountName, industry?, decisionMakers?, context?, painPoints? }
  if (req.method === 'POST' && path === '/api/agents/atlas/deal-engine') {
    try {
      const body = await readBody(req);
      const { accountName, industry, decisionMakers, context, painPoints, dealSize } = body;
      if (!accountName) { err(res, 'accountName is required', 400); return; }
      const result = await atlas.runFullDealEngine(accountName, { industry, decisionMakers, context, painPoints, dealSize });
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/phase1-intelligence ────────────────────────────
  // Body: { accountName, industry?, context? }
  if (req.method === 'POST' && path === '/api/agents/atlas/phase1-intelligence') {
    try {
      const body = await readBody(req);
      const { accountName, industry = '', context = '' } = body;
      if (!accountName) { err(res, 'accountName is required', 400); return; }
      const result = await atlas.runPhase1Intelligence(accountName, industry, context);
      json(res, { ok: true, phase: 'intelligence', output: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/phase2-diagnostic ─────────────────────────────
  // Body: { accountName, context? }
  if (req.method === 'POST' && path === '/api/agents/atlas/phase2-diagnostic') {
    try {
      const body = await readBody(req);
      const { accountName, context = '' } = body;
      if (!accountName) { err(res, 'accountName is required', 400); return; }
      const result = await atlas.runPhase2Diagnostic(accountName, context);
      json(res, { ok: true, phase: 'diagnostic', output: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/phase3-insight ────────────────────────────────
  // Body: { accountName, context? }
  if (req.method === 'POST' && path === '/api/agents/atlas/phase3-insight') {
    try {
      const body = await readBody(req);
      const { accountName, context = '' } = body;
      if (!accountName) { err(res, 'accountName is required', 400); return; }
      const result = await atlas.runPhase3Insight(accountName, context);
      json(res, { ok: true, phase: 'insight', output: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/phase4-consensus ───────────────────────────────
  // Body: { accountName, context? }
  if (req.method === 'POST' && path === '/api/agents/atlas/phase4-consensus') {
    try {
      const body = await readBody(req);
      const { accountName, context = '' } = body;
      if (!accountName) { err(res, 'accountName is required', 400); return; }
      const result = await atlas.runPhase4Consensus(accountName, context);
      json(res, { ok: true, phase: 'consensus', output: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/client-maturity ────────────────────────────────
  // Assess a CLIENT's own BD maturity: Ad-Hoc → Managed → Predictable Growth Engine.
  // Body: { clientName, inputs: { q1: 3, ... } | "free text", context? }
  if (req.method === 'POST' && path === '/api/agents/atlas/client-maturity') {
    try {
      const body = await readBody(req);
      const { clientName, inputs, context = '' } = body;
      if (!clientName) { err(res, 'clientName is required', 400); return; }
      const result = await atlas.runClientMaturityAssessment(clientName, inputs || '', context);
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/dream50 ───────────────────────────────────────
  // Build a Dream 50 target account strategy.
  // Body: { industry, services?, geography?, dealSizeTarget?, context? }
  if (req.method === 'POST' && path === '/api/agents/atlas/dream50') {
    try {
      const body = await readBody(req);
      const { industry, services, geography, dealSizeTarget, context } = body;
      if (!industry) { err(res, 'industry is required', 400); return; }
      const result = await atlas.buildDream50(industry, { services, geography, dealSizeTarget, context });
      json(res, { ok: true, dream50: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/research ──────────────────────────────────────
  // Deep market / prospect research. Body: { topic, depth?, focus?, context? }
  if (req.method === 'POST' && path === '/api/agents/atlas/research') {
    try {
      const body = await readBody(req);
      const { topic, depth, focus, context } = body;
      if (!topic) { err(res, 'topic is required', 400); return; }
      const result = await atlas.research(topic, { depth, focus, context });
      json(res, { ok: true, research: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/atlas/analyse-prospect ───────────────────────────────
  // Analyse a prospect through the Deal Engine lens.
  // Body: { companyName, context? }
  if (req.method === 'POST' && path === '/api/agents/atlas/analyse-prospect') {
    try {
      const body = await readBody(req);
      const { companyName, context = '' } = body;
      if (!companyName) { err(res, 'companyName is required', 400); return; }
      const result = await atlas.analyseProspect(companyName, context);
      json(res, { ok: true, analysis: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NOVA — Automation Velocity Engine Routes
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /api/agents/nova/strategy-session ────────────────────────────────
  // Conversational strategy session with Nova.
  // Body: { message, sessionId?, sessionMeta? }
  if (req.method === 'POST' && path === '/api/agents/nova/strategy-session') {
    try {
      const body = await readBody(req);
      const { message, sessionId, sessionMeta = {} } = body;
      if (!message) { err(res, 'message is required', 400); return; }
      const result = await nova.strategySession(message, sessionId, sessionMeta);
      json(res, { ok: true, ...result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/nova/session-notes/:sessionId ─────────────────────────
  // Get Technical Design Brief compiled from session history.
  if (req.method === 'GET' && /^\/api\/agents\/nova\/session-notes\/[^/]+$/.test(path)) {
    try {
      const sessionId = path.split('/').pop();
      const notes = await nova.getSessionNotes(sessionId);
      json(res, { ok: true, notes });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/maturity-assessment ─────────────────────────────
  // Run the Automation Maturity Assessment (3-tier classification).
  // Body: { clientName, inputs, context? }
  if (req.method === 'POST' && path === '/api/agents/nova/maturity-assessment') {
    try {
      const body = await readBody(req);
      const { clientName, inputs, context = '' } = body;
      if (!clientName || !inputs) { err(res, 'clientName and inputs are required', 400); return; }
      const result = await nova.runAutomationMaturityAssessment(clientName, inputs, context);
      json(res, { ok: true, assessment: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/velocity-engine ─────────────────────────────────
  // Run the full 5-phase Automation Velocity Engine pipeline.
  // Body: { clientName, options? }
  if (req.method === 'POST' && path === '/api/agents/nova/velocity-engine') {
    try {
      const body = await readBody(req);
      const { clientName, options = {} } = body;
      if (!clientName) { err(res, 'clientName is required', 400); return; }
      const result = await nova.runFullVelocityEngine(clientName, options);
      json(res, { ok: true, engine: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/phase1-diagnose ─────────────────────────────────
  if (req.method === 'POST' && path === '/api/agents/nova/phase1-diagnose') {
    try {
      const body = await readBody(req);
      const { clientName, options = {} } = body;
      if (!clientName) { err(res, 'clientName is required', 400); return; }
      const result = await nova.runPhase1Diagnose(clientName, options);
      json(res, { ok: true, phase1: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/phase2-architect ────────────────────────────────
  if (req.method === 'POST' && path === '/api/agents/nova/phase2-architect') {
    try {
      const body = await readBody(req);
      const { clientName, options = {} } = body;
      if (!clientName) { err(res, 'clientName is required', 400); return; }
      const result = await nova.runPhase2Architect(clientName, options);
      json(res, { ok: true, phase2: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/phase3-build ────────────────────────────────────
  if (req.method === 'POST' && path === '/api/agents/nova/phase3-build') {
    try {
      const body = await readBody(req);
      const { clientName, options = {} } = body;
      if (!clientName) { err(res, 'clientName is required', 400); return; }
      const result = await nova.runPhase3Build(clientName, options);
      json(res, { ok: true, phase3: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/phase4-deploy ───────────────────────────────────
  if (req.method === 'POST' && path === '/api/agents/nova/phase4-deploy') {
    try {
      const body = await readBody(req);
      const { clientName, options = {} } = body;
      if (!clientName) { err(res, 'clientName is required', 400); return; }
      const result = await nova.runPhase4Deploy(clientName, options);
      json(res, { ok: true, phase4: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/phase5-scale ────────────────────────────────────
  if (req.method === 'POST' && path === '/api/agents/nova/phase5-scale') {
    try {
      const body = await readBody(req);
      const { clientName, options = {} } = body;
      if (!clientName) { err(res, 'clientName is required', 400); return; }
      const result = await nova.runPhase5Scale(clientName, options);
      json(res, { ok: true, phase5: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/build-framework ─────────────────────────────────
  // Generate a bespoke automation framework for a client.
  // Body: { frameworkName, options? }
  if (req.method === 'POST' && path === '/api/agents/nova/build-framework') {
    try {
      const body = await readBody(req);
      const { frameworkName, options = {} } = body;
      if (!frameworkName) { err(res, 'frameworkName is required', 400); return; }
      const result = await nova.buildAutomationFramework(frameworkName, options);
      json(res, { ok: true, framework: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── PHASE 2 GODMODE — Delivery Leverage API Routes ─────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /api/agents/nova/exception-harvest ──────────────────────────────
  // Ingest raw ticket/correction logs, produce a 4-field deviation catalog.
  // Body: { rawInput, industry?, tokenLimit?, costLimitUsdMills? }
  if (req.method === 'POST' && path === '/api/agents/nova/exception-harvest') {
    try {
      const body = await readBody(req);
      if (!body.rawInput) { err(res, 'rawInput is required', 400); return; }
      const result = await runExceptionHarvest({
        agentId: 'nova',
        rawInput: body.rawInput,
        industry: body.industry,
        tokenLimit: body.tokenLimit,
        costLimitUsdMills: body.costLimitUsdMills,
      });
      json(res, { ok: true, catalog: result.catalog, summary: result.summary, runId: result.runId });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/friction-tax ───────────────────────────────────
  // Extract Friction Tax inputs from raw client data and compute the figure.
  // Body: { rawData, industry?, currency?, revenue?, wedgeShare?, buildCost? }
  if (req.method === 'POST' && path === '/api/agents/nova/friction-tax') {
    try {
      const body = await readBody(req);
      if (!body.rawData) { err(res, 'rawData is required', 400); return; }
      const result = await runFrictionTaxAssembly({
        agentId: 'nova', rawData: body.rawData, industry: body.industry,
        currency: body.currency, revenue: body.revenue,
        wedgeShare: body.wedgeShare, buildCost: body.buildCost,
        tokenLimit: body.tokenLimit, costLimitUsdMills: body.costLimitUsdMills,
      });
      json(res, { ok: true, result: result.result, inputs: result.inputs, runId: result.runId });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/three-ink ──────────────────────────────────────
  // Classify operational flows green/blue/red. Agent proposes; human disposes.
  // Body: { processDescription, tokenLimit?, costLimitUsdMills? }
  if (req.method === 'POST' && path === '/api/agents/nova/three-ink') {
    try {
      const body = await readBody(req);
      if (!body.processDescription) { err(res, 'processDescription is required', 400); return; }
      const result = await runThreeInkFirstPass({
        agentId: 'nova', processDescription: body.processDescription,
        tokenLimit: body.tokenLimit, costLimitUsdMills: body.costLimitUsdMills,
      });
      json(res, { ok: true, flows: result.flows, classifications: result.classifications, inkDistribution: result.inkDistribution, runId: result.runId });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/three-ink/reclassify ────────────────────────────
  // Record the consultant's reclassification after human review.
  // Body: { runId, reclassified: [{ name, original_ink, final_ink, reason }] }
  if (req.method === 'POST' && path === '/api/agents/nova/three-ink/reclassify') {
    try {
      const body = await readBody(req);
      if (!body.runId || !Array.isArray(body.reclassified)) { err(res, 'runId and reclassified array are required', 400); return; }
      const rate = await recordReclassification({ runId: body.runId, agentId: 'nova', reclassified: body.reclassified });
      json(res, { ok: true, ...rate });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/nova/three-ink/rate ───────────────────────────────────
  // Aggregate reclassification rate across all runs — the honest metric.
  if (req.method === 'GET' && path === '/api/agents/nova/three-ink/rate') {
    try {
      const rate = await getAggregateReclassificationRate();
      json(res, { ok: true, ...(rate || { rate: null, note: 'not enough data — need human-reviewed classifications' }) });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── PHASE 3 GODMODE — Calibration at Scale ─────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /api/agents/nova/calibration/outcome ────────────────────────────
  // Record a completed engagement's structured outcome.
  // Body: { engagementId, outcome, selfScore, assessorScore, frictionTax?, ... }
  if (req.method === 'POST' && path === '/api/agents/nova/calibration/outcome') {
    try {
      const body = await readBody(req);
      if (!body.engagementId || !body.outcome) { err(res, 'engagementId and outcome required', 400); return; }
      const result = await recordEngagementOutcome(body);
      json(res, { ok: true, outcome: result });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/nova/calibration/status ──────────────────────────────
  // Current calibration state: basis, outcome counts, by-band breakdown.
  if (req.method === 'GET' && path === '/api/agents/nova/calibration/status') {
    try {
      const status = await getCalibrationStatus();
      json(res, { ok: true, ...status });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/calibration/compute ────────────────────────────
  // Compute measured priors from engagement outcomes and persist.
  if (req.method === 'POST' && path === '/api/agents/nova/calibration/compute') {
    try {
      const result = await computeMeasuredPriors();
      json(res, { ok: true, ...(result || { note: 'no outcomes to calibrate against' }) });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/nova/calibration/priors ──────────────────────────────
  // Get the currently active priors — measured if calibrated, declared otherwise.
  if (req.method === 'GET' && path === '/api/agents/nova/calibration/priors') {
    try {
      const priors = await getActivePriors();
      json(res, { ok: true, ...priors });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/nova/calibration/divergence ───────────────────────────
  // Self-score vs assessor-score divergence per band and sector.
  if (req.method === 'GET' && path === '/api/agents/nova/calibration/divergence') {
    try {
      const div = await computeDivergence();
      json(res, { ok: true, ...(div || { note: 'not enough paired scores' }) });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/calibration/extract ────────────────────────────
  // Agent-assisted extraction: pull structured outcomes from engagement artifacts.
  // Body: { engagementId, rawArtifacts }
  if (req.method === 'POST' && path === '/api/agents/nova/calibration/extract') {
    try {
      const body = await readBody(req);
      if (!body.rawArtifacts) { err(res, 'rawArtifacts is required', 400); return; }
      const result = await extractEngagementOutcome({
        agentId: 'nova', engagementId: body.engagementId, rawArtifacts: body.rawArtifacts,
      });
      json(res, { ok: true, runId: result.runId });
    } catch (e) { err(res, e.message, 500); }
    return;
  }


  // ══════════════════════════════════════════════════════════════════════════
  // ── PHASE 4 GODMODE — The Productised Service ──────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/agents/nova/harness/health ──────────────────────────────────
  // Score the agent estate across 4 dimensions (0–100). The product pitch.
  if (req.method === 'GET' && path === '/api/agents/nova/harness/health') {
    try {
      const health = await scoreHarnessHealth();
      json(res, { ok: true, ...health });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/nova/harness/health/band ──────────────────────────────
  // Quick check — just band and total.
  if (req.method === 'GET' && path === '/api/agents/nova/harness/health/band') {
    try {
      const band = await getHarnessHealthBand();
      json(res, { ok: true, ...band });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/agents/nova/harness/charter ────────────────────────────────
  // Generate and persist a governance charter for a client.
  // Body: { clientId, governor, tokenCeiling?, costCeilingUsdMills?, ... }
  if (req.method === 'POST' && path === '/api/agents/nova/harness/charter') {
    try {
      const body = await readBody(req);
      if (!body.clientId || !body.governor) { err(res, 'clientId and governor required', 400); return; }
      const result = await saveCharter(body);
      json(res, { ok: true, health: result.health, charter: result.charter.slice(0, 500) + '...' });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/nova/harness/charter/:clientId ───────────────────────
  // Retrieve the latest charter for a client.
  if (req.method === 'GET' && /^\/api\/agents\/nova\/harness\/charter\/([^/]+)$/.test(path)) {
    try {
      const clientId = path.split('/').pop();
      const charter = await getCharter(clientId);
      if (!charter) { err(res, 'Charter not found', 404); return; }
      json(res, { ok: true, charter });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/nova/harness/charters ────────────────────────────────
  // List all active client charters.
  if (req.method === 'GET' && path === '/api/agents/nova/harness/charters') {
    try {
      const charters = await listCharters();
      json(res, { ok: true, charters });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/agents/nova/harness/charter/:clientId/full ───────────────────
  // Get the full charter document as markdown (for rendering).
  if (req.method === 'GET' && /^\/api\/agents\/nova\/harness\/charter\/([^/]+)\/full$/.test(path)) {
    try {
      const clientId = path.split('/harness/charter/')[1]?.replace('/full', '');
      const charter = await getCharter(clientId);
      if (!charter?.charter) { err(res, 'Charter not found', 404); return; }
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(charter.charter);
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

  // ════════════════════════════════════════════════════════════════════════
  // SERVICE BOOKINGS
  // ════════════════════════════════════════════════════════════════════════

  // GET /api/bookings — list all bookings (Intelligence tab)
  if (req.method === 'GET' && path === '/api/bookings') {
    const db = getSupabase(); if (!db) { err(res, 'Supabase not configured', 503); return; }
    try {
      const status = url.searchParams.get('status');
      const limit  = parseInt(url.searchParams.get('limit') || '100', 10);
      let q = db.from('service_bookings').select('*').order('booking_time', { ascending: false }).limit(limit);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      json(res, { bookings: data || [] });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // PATCH /api/bookings/:id — update status (confirm, cancel, complete)
  if (req.method === 'PATCH' && path.startsWith('/api/bookings/')) {
    const id = path.split('/')[3];
    const db = getSupabase(); if (!db) { err(res, 'Supabase not configured', 503); return; }
    try {
      const body = await readBody(req);
      const { data, error } = await db.from('service_bookings').update(body).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      // If just confirmed, sync milestone to Nexus
      if (body.status === 'confirmed') {
        nexus.syncLifecycleMilestone({
          leadId:     data.lead_id,
          clientName: data.client_name,
          track:      data.track,
          milestone:  'strategy_session_booked',
          data:       { bookingId: id, bookingTime: data.booking_time },
        }).catch(() => {});
      }
      json(res, { booking: data });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── /api/webhooks/whatsapp — Twilio inbound WhatsApp messages ───────────────
  // Twilio POSTs application/x-www-form-urlencoded on inbound messages.
  // GET returns 200 for console/browser checks (Twilio validation, manual test).
  // Webhook URL: https://pathguru-publishers.onrender.com/api/webhooks/whatsapp
  if (path === '/api/webhooks/whatsapp' || path === '/api/webhooks/whatsapp/') {
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
      json(res, { ok: true, webhook: 'whatsapp', inbound: 'POST', hint: 'Twilio inbound messages use POST' });
      return;
    }
    if (req.method !== 'POST') {
      err(res, 'Method not allowed — use POST for inbound messages', 405);
      return;
    }
    try {
      // Twilio sends application/x-www-form-urlencoded
      const raw = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', c => data += c);
        req.on('end',  () => resolve(data));
        req.on('error', reject);
      });
      const params  = new URLSearchParams(raw);
      const from    = (params.get('From') || '').replace('whatsapp:', '').trim();
      const msgBody = (params.get('Body') || '').trim();

      // Security: only accept messages from the owner's number
      const ownerRaw   = (process.env.OWNER_PHONE || process.env.WHATSAPP_TO || '').trim().replace('whatsapp:', '');
      const ownerPhone = ownerRaw.replace(/\s/g, '');
      const fromNorm   = from.replace(/\s/g, '');
      const allowed    = !ownerPhone
        || fromNorm === ownerPhone
        || fromNorm === ownerPhone.replace(/^\+/, '')
        || `+${fromNorm.replace(/^\+/, '')}` === `+${ownerPhone.replace(/^\+/, '')}`;

      const twiml = reply => {
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Message></Response>`);
      };

      if (!allowed) {
        console.warn(`[WhatsApp] Blocked message from unknown number: ${from}`);
        return twiml('Unauthorised.');
      }

      if (!msgBody) return twiml('I did not receive any text. Please try again.');

      console.log(`[WhatsApp→Nexus] From: ${from} | Message: ${msgBody.slice(0, 80)}`);

      // ── Approval gate check — FIRST before Nexus chat ────────────────────
      // If there is a pending approval request and Boss's reply is YES/NO,
      // resolve it and execute the approved action rather than passing to chat.
      let reply;
      try {
        const { processBossApprovalMessage } = await import('./skills/approvalActions.js');
        const result = await processBossApprovalMessage(msgBody);

        if (result.handled) {
          console.log(`[WhatsApp] Approval resolved: ${result.approval?.decision} (${result.approval?.approvalId?.slice(0, 8)})`);
          reply = result.reply;
          const safe = (reply || '').length > 1550 ? reply.slice(0, 1547) + '…' : reply;
          res.writeHead(200, { 'Content-Type': 'text/xml' });
          res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Message></Response>`);
          return;
        }
      } catch (gateErr) {
        console.warn('[WhatsApp] Approval gate check failed (continuing to Nexus chat):', gateErr.message);
      }

      // ── No pending approval — route to Nexus chat as normal ──────────────
      // Maintain per-number conversation history in memory (resets on server restart)
      if (!global._waHistory) global._waHistory = {};
      const history = global._waHistory[from] || [];

      // Pass to Nexus chat
      const result = await AGENTS.nexus.chat(msgBody, history);
      reply        = typeof result === 'string' ? result : result?.response || result?.message || JSON.stringify(result);

      // Update history (keep last 10 turns to avoid bloat)
      history.push({ role: 'user',      content: msgBody });
      history.push({ role: 'assistant', content: reply   });
      global._waHistory[from] = history.slice(-20);

      // Twilio caps messages at 1600 chars — truncate gracefully
      const safe = reply.length > 1550 ? reply.slice(0, 1547) + '…' : reply;
      return twiml(safe);

    } catch (e) {
      console.error('[WhatsApp webhook] Error:', e.message);
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Nexus encountered an error: ${e.message.slice(0, 100)}</Message></Response>`);
    }
    return;
  }

  // POST /api/bookings/calendly-webhook — Calendly fires this when someone books
  if (req.method === 'POST' && path === '/api/bookings/calendly-webhook') {
    try {
      const body = await readBody(req);
      const db = getSupabase();
      if (db && body.event === 'invitee.created') {
        const inv = body.payload?.invitee || {};
        const evt = body.payload?.event   || {};
        const { data } = await db.from('service_bookings').insert({
          client_name:      inv.name,
          client_email:     inv.email,
          client_phone:     inv.text_reminder_number || null,
          booking_time:     evt.start_time,
          source:           'calendly',
          calendly_event_id: evt.uuid,
          status:           'confirmed',
          track:            (inv.questions_and_answers?.find(q => /service|track/i.test(q.question))?.answer) || null,
          notes:            (inv.questions_and_answers?.map(q => `${q.question}: ${q.answer}`).join('\n')) || null,
        }).select().single();
        if (data) {
          const db2 = getSupabase();
          if (db2) {
            supabaseWrite(db2.from('content_attribution_events').insert({
              event_type: 'booking',
              email:      inv.email,
              metadata:   { bookingId: data.id, source: 'calendly', startTime: evt.start_time },
            }), 'calendly attribution');
          }
          nexus.escalateToOwner({
            subject:  `Calendly booking — ${inv.name}`,
            body:     `${inv.name} (${inv.email}) booked a session for ${evt.start_time}`,
            severity: 'warning',
            context:  { bookingId: data.id },
          }).catch(() => {});
        }
      }
      json(res, { received: true });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ════════════════════════════════════════════════════════════════════════
  // NEWSLETTER
  // ════════════════════════════════════════════════════════════════════════

  // GET /api/newsletter/campaigns — list campaigns (for approval UI)
  if (req.method === 'GET' && path === '/api/newsletter/campaigns') {
    const db = getSupabase(); if (!db) { err(res, 'Supabase not configured', 503); return; }
    try {
      const status = url.searchParams.get('status');
      let q = db.from('newsletter_campaigns').select('*').order('created_at', { ascending: false }).limit(20);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      json(res, { campaigns: data || [] });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/newsletter/propose — Nexus generates topic proposals
  if (req.method === 'POST' && path === '/api/newsletter/propose') {
    try {
      const result = await nexus.proposeNewsletterTopics();
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/newsletter/approve/:id — approve a campaign → Aether curates
  if (req.method === 'POST' && path.startsWith('/api/newsletter/approve/')) {
    const id = path.split('/')[4];
    try {
      const result = await nexus.approveNewsletter(id);
      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/newsletter/reject/:id — reject a proposal
  if (req.method === 'POST' && path.startsWith('/api/newsletter/reject/')) {
    const id = path.split('/')[4];
    const db = getSupabase(); if (!db) { err(res, 'Supabase not configured', 503); return; }
    try {
      const { data, error } = await db.from('newsletter_campaigns').update({ status: 'rejected' }).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      json(res, { rejected: true, id });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/newsletter/send/:id — send a ready campaign to all subscribers
  if (req.method === 'POST' && path.startsWith('/api/newsletter/send/')) {
    const id = path.split('/')[4];
    const db = getSupabase(); if (!db) { err(res, 'Supabase not configured', 503); return; }
    try {
      const { data: campaign } = await db.from('newsletter_campaigns').select('*').eq('id', id).single();
      if (!campaign || campaign.status !== 'ready') { err(res, 'Campaign not ready', 400); return; }
      const { data: subs } = await db.from('newsletter_subscribers').select('email,name').eq('status', 'active');
      const { sendNewsletter } = await import('./skills/emailer.js');
      const result = await sendNewsletter({
        subject:     campaign.subject_line,
        html:        campaign.html_body,
        text:        campaign.plain_body,
        subscribers: subs || [],
      });
      await db.from('newsletter_campaigns').update({
        status:          'sent',
        sent_at:         new Date().toISOString(),
        recipient_count: result.sent,
        resend_batch_id: result.batchId,
      }).eq('id', id);
      json(res, { sent: result.sent, failed: result.failed });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/newsletter/subscribe — add a subscriber (from digifusion.com)
  if (req.method === 'POST' && path === '/api/newsletter/subscribe') {
    const db = getSupabase(); if (!db) { err(res, 'Supabase not configured', 503); return; }
    try {
      const body = await readBody(req);
      if (!body.email) { err(res, 'email required', 400); return; }
      const { data, error } = await db.from('newsletter_subscribers')
        .upsert({ email: body.email.toLowerCase().trim(), name: body.name || null, source: body.source || 'website', status: 'active' }, { onConflict: 'email' })
        .select().single();
      if (error) throw new Error(error.message);
      json(res, { subscribed: true, id: data.id });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/newsletter/unsubscribe — remove a subscriber
  if (req.method === 'POST' && path === '/api/newsletter/unsubscribe') {
    const db = getSupabase(); if (!db) { err(res, 'Supabase not configured', 503); return; }
    try {
      const body = await readBody(req);
      const email = (body.email || url.searchParams.get('email') || '').toLowerCase().trim();
      if (!email) { err(res, 'email required', 400); return; }
      await db.from('newsletter_subscribers').update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }).eq('email', email);
      json(res, { unsubscribed: true });
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
    // Public, unauthenticated, and every turn is a model call we pay for. The
    // limiter runs before readBody so a flood costs us a header write, not a
    // parsed payload. See http/rateLimit.js for what in-process does and does
    // not buy us.
    if (rateLimit('chat', req, res)) return;
    try {
      const body = await readBody(req);
      if (!body.message) { err(res, 'message required', 400); return; }
      json(res, await assistant.chat(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/assistant/lead
  if (req.method === 'POST' && path === '/api/agents/assistant/lead') {
    if (rateLimit('lead', req, res)) return;
    try {
      json(res, await assistant.saveLead(await readBody(req)));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/assistant/intake  — start or continue a structured intake conversation
  if (req.method === 'POST' && path === '/api/agents/assistant/intake') {
    if (rateLimit('intake', req, res)) return;
    try {
      const body = await readBody(req);
      if (!body.track) { err(res, 'track required (bd|automation|digital_media)', 400); return; }
      json(res, await assistant.startIntake(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/assistant/knowledge?q=... — on-demand knowledge query
  if (req.method === 'GET' && path === '/api/agents/assistant/knowledge') {
    try {
      const q = url.searchParams.get('q') || '';
      if (!q) { err(res, 'q parameter required', 400); return; }
      json(res, { knowledge: await assistant.queryKnowledge(q) });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/chat/search?q=&agent= — search persisted conversations
  if (req.method === 'GET' && path === '/api/agents/chat/search') {
    try {
      const q = url.searchParams.get('q') || '';
      const agentFilter = url.searchParams.get('agent') || null;
      const { searchChatMessages } = await import('./skills/agentChatStore.js');
      json(res, { results: await searchChatMessages(q, { agentId: agentFilter }) });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/:id/chat/history — load persisted thread
  const chatHistoryMatch = path.match(/^\/api\/agents\/([a-z]+)\/chat\/history$/);
  if (req.method === 'GET' && chatHistoryMatch) {
    try {
      const agentId = chatHistoryMatch[1];
      const { loadChatHistory } = await import('./skills/agentChatStore.js');
      const q = url.searchParams.get('q') || '';
      const allEpochs = url.searchParams.get('all') === '1';
      const limit = parseInt(url.searchParams.get('limit') || '80', 10);
      json(res, await loadChatHistory(agentId, { q, allEpochs, limit }));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/:id/chat/clear — start new thread epoch (history archived, not deleted)
  const chatClearMatch = path.match(/^\/api\/agents\/([a-z]+)\/chat\/clear$/);
  if (req.method === 'POST' && chatClearMatch) {
    try {
      const { clearChatThread } = await import('./skills/agentChatStore.js');
      json(res, await clearChatThread(chatClearMatch[1]));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // DELETE /api/agents/chat/messages/:id — soft-delete one message
  const chatMsgDeleteMatch = path.match(/^\/api\/agents\/chat\/messages\/([^/]+)$/);
  if (req.method === 'DELETE' && chatMsgDeleteMatch) {
    try {
      const { softDeleteMessage } = await import('./skills/agentChatStore.js');
      const ok = await softDeleteMessage(decodeURIComponent(chatMsgDeleteMatch[1]));
      json(res, { ok });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/chat/messages/:id/rate — thumbs / stars + optional feedback
  const chatMsgRateMatch = path.match(/^\/api\/agents\/chat\/messages\/([^/]+)\/rate$/);
  if (req.method === 'POST' && chatMsgRateMatch) {
    try {
      const body = await readBody(req);
      const { rateMessage, recordFeedbackMemory } = await import('./skills/agentChatStore.js');
      const row = await rateMessage(decodeURIComponent(chatMsgRateMatch[1]), body.rating, body.feedback || '');
      if (row) await recordFeedbackMemory(row.agent_id, row, body.rating, body.feedback || '');
      json(res, { ok: true, message: row });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/:id/chat  — team direct conversation with any agent
  //   body: { message, history?, replyTo?, parentId? }
  //   Persists to Supabase; history survives refresh
  if (req.method === 'POST' && path.match(/^\/api\/agents\/[a-z]+\/chat$/)) {
    const agentId = path.split('/')[3];
    const agent = AGENTS[agentId];
    if (!agent) { err(res, `Agent ${agentId} not found`, 404); return; }
    try {
      const body = await readBody(req);
      const {
        message,
        history: clientHistory = [],
        replyTo = null,
        parentId = null,
      } = body;
      if (!message?.trim()) { err(res, 'message is required', 400); return; }

      const {
        loadChatContext,
        appendChatMessage,
        resolveReplyContext,
      } = await import('./skills/agentChatStore.js');

      const parentRef = replyTo || parentId || null;
      const agentMessage = await resolveReplyContext(parentRef, message.trim());

      const dbHistory = clientHistory.length
        ? clientHistory
        : await loadChatContext(agentId, 16);

      const userRow = await appendChatMessage(agentId, 'user', message.trim(), {
        parentId: parentRef,
        metadata: parentRef ? { replyTo: parentRef } : {},
      });

      const chatTimeoutMs = Number(process.env.AGENT_CHAT_TIMEOUT_MS || 28000);
      const reply = await Promise.race([
        agent.chat(agentMessage, dbHistory),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out — server or AI provider is slow. On Render free tier, wake the service with /ping and retry.')), chatTimeoutMs),
        ),
      ]);

      const assistantRow = await appendChatMessage(agentId, 'assistant', reply, {
        parentId: userRow?.id || null,
      });

      json(res, {
        reply,
        agentId,
        userMessageId:      userRow?.id || null,
        assistantMessageId: assistantRow?.id || null,
        timestamp:          new Date().toISOString(),
      });
    } catch (e) {
      console.error(`[Chat/${path.split('/')[3]}]`, e.message);
      json(res, {
        reply:    `⚠ ${e.message}`,
        agentId:  path.split('/')[3],
        error:    true,
        timestamp: new Date().toISOString(),
      });
    }
    return;
  }

  // GET /api/agents/nexus/approval-status — fast approval snapshot (no LLM)
  if (req.method === 'GET' && path === '/api/agents/nexus/approval-status') {
    try {
      const { buildApprovalStatusReply } = await import('./skills/approvalStatus.js');
      json(res, { reply: await buildApprovalStatusReply(), timestamp: new Date().toISOString() });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/nexus/resolve-approval — Boss YES/NO from UI (bypasses WhatsApp webhook)
  //   body: { decision: 'approved'|'rejected', feedback?: string }
  if (req.method === 'POST' && path === '/api/agents/nexus/resolve-approval') {
    try {
      const body = await readBody(req);
      const decision = (body.decision || 'approved').toLowerCase();
      const publishTimeoutMs = Number(process.env.BLOG_PUBLISH_TIMEOUT_MS || 180000);
      const { forceResolvePendingApproval } = await import('./skills/approvalActions.js');
      const result = await Promise.race([
        forceResolvePendingApproval(
          decision === 'rejected' ? 'rejected' : 'approved',
          body.feedback || `Manual ${decision} via PathGuru UI`,
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Publish timed out — check logs; approval may still be processing.')), publishTimeoutMs),
        ),
      ]);
      if (!result.handled) { err(res, result.error || 'No pending approval', 404); return; }
      json(res, { reply: result.reply, approval: result.approval, timestamp: new Date().toISOString() });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── C2C Funnel: lead magnet → email → nurture → attribution ───────────────
  if (req.method === 'GET' && path === '/api/funnel/lead-magnets') {
    try {
      const { listLeadMagnets } = await import('./skills/leadMagnetFunnel.js');
      json(res, await listLeadMagnets());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'POST' && path === '/api/funnel/lead-magnet') {
    try {
      const body = await readBody(req);
      const { createLeadMagnet } = await import('./skills/leadMagnetFunnel.js');
      json(res, await createLeadMagnet(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'POST' && path === '/api/funnel/capture') {
    try {
      const body = await readBody(req);
      const { captureLeadMagnet } = await import('./skills/leadMagnetFunnel.js');
      json(res, await captureLeadMagnet(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path === '/api/funnel/attribution') {
    try {
      const range = url.searchParams.get('range') || '30d';
      const { getAttributionDashboard } = await import('./skills/attributionDashboard.js');
      json(res, await getAttributionDashboard(range));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path === '/api/cron/nurture') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      const { processNurtureQueue } = await import('./skills/leadMagnetFunnel.js');
      json(res, await processNurtureQueue());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GEM Lattice / Synthesizer crystallization ───────────────────────────
  if (req.method === 'POST' && path === '/api/agents/synthesizer/crystallize') {
    try {
      const body = await readBody(req);
      json(res, await synthesizer.crystallize(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path === '/api/agents/synthesizer/gems') {
    try {
      const q = url.searchParams.get('q') || '';
      const domain = url.searchParams.get('domain') || 'general';
      json(res, { gems: await synthesizer.mineGems(q, [domain]) });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path === '/api/agents/synthesizer/crystallizations') {
    try {
      const db = getSupabase();
      if (!db) { json(res, { items: [] }); return; }
      const { data } = await db.from('gem_crystallizations').select('*').order('created_at', { ascending: false }).limit(20);
      json(res, { items: data || [] });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── Engagement Delivery OS ──────────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/engagements') {
    try {
      const status = url.searchParams.get('status') || undefined;
      const { listEngagements } = await import('./skills/engagementDelivery.js');
      json(res, await listEngagements({ status }));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path.startsWith('/api/engagements/') && path.split('/').length === 4) {
    try {
      const id = path.split('/')[3];
      const { getEngagementDetail } = await import('./skills/engagementDelivery.js');
      json(res, await getEngagementDetail(id));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'POST' && path.match(/^\/api\/engagements\/[^/]+\/milestones\/[^/]+\/signoff$/)) {
    try {
      const parts = path.split('/');
      const milestoneId = parts[5];
      const body = await readBody(req);
      const { signOffMilestone } = await import('./skills/engagementDelivery.js');
      json(res, await signOffMilestone(milestoneId, body.signedOffBy || 'Boss'));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'PATCH' && path.match(/^\/api\/engagements\/deliverables\/[^/]+$/)) {
    try {
      const id = path.split('/')[4];
      const body = await readBody(req);
      const { updateDeliverable } = await import('./skills/engagementDelivery.js');
      json(res, await updateDeliverable(id, body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── Partner economics ─────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/ops/economics') {
    try {
      const { getEconomicsDashboard } = await import('./skills/partnerEconomics.js');
      json(res, await getEconomicsDashboard());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'PATCH' && path.match(/^\/api\/engagements\/[^/]+\/economics$/)) {
    try {
      const engagementId = path.split('/')[3];
      const body = await readBody(req);
      const { updateEngagementEconomics } = await import('./skills/partnerEconomics.js');
      json(res, await updateEngagementEconomics(engagementId, body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── Client 360 ────────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/clients') {
    try {
      const { listClientAccounts } = await import('./skills/client360.js');
      json(res, await listClientAccounts());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path.startsWith('/api/clients/') && path.split('/').length === 4) {
    try {
      const id = path.split('/')[3];
      const { getClient360 } = await import('./skills/client360.js');
      json(res, await getClient360(id));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── Utilization ───────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/ops/utilization') {
    try {
      const { computeCurrentUtilization } = await import('./skills/utilization.js');
      json(res, await computeCurrentUtilization());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── NPS ───────────────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/ops/nps') {
    try {
      const { getNpsDashboard } = await import('./skills/npsSurvey.js');
      json(res, await getNpsDashboard());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path === '/api/nps/respond') {
    try {
      const id = url.searchParams.get('id');
      const score = url.searchParams.get('score');
      const comment = url.searchParams.get('comment') || '';
      if (!id || score == null) { err(res, 'id and score required', 400); return; }
      const { recordNpsResponse } = await import('./skills/npsSurvey.js');
      await recordNpsResponse(id, score, comment);
      res.writeHead(302, { Location: 'https://www.digitafusion.com/?nps=thanks' });
      res.end();
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── ERP / invoices ────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/invoices') {
    try {
      const body = await readBody(req);
      const { createInvoice } = await import('./skills/erpHooks.js');
      json(res, await createInvoice(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'POST' && path === '/api/webhooks/erp') {
    try {
      const body = await readBody(req);
      const { handleErpWebhook } = await import('./skills/erpHooks.js');
      json(res, await handleErpWebhook(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path === '/api/cron/engagement-drift') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      const { checkEngagementDrift } = await import('./skills/engagementDelivery.js');
      const drift = await checkEngagementDrift();
      if (drift.overdue?.length) {
        const { sendImmediate } = await import('./skills/notifier.js');
        await sendImmediate('Engagement drift', drift.overdue.map(o => `${o.client}: ${o.milestone}`).join('\n'), 'whatsapp');
      }
      json(res, drift);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path === '/api/cron/ops-snapshot') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      const { snapshotUtilization } = await import('./skills/utilization.js');
      const { checkOverdueInvoices } = await import('./skills/erpHooks.js');
      const { processDueNpsSurveys } = await import('./skills/npsSurvey.js');
      json(res, {
        utilization: await snapshotUtilization(),
        invoices: await checkOverdueInvoices(),
        nps: await processDueNpsSurveys(),
      });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/nexus/lifecycle  — sync a client milestone
  //   body: { milestone, leadId, clientName, track, agentId, data }
  if (req.method === 'POST' && path === '/api/agents/nexus/lifecycle') {
    try {
      const body = await readBody(req);
      const { milestone, ...payload } = body;
      if (!milestone) { err(res, 'milestone is required', 400); return; }
      json(res, await AGENTS.nexus.syncClientLifecycle(milestone, payload));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/nexus/daily-briefing  — generate morning briefing
  if (req.method === 'POST' && path === '/api/agents/nexus/daily-briefing') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      json(res, await AGENTS.nexus.generateDailyBriefing());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/nexus/task-hygiene — cancel stale tasks, dedupe research, reconcile ghosts
  if (req.method === 'POST' && path === '/api/agents/nexus/task-hygiene') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      const { runTaskHygiene } = await import('./skills/taskHygiene.js');
      const dryRun = url.searchParams.get('dryRun') === '1';
      json(res, await runTaskHygiene({ dryRun }));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/cron/morning-briefing — external cron (cron-job.org, GitHub Actions)
  if (req.method === 'GET' && path === '/api/cron/morning-briefing') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      const briefing = await AGENTS.nexus.generateDailyBriefing();
      const { sendImmediate } = await import('./skills/notifier.js');
      await sendImmediate('DigiFusion Daily Briefing', briefing?.summary || 'Daily briefing ready.', 'whatsapp');
      json(res, briefing);
    } catch (e) {
      console.error('[Cron] morning-briefing failed:', e.message);
      err(res, e.message, 500);
    }
    return;
  }

  // GET /api/cron/evening-briefing
  if (req.method === 'GET' && path === '/api/cron/evening-briefing') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      const briefing = await AGENTS.nexus.generateEveningBriefing();
      const { sendImmediate } = await import('./skills/notifier.js');
      await sendImmediate('DigiFusion Evening Briefing', briefing?.summary || 'Evening briefing ready.', 'whatsapp');
      json(res, briefing);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/cron/content-cadence — blog cadence check (every 12h recommended)
  if (req.method === 'GET' && path === '/api/cron/content-cadence') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      json(res, await AGENTS.nexus.runContentCadenceCheck());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/cron/process-scheduled-content — due calendar items → approval gate
  if (req.method === 'GET' && path === '/api/cron/process-scheduled-content') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      json(res, await AGENTS.nexus.processDueScheduledContent());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/cron/process-orchestration — due campaign steps → agent delegation
  if (req.method === 'GET' && path === '/api/cron/process-orchestration') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      json(res, await AGENTS.nexus.processOrchestrationCampaigns());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/nexus/campaigns — list orchestration campaigns + steps
  if (req.method === 'GET' && path === '/api/agents/nexus/campaigns') {
    try {
      const limit = parseInt(url.searchParams.get('limit') || '10', 10);
      json(res, await AGENTS.nexus.listCampaigns({ limit }));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/cron/engagement-retune — weekly client blueprint adjustments
  if (req.method === 'GET' && path === '/api/cron/engagement-retune') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      json(res, await AGENTS.nexus.retuneEngagements());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── IP Factory ───────────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/ip-factory/synthesize') {
    try {
      const body = await readBody(req);
      const { runIpFactory } = await import('./skills/ipFactory.js');
      json(res, await runIpFactory(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path === '/api/ip-factory/catalog') {
    try {
      const { getIpFactoryCatalog } = await import('./skills/ipFactory.js');
      json(res, await getIpFactoryCatalog());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'POST' && path === '/api/ip-factory/promote') {
    try {
      const body = await readBody(req);
      const { promoteFrameworkToDna } = await import('./skills/ipFactory.js');
      if (!body.slug || !body.title) { err(res, 'slug and title required', 400); return; }
      json(res, await promoteFrameworkToDna(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── Client Blueprint ─────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/client-blueprint') {
    try {
      const body = await readBody(req);
      json(res, await AGENTS.nexus.createClientBlueprint(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path === '/api/client-blueprint') {
    try {
      json(res, await AGENTS.nexus.listClientBlueprints());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'GET' && path.startsWith('/api/client-blueprint/')) {
    try {
      const id = path.slice('/api/client-blueprint/'.length);
      const bp = await AGENTS.nexus.getClientBlueprint(id);
      if (!bp) { err(res, 'Blueprint not found', 404); return; }
      json(res, bp);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── C2C Growth Engine ────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/c2c/pillar-plan') {
    try {
      const body = await readBody(req);
      json(res, await AGENTS.nexus.planC2cGrowth(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  if (req.method === 'POST' && path === '/api/c2c/playbook-teasers') {
    try {
      const body = await readBody(req);
      if (!body.playbookSlug) { err(res, 'playbookSlug required', 400); return; }
      json(res, { teasers: await AGENTS.nexus.derivePlaybookBlogTeasers(body.playbookSlug, body.count || 3) });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/nexus/pipeline  — client pipeline view
  if (req.method === 'GET' && path === '/api/agents/nexus/pipeline') {
    try {
      json(res, await AGENTS.nexus.getPipelineView());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/nexus/ceo-ops — Digital CEO dashboard (cadence, approvals, queue)
  if (req.method === 'GET' && path === '/api/agents/nexus/ceo-ops') {
    try {
      json(res, await AGENTS.nexus.getCeoOpsStatus());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET/PUT /api/settings/content-authors — domain → author routing
  if (path === '/api/settings/content-authors') {
    try {
      const { loadContentAuthorSettings, saveContentAuthorSettings, listAuthorProfiles } =
        await import('./skills/contentAuthorSettings.js');
      if (req.method === 'GET') {
        const settings = await loadContentAuthorSettings();
        json(res, { settings, profiles: listAuthorProfiles() });
        return;
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        const body = await readBody(req);
        const settings = await saveContentAuthorSettings(body);
        json(res, { settings, profiles: listAuthorProfiles() });
        return;
      }
      err(res, 'Method not allowed', 405);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/nexus/evening-briefing
  if (req.method === 'POST' && path === '/api/agents/nexus/evening-briefing') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      json(res, await AGENTS.nexus.generateEveningBriefing());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/nexus/design-workflow  body: { processDescription, clientName?, industry? }
  if (req.method === 'POST' && path === '/api/agents/nexus/design-workflow') {
    try {
      const body = await readBody(req);
      if (!body.processDescription) { err(res, 'processDescription required', 400); return; }
      json(res, await AGENTS.nexus.designWorkflow(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/nexus/content-cadence-check — trigger cadence pipeline if due
  if (req.method === 'POST' && path === '/api/agents/nexus/content-cadence-check') {
    if (!verifyCronAuth(req, url)) { cronAuthFail(res, err); return; }
    try {
      json(res, await AGENTS.nexus.runContentCadenceCheck());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/nexus/research  — dispatch Researcher for a topic
  //   body: { topic, forAgent?, context?, focusAreas?, depth? }
  if (req.method === 'POST' && path === '/api/agents/nexus/research') {
    try {
      const body = await readBody(req);
      if (!body.topic) { err(res, 'topic is required', 400); return; }
      json(res, await AGENTS.nexus.dispatchResearch(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/notion/workspace — leads + client projects from Notion DBs
  if (req.method === 'GET' && path === '/api/agents/notion/workspace') {
    try {
      const { notion } = await import('./notionClient.js');
      json(res, await notion.listWorkspaceRecords());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/nexus/sync-notion — push CEO dashboard to Notion
  if (req.method === 'POST' && path === '/api/agents/nexus/sync-notion') {
    try {
      json(res, await AGENTS.nexus.syncCeoNotionDashboard('manual'));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/notion/ping — test Notion connection and log a test task entry
  if (req.method === 'GET' && path === '/api/agents/notion/ping') {
    try {
      const { notion } = await import('./notionClient.js');
      const pingResult = await notion.ping();
      // Also log a test task entry so you can see it appear in the Tasks DB
      await notion.logTask({
        agentId:   'nexus',
        agentName: 'Nexus',
        taskTitle: 'Notion connection test — PathGuru ping',
        taskType:  'system',
        outcome:   'success',
        notes:     `Notion integration verified at ${new Date().toISOString()}`,
      });
      json(res, {
        connected: true,
        workspace: pingResult?.name || pingResult?.workspace_name || 'Connected',
        message:   'Notion is connected. Check your Tasks database — a test entry was just logged.',
      });
    } catch (e) {
      json(res, { connected: false, error: e.message });
    }
    return;
  }

  // POST /api/agents/nexus/escalate  — manually escalate to Ola
  //   body: { subject, body, severity?, context? }
  if (req.method === 'POST' && path === '/api/agents/nexus/escalate') {
    try {
      const body = await readBody(req);
      if (!body.subject) { err(res, 'subject is required', 400); return; }
      json(res, await AGENTS.nexus.escalateToOwner(body));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/nexus/fill-gaps  — detect and fill knowledge gaps in pending tasks
  if (req.method === 'POST' && path === '/api/agents/nexus/fill-gaps') {
    try {
      json(res, await AGENTS.nexus.detectAndFillGaps());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/nexus/check-escalations  — run escalation trigger check
  if (req.method === 'GET' && path === '/api/agents/nexus/check-escalations') {
    try {
      json(res, { escalations: await AGENTS.nexus.checkEscalationTriggers() });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/agents/research/deliverables — list Orion research deliverables
  if (req.method === 'GET' && path === '/api/agents/research/deliverables') {
    try {
      const limit  = parseInt(url.searchParams.get('limit')  || '30', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0',  10);
      const { listResearchDeliverables } = await import('./lib/researchDeliverables.js');
      json(res, await listResearchDeliverables({ limit, offset }));
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  const deliverableMatch = path.match(/^\/api\/agents\/research\/deliverables\/([\w-]+)$/);
  if (req.method === 'GET' && deliverableMatch) {
    try {
      const { getResearchDeliverable } = await import('./lib/researchDeliverables.js');
      const item = await getResearchDeliverable(deliverableMatch[1]);
      if (!item) { err(res, 'Deliverable not found', 404); return; }
      json(res, item);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/researcher/research  — direct Researcher call
  //   body: { topic, forAgent?, context?, focusAreas?, depth?, mergeWithKB? }
  if (req.method === 'POST' && path === '/api/agents/researcher/research') {
    try {
      const body = await readBody(req);
      if (!body.topic) { err(res, 'topic is required', 400); return; }

      const db = getSupabase();
      let taskId = null;
      if (db && body.persist !== false) {
        const { data: taskRow } = await db.from('tasks').insert({
          title:       `[Orion] ${body.topic.slice(0, 80)}`,
          description: body.topic,
          agent_id:    'researcher',
          created_by:  'team',
          status:      'in_progress',
          priority:    3,
          type:        'research',
        }).select('id').single();
        taskId = taskRow?.id || null;
      }

      const result = await AGENTS.researcher.research(body);

      if (taskId) {
        const { scoreResearchBrief } = await import('./skills/researchQualityGate.js');
        const qScore = scoreResearchBrief(result);
        const { completeResearchDeliverable } = await import('./lib/researchDeliverables.js');
        await completeResearchDeliverable({
          taskId,
          instruction: body.topic,
          brief:       result.brief,
          sources:     result.sources,
          gaps:        result.gaps,
          qualityScore: qScore,
          depth:       result.depth || body.depth || 'standard',
          forAgent:    body.forAgent || 'nexus',
          mergedWithKB: result.mergedWithKB,
        });
      }

      json(res, { ...result, taskId });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/agents/:id/evaluation  — trigger or process a post-service evaluation
  //   body: { action: 'trigger'|'process', clientName, clientEmail, leadId, responses, nps, ... }
  if (req.method === 'POST' && path.match(/^\/api\/agents\/(atlas|nova|aether)\/evaluation$/)) {
    const agentId = path.split('/')[3];
    const agent = AGENTS[agentId];
    if (!agent) { err(res, `Agent ${agentId} not found`, 404); return; }
    try {
      const body = await readBody(req);
      const action = body.action === 'process' ? 'process_evaluation' : 'trigger_evaluation';
      json(res, await agent.execute({ ...body, action }));
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


  // ══════════════════════════════════════════════════════════════════
  // FIRM IP & BLUEPRINT ROUTES
  // GET  /api/blueprints              — list all purchasable blueprints
  // GET  /api/blueprints/:slug        — get single blueprint metadata
  // POST /api/blueprints/:slug/purchase — record a purchase
  // GET  /api/blueprints/:slug/download — gated download (requires purchase)
  // GET  /api/products                — alias for blueprints list
  // ══════════════════════════════════════════════════════════════════

  // GET /api/blueprints — public catalogue (metadata only, no bytes)
  if (req.method === 'GET' && path === '/api/blueprints') {
    try {
      const docs = await listFirmIpDocuments({ access: 'purchasable' });
      // Enrich with Supabase product pricing if available
      const db = getSupabase();
      let products = [];
      if (db) {
        const { data } = await db.from('products').select('*').eq('active', true);
        products = data || [];
      }
      const enriched = docs.map(d => {
        const prod = products.find(p => p.firm_ip_slug === d.slug);
        return { ...d, priceUsd: prod?.price_usd ?? d.priceUsd, priceNgn: prod?.price_ngn, productId: prod?.id };
      });
      json(res, { blueprints: enriched, total: enriched.length });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/blueprints/:slug — single blueprint metadata
  if (req.method === 'GET' && path.match(/^\/api\/blueprints\/[^/]+$/) && !path.endsWith('/download') && !path.endsWith('/purchase')) {
    const slug = path.split('/').pop();
    try {
      const meta = await getFirmIpMeta(slug);
      if (!meta) { err(res, `Blueprint not found: ${slug}`, 404); return; }
      json(res, { blueprint: meta });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/blueprints/:slug/purchase — record a purchase (manual/webhook)
  if (req.method === 'POST' && path.match(/^\/api\/blueprints\/[^/]+\/purchase$/)) {
    const slug = path.split('/')[3];
    const body = await readBody(req);
    const { buyerEmail, buyerName, paymentRef, paymentMethod = 'manual', amountPaid, currency = 'USD' } = body;
    if (!buyerEmail) { err(res, 'buyerEmail is required', 400); return; }
    const db = getSupabase();
    if (!db) { err(res, 'Database not configured', 503); return; }
    try {
      // Look up product
      const { data: product } = await db.from('products').select('id').eq('firm_ip_slug', slug).single();
      if (!product) { err(res, `Product not found for slug: ${slug}`, 404); return; }
      const { data: purchase, error: pe } = await db.from('purchases').insert({
        product_id: product.id, buyer_email: buyerEmail, buyer_name: buyerName,
        amount_paid: amountPaid, currency, payment_ref: paymentRef,
        payment_method: paymentMethod, status: paymentMethod === 'manual' ? 'completed' : 'pending',
        expires_at: null,
      }).select().single();
      if (pe) throw new Error(pe.message);
      json(res, { purchase, message: 'Purchase recorded. Use /api/blueprints/:slug/download with your email to download.' });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/blueprints/:slug/download?email=buyer@email.com — gated download
  if (req.method === 'GET' && path.match(/^\/api\/blueprints\/[^/]+\/download$/)) {
    const slug = path.split('/')[3];
    const buyerEmail = url.searchParams.get('email');
    if (!buyerEmail) { err(res, 'email query parameter required', 400); return; }
    const db = getSupabase();
    if (!db) { err(res, 'Database not configured', 503); return; }
    try {
      // Verify purchase
      const { data: product } = await db.from('products').select('id, title').eq('firm_ip_slug', slug).single();
      if (!product) { err(res, 'Product not found', 404); return; }
      const { data: purchase } = await db.from('purchases')
        .select('*').eq('product_id', product.id).eq('buyer_email', buyerEmail)
        .eq('status', 'completed').order('created_at', { ascending: false }).limit(1).single();
      if (!purchase) {
        err(res, 'No valid purchase found for this email. Purchase the blueprint at digifusion.ng/intelligence', 403);
        return;
      }
      if (purchase.expires_at && new Date(purchase.expires_at) < new Date()) {
        err(res, 'Your download link has expired. Please contact support@digifusion.ng', 403); return;
      }
      if (purchase.download_count >= purchase.max_downloads) {
        err(res, 'Maximum download limit reached. Contact support@digifusion.ng for assistance.', 403); return;
      }
      // Try to get a pre-signed URL, fall back to server proxy
      let downloadUrl = await getFirmIpDownloadUrl(slug, 3600);
      if (downloadUrl) {
        // Increment download count
        await db.from('purchases').update({ download_count: purchase.download_count + 1, updated_at: new Date().toISOString() }).eq('id', purchase.id);
        await db.from('download_log').insert({ purchase_id: purchase.id, product_id: product.id, buyer_email: buyerEmail, ip_address: req.socket?.remoteAddress });
        res.writeHead(302, { Location: downloadUrl });
        res.end();
      } else {
        // Proxy the PDF bytes directly
        const result = await getFirmIpDocumentBytes(slug);
        if (!result) { err(res, 'Document not available', 404); return; }
        await db.from('purchases').update({ download_count: purchase.download_count + 1, updated_at: new Date().toISOString() }).eq('id', purchase.id);
        await db.from('download_log').insert({ purchase_id: purchase.id, product_id: product.id, buyer_email: buyerEmail, ip_address: req.socket?.remoteAddress });
        const safeName = result.entry.title?.replace(/[^a-z0-9 ]/gi, '_').replace(/\s+/g, '_') || slug;
        res.writeHead(200, {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
          'Content-Length':      result.bytes.length,
          'Cache-Control':       'no-store',
        });
        res.end(result.bytes);
      }
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/products — alias for blueprints catalogue (used by DigiFusion webapp)
  if (req.method === 'GET' && path === '/api/products') {
    try {
      const db = getSupabase();
      if (!db) { json(res, { products: [] }); return; }
      const { data, error: pe } = await db.from('products').select('*').eq('active', true).order('price_usd');
      if (pe) throw new Error(pe.message);
      json(res, { products: data || [] });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/purchases?email=x — check purchase history for an email
  if (req.method === 'GET' && path === '/api/purchases') {
    const email = url.searchParams.get('email');
    if (!email) { err(res, 'email query parameter required', 400); return; }
    const db = getSupabase();
    if (!db) { err(res, 'Database not configured', 503); return; }
    try {
      const { data, error: pe } = await db.from('purchases').select('*, products(title, industry, category)')
        .eq('buyer_email', email).eq('status', 'completed').order('created_at', { ascending: false });
      if (pe) throw new Error(pe.message);
      json(res, { purchases: data || [] });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ══════════════════════════════════════════════════════════════════
  // CONTENT WORKFLOW ROUTES — Nexus-orchestrated content production
  // POST /api/content/brief         — create a content brief (Nexus assigns Researcher + Aether)
  // POST /api/content/publish       — Aether writes + publishes a blog post from a brief
  // GET  /api/content/calendar      — upcoming scheduled content
  // ══════════════════════════════════════════════════════════════════

  // POST /api/content/brief — generate a research-backed content brief
  if (req.method === 'POST' && path === '/api/content/brief') {
    const body = await readBody(req);
    const {
      topic, sector, angle, targetAudience = 'business leaders',
      contentType = 'article', depth = 'standard', publish = false,
    } = body;
    if (!topic) { err(res, 'topic is required', 400); return; }
    try {
      // Step 1: Researcher gathers intelligence
      console.log(`[Content] Researching: ${topic}`);
      const researchResult = await AGENTS.researcher.research({
        topic, forAgent: 'aether', focusAreas: sector ? [sector] : [],
        depth, mergeWithKB: true,
      });

      // Step 2: Aether builds the content brief
      const briefPrompt = `You are DigiFusion's senior content strategist. Based on the research brief below, create a detailed content outline for a ${contentType} targeting ${targetAudience}.

TOPIC: ${topic}
${sector ? `SECTOR: ${sector}` : ''}
${angle ? `ANGLE / HOOK: ${angle}` : ''}

RESEARCH BRIEF:
${researchResult.brief || JSON.stringify(researchResult).slice(0, 3000)}

Produce a structured content brief with:
1. A punchy, SEO-optimised headline (and 2 alternatives)
2. Target keyword and 5 secondary keywords
3. Article structure: intro hook, 4–6 main sections with sub-points, strong CTA
4. Key statistics or data points to include
5. DigiFusion angle: how our proprietary IP frameworks are relevant (AVE, Deal Engine, C2C, Engagement Model, SME Scale, Enterprise Velocity, GovTech, FIRA)
6. Recommended word count and content type

Keep it sharp and actionable. This is a DigiFusion content asset.`;

      const brief = await AGENTS.aether.chat(briefPrompt);

      const result = {
        topic, sector, contentType, targetAudience,
        brief, researchSources: researchResult.sources || [],
        generatedAt: new Date().toISOString(),
      };

      // Step 3: Auto-publish if requested
      if (publish) {
        console.log(`[Content] Auto-publishing: ${topic}`);
        const publishResult = await AGENTS.aether.execute({
          action: 'write_blog_post',
          topic, sector, brief, researchBrief: researchResult.brief,
        });
        result.published = publishResult;
      }

      json(res, result);
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/content/publish — Aether writes and publishes a full blog post
  if (req.method === 'POST' && path === '/api/content/publish') {
    const body = await readBody(req);
    const { topic, sector, brief, researchBrief, aiProvider, tags, category } = body;
    if (!topic) { err(res, 'topic is required', 400); return; }
    try {
      // Build the full article prompt for Aether
      const writePrompt = `You are DigiFusion's senior content strategist. Write a complete, publication-ready ${sector || 'business'} article for DigiFusion's blog.

TOPIC: ${topic}
${sector ? `SECTOR FOCUS: ${sector}` : ''}
${brief ? `CONTENT BRIEF:\n${brief}` : ''}
${researchBrief ? `RESEARCH INSIGHTS:\n${researchBrief}` : ''}

REQUIREMENTS:
- Length: 1,200–1,800 words
- Tone: Authoritative, insightful, practitioner-grade — not generic or fluffy
- Structure: Strong opening hook, clear section headers (H2/H3), data-backed claims, concrete takeaways
- DigiFusion perspective: naturally weave in our firm's viewpoint on what businesses in this sector need to do — without revealing internal methodology steps
- Close with a clear CTA pointing to DigiFusion's strategy session or intelligence reports
- SEO optimised: include keywords naturally throughout
- Format: Markdown with proper heading hierarchy

Write the full article now.`;

      const articleContent = await AGENTS.aether.chat(writePrompt);

      // Extract a title from the content
      const titleMatch = articleContent.match(/^#\s+(.+)$/m);
      const title = titleMatch?.[1] || topic;

      // Publish via blog publisher
      const { generateAndPublishBlogPost: publish } = await import('./blogPublisher.js');
      const publishResult = await publish({
        title,
        content: articleContent,
        sector: sector || 'business',
        tags:   tags || [sector, 'digifusion', 'strategy'].filter(Boolean),
        category: category || sector || 'business-intelligence',
        aiProvider: aiProvider || null,
        authorName: null,
        status: 'published',
      });

      json(res, {
        success: true,
        title,
        topic,
        post: publishResult,
        wordCount: articleContent.split(/\s+/).length,
        publishedAt: new Date().toISOString(),
      });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // POST /api/content/schedule — queue up to 5 articles for Nexus to publish over coming days
  if (req.method === 'POST' && path === '/api/content/schedule') {
    const body = await readBody(req);
    const { articles } = body; // [{ topic, sector, angle }]
    if (!Array.isArray(articles) || articles.length === 0) {
      err(res, 'articles array is required', 400); return;
    }
    try {
      const queued = articles.slice(0, 5).map((a, i) => ({
        ...a,
        scheduledFor: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString(),
        status: 'queued',
      }));
      // Store schedule in R2 cache for Nexus to pick up
      const existing = (await getJsonCache('cache/content-schedule.json')) || [];
      await putJsonCache('cache/content-schedule.json', [...queued, ...existing].slice(0, 20));
      json(res, { scheduled: queued, message: `${queued.length} articles queued. Nexus will publish them on schedule.` });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // GET /api/content/calendar — view the content schedule
  if (req.method === 'GET' && path === '/api/content/calendar') {
    try {
      let schedule = [];
      try {
        schedule = (await getJsonCache('cache/content-schedule.json')) || [];
      } catch (cacheErr) {
        console.warn('[content/calendar] cache miss:', cacheErr.message);
        schedule = [];
      }
      if (!Array.isArray(schedule)) schedule = [];
      json(res, { calendar: schedule, total: schedule.length });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/frameworks — the canonical IP registry ──────────────────────
  //
  // PathGuru owns this list. digitafusion.com consumes it rather than keeping a
  // second hand-maintained copy, because two lists drift and the drift shows up
  // in a client deck. The projection strips r2Key and kbSlug — internal storage
  // paths have no business leaving this process even behind a gate.
  if (req.method === 'GET' && path === '/api/frameworks') {
    try {
      const { publicFrameworkRegistry } = await import('./skills/firmFrameworks.js');
      json(res, publicFrameworkRegistry());
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  /* ══════════════════════════════════════════════════════════════════════
     FrictionIQ operator console
     ══════════════════════════════════════════════════════════════════════

     Gated by the operator check at the top of this handler — these rows are
     prospect names, emails, organisations and countries, and until August 2026
     they were served to anyone who asked.

     Two honesty rules are enforced here rather than in the UI, because a UI
     that has to remember to be honest eventually forgets:

       COUNTS ARE COUNTS, NOT PAGE LENGTHS. The old version returned
       `total: sessions.length` after a .limit(200), so "Total" quietly meant
       "total of the most recent 200". Every headline number below comes from a
       separate count query against the whole table.

       THE SCALE TRAVELS WITH THE SCORE. The screening instrument scores out of
       24 and the deep instrument out of 120. Sending `total` without `max`
       forced the client to hardcode /24, which mislabels every deep assessment.
  ── */

  // ── GET /api/frictioniq/sessions ──────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/frictioniq/sessions') {
    try {
      const db = getSupabase(); if (!db) { err(res, 'Supabase not configured', 503); return; }

      const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500);

      /* Every name here is a real column. `max` was not — it was invented, and
         PostgREST rejects the whole select when one name is wrong, which takes
         the register down rather than degrading it. The scale is DERIVED below
         from depth_ceiling, which migration 0011 added for exactly this reason:
         "report it beside the score or a partial assessment reads as a poor one." */
      const { data: rows, error: dbErr } = await db
        .from('frictioniq_session')
        .select('token,created_at,total,depth,depth_ceiling,full_total,full_band,full_capped,band,capped,sector,role,headcount_band,country,email,stage,organization,replied_at,lead_score,priority')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (dbErr) { err(res, dbErr.message, 500); return; }

      /* Which score to show, and out of what.
         A respondent who went deep has TWO scores on the row — the screening
         total out of 24 and the full total out of depth_ceiling. Showing the
         screening one for a deep assessment understates them by a factor of
         five; showing the full one without its ceiling makes a partial
         assessment read as a poor one. So both travel together, always. */
      const deep = r => r.depth && r.depth !== 'short' && r.full_total !== null && r.full_total !== undefined;

      const sessions = (rows ?? []).map(r => ({
        token: r.token,
        created_at: r.created_at,
        total: deep(r) ? r.full_total : r.total,
        // 24 is the screening instrument's scale. For a deep assessment the
        // ceiling is whatever depth they actually reached — null rather than a
        // guess if the column was never populated.
        max: deep(r) ? (r.depth_ceiling ?? null) : 24,
        depth: r.depth || 'short',
        band: deep(r) ? (r.full_band ?? r.band) : r.band,
        capped: (deep(r) ? r.full_capped : r.capped) === true,
        sector: r.sector,
        role: r.role,
        headcount_band: r.headcount_band,
        country: r.country,
        email: r.email,
        stage: r.stage || 'captured',
        organization: r.organization,
        replied: Boolean(r.replied_at),
        lead_score: r.lead_score,
        priority: r.priority,
      }));

      /* Real counts, against the whole register rather than this page. Four
         head-only queries cost nothing and are the difference between a
         dashboard and a decoration. */
      const now = new Date();
      const weekAgo  = new Date(now.getTime() - 7 * 86400000).toISOString();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      /* ── The counts, on a leash ──────────────────────────────────────────
       *
       * These four are the honest headline numbers — real counts against the
       * whole table rather than the length of one page. But they are also four
       * extra round trips on a route that previously made one, and on a slow
       * link that turns a working register into a spinner. The rows are the
       * point of this screen; the counts are decoration on top of them.
       *
       * So they get a deadline. Miss it and stats comes back null, the rows
       * still render, and the console says the counts are unavailable — rather
       * than showing zeroes, which would be a lie of exactly the kind this
       * product exists to expose in other people's dashboards. */
      const COUNT_DEADLINE_MS = Number(process.env.FRICTIONIQ_COUNT_TIMEOUT_MS) || 4000;

      const countOf = async (build) => {
        const { count } = await build(
          db.from('frictioniq_session').select('token', { count: 'exact', head: true })
        );
        return count ?? 0;
      };

      let stats = null;
      try {
        stats = await Promise.race([
          Promise.all([
            countOf(q => q),
            countOf(q => q.gte('created_at', weekAgo)),
            countOf(q => q.gte('created_at', dayStart)),
            countOf(q => q.not('email', 'is', null)),
          ]).then(([total, thisWeek, today, withEmail]) => ({
            total, this_week: thisWeek, today, with_email: withEmail,
          })),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('count timeout')), COUNT_DEADLINE_MS)
          ),
        ]);
      } catch (e) {
        console.warn('[frictioniq] counts unavailable:', e.message);
        stats = null;
      }

      // Band distribution over the returned page. Labelled as such in the UI —
      // it is a sample, and calling a sample a benchmark is the exact failure
      // this product exists to expose in other people's operations.
      const bandDist = {};
      for (const s of sessions) {
        const band = s.band || 'Unknown';
        bandDist[band] = (bandDist[band] ?? 0) + 1;
      }

      json(res, {
        sessions,
        stats,
        band_distribution: bandDist,
        page: { returned: sessions.length, limit, truncated: sessions.length >= limit },
      });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── GET /api/frictioniq/session?token= — one prospect, with touch history ──
  if (req.method === 'GET' && path === '/api/frictioniq/session') {
    try {
      const db = getSupabase(); if (!db) { err(res, 'Supabase not configured', 503); return; }
      const token = (url.searchParams.get('token') || '').trim();
      if (!token) { err(res, 'token required', 400); return; }

      const { data: session, error: sErr } = await db
        .from('frictioniq_session').select('*').eq('token', token).maybeSingle();
      if (sErr) { err(res, sErr.message, 500); return; }
      if (!session) { err(res, 'unknown session', 404); return; }

      // The outbox, if migration 0010 has been applied. A register that has not
      // been migrated should still show the prospect rather than erroring.
      let touches = [];
      try {
        const { data } = await db
          .from('frictioniq_touch')
          .select('kind,step,scheduled_for,sent_at,cancelled_at,cancel_reason,attempts,last_error,subject,channel,delivered_on,wa_status')
          .eq('token', token)
          .order('scheduled_for', { ascending: true });
        touches = data ?? [];
      } catch { touches = []; }

      json(res, { session, touches });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  // ── POST /api/frictioniq/session — operator updates stage / replied ───────
  if (req.method === 'POST' && path === '/api/frictioniq/session') {
    try {
      const db = getSupabase(); if (!db) { err(res, 'Supabase not configured', 503); return; }
      const body  = await readBody(req);
      const token = String(body.token || '').trim();
      if (!token) { err(res, 'token required', 400); return; }

      /* An allowlist, not a passthrough. This route can write to a table
         holding personal data, and "update whatever the client sent" is how a
         console becomes an injection surface. */
      const STAGES = new Set(['captured', 'working', 'conversation', 'proposal', 'engaged', 'declined', 'dormant']);
      const patch = {};

      if (body.stage !== undefined) {
        if (!STAGES.has(body.stage)) { err(res, `unknown stage: ${body.stage}`, 400); return; }
        patch.stage = body.stage;
        patch.stage_at = new Date().toISOString();
      }

      if (body.replied !== undefined) {
        // Ticking this is the single switch that stops a live sequence talking
        // over a real conversation. Untick sets it back to null rather than to
        // a date, so the register never claims a reply that did not happen.
        patch.replied_at = body.replied ? new Date().toISOString() : null;
      }

      if (!Object.keys(patch).length) { err(res, 'nothing to update', 400); return; }

      const { error: uErr } = await db.from('frictioniq_session').update(patch).eq('token', token);
      if (uErr) { err(res, uErr.message, 500); return; }

      json(res, { ok: true, updated: Object.keys(patch) });
    } catch (e) { err(res, e.message, 500); }
    return;
  }

  err(res, `Not found: ${path}`, 404);
});

server.listen(PORT, () => {
  console.log(`
  ┌──────────────────────────────────────────────────┐
  │   PathGuru Publishers v3 + DigiFusion Agent Net  │
  │   http://localhost:${PORT}                            │
  │                                                  │
  │   AGENT ROUTES                                   │
  │   POST /api/agents/nexus/orchestrate             │
  │   POST /api/agents/:id/chat                      │
  │   POST /api/agents/nexus/lifecycle               │
  │   POST /api/agents/nexus/daily-briefing          │
  │   POST /api/agents/nexus/research                │
  │   POST /api/agents/nexus/escalate                │
  │   GET  /ping                                     │
  │   GET  /health                                   │
  │   GET  /api/cron/ping                            │
  │   GET  /api/webhooks/whatsapp                    │
  │   POST /api/webhooks/whatsapp                    │
  │   GET  /api/cron/morning-briefing                │
  │   GET  /api/cron/evening-briefing                │
  │   GET  /api/cron/content-cadence                 │
  │   GET  /api/cron/process-scheduled-content       │
  │   GET  /api/agents/nexus/ceo-ops                 │
  │   POST /api/agents/nexus/evening-briefing        │
  │   POST /api/agents/nexus/design-workflow         │
  │   POST /api/agents/nexus/content-cadence-check   │
  │   GET  /api/agents/nexus/check-escalations       │
  │   POST /api/agents/researcher/research           │
  │   POST /api/agents/synthesizer/ingest            │
  │   POST /api/agents/assistant/intake              │
  │   GET  /api/agents/assistant/knowledge           │
  │                                                  │
  │   FIRM IP / BLUEPRINTS                           │
  │   GET  /api/firm-ip/library                      │
  │   GET  /api/agents/synthesizer/frameworks        │
  │   GET  /api/blueprints                           │
  │   GET  /api/blueprints/:slug                     │
  │   POST /api/blueprints/:slug/purchase            │
  │   GET  /api/blueprints/:slug/download?email=     │
  │   GET  /api/products                             │
  │   GET  /api/purchases?email=                     │
  │                                                  │
  │   CONTENT WORKFLOW                               │
  │   POST /api/content/brief                        │
  │   POST /api/content/publish                      │
  │   POST /api/content/schedule                     │
  │   GET  /api/content/calendar                     │
  └──────────────────────────────────────────────────┘
`);
  startup();
});

server.on('error', e => { console.error('[PathGuru] Server error:', e); process.exit(1); });

async function startup() {
  try {
    const db = getSupabase();
    if (db) {
      const { seedEngagementModelKnowledge } = await import('./skills/firmKnowledge.js');
      const seed = await seedEngagementModelKnowledge(db);
      if (seed.seeded) console.log('[FirmIP] Seeded Engagement Model into knowledge_base');
    }
  } catch (e) { console.warn('[FirmIP] Engagement Model seed skipped:', e.message); }
  logOperatorAuthStatus();
  if (isCronAuthRequired()) {
    console.log('[Cron] CRON_SECRET set — external /api/cron/* routes require auth');
  } else {
    console.warn('[Cron] CRON_SECRET not set — /api/cron/* and CEO POST routes are open. Set on Render for production.');
  }
  const PULSE_SWEEP_INTERVAL_MS = parseInt(process.env.PULSE_SWEEP_INTERVAL_MS || '300000', 10);
  setInterval(async () => {
    try { await AGENTS.pulse.sweep(); } catch(e) { console.warn('[Pulse] sweep error:', e.message); }
  }, PULSE_SWEEP_INTERVAL_MS);
  scheduleDailyBriefing();
  scheduleEveningBriefing();
  scheduleContentCadenceCheck();
  scheduleWeeklyNewsletterProposal();
  // Process due scheduled content — every 6 hours (approval path only, never auto-publish)
  setInterval(async () => {
    try {
      await AGENTS.nexus.processDueScheduledContent();
    } catch (e) { console.warn('[Nexus CEO] scheduled content error:', e.message); }
  }, 6 * 60 * 60 * 1000);
  // Process due orchestration campaign steps — every 15 minutes
  setInterval(async () => {
    try {
      await AGENTS.nexus.processOrchestrationCampaigns();
    } catch (e) { console.warn('[Nexus Campaign] step processor error:', e.message); }
  }, 15 * 60 * 1000);
  // Task hygiene — cancel stale work, dedupe research, reconcile ghost completions
  setInterval(async () => {
    try {
      const { runTaskHygiene } = await import('./skills/taskHygiene.js');
      await runTaskHygiene();
    } catch (e) { console.warn('[TaskHygiene] error:', e.message); }
  }, 6 * 60 * 60 * 1000);
  import('./skills/taskHygiene.js').then((m) => m.runTaskHygiene()).catch((e) => {
    console.warn('[TaskHygiene] startup pass failed:', e.message);
  });
  // NOTE: checkEscalationTriggers() is NOT called on startup — it runs inside
  // generateDailyBriefing() at 7am only. Calling it on every restart caused
  // a Chrome notification flood on every Render deploy/spin-up.
}

function scheduleDailyBriefing() {
  function msUntil7am() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(7, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }
  setTimeout(async function run() {
    try {
      const briefing = await AGENTS.nexus.generateDailyBriefing();
      const { sendImmediate } = await import('./skills/notifier.js');
      await sendImmediate('DigiFusion Daily Briefing', briefing?.summary || 'Daily briefing ready.', 'whatsapp');
    } catch(e) { console.warn('[Nexus] Daily briefing error:', e.message); }
    setTimeout(run, 24 * 60 * 60 * 1000);
  }, msUntil7am());
}

function scheduleEveningBriefing() {
  function msUntil6pm() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(18, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }
  setTimeout(async function run() {
    try {
      const briefing = await AGENTS.nexus.generateEveningBriefing();
      const { sendImmediate } = await import('./skills/notifier.js');
      await sendImmediate('DigiFusion Evening Briefing', briefing?.summary || 'Evening briefing ready.', 'whatsapp');
    } catch (e) { console.warn('[Nexus] Evening briefing error:', e.message); }
    setTimeout(run, 24 * 60 * 60 * 1000);
  }, msUntil6pm());
}

function scheduleContentCadenceCheck() {
  const intervalMs = 12 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      const result = await AGENTS.nexus.runContentCadenceCheck();
      if (result.action === 'approval_sent') {
        console.log('[Nexus CEO] Blog cadence triggered approval for:', result.topic);
      }
    } catch (e) { console.warn('[Nexus CEO] Cadence check error:', e.message); }
  }, intervalMs);
  // First check 30 min after startup (avoid deploy flood with briefings)
  setTimeout(async () => {
    try { await AGENTS.nexus.runContentCadenceCheck(); } catch (e) { /* ignore */ }
  }, 30 * 60 * 1000);
}

function scheduleWeeklyNewsletterProposal() {
  // Fire every Monday at 8am Lagos time (UTC+1)
  function msUntilNextMonday8am() {
    const now  = new Date();
    const next = new Date(now);
    const day  = now.getDay(); // 0=Sun … 6=Sat
    const daysUntilMon = day === 1 ? 7 : (8 - day) % 7 || 7;
    next.setDate(now.getDate() + daysUntilMon);
    next.setHours(7, 0, 0, 0); // 8am Lagos = 7am UTC
    return Math.max(next - now, 1000);
  }
  setTimeout(async function run() {
    try { await nexus.proposeNewsletterTopics(); }
    catch(e) { console.warn('[Nexus] Newsletter proposal error:', e.message); }
    setTimeout(run, 7 * 24 * 60 * 60 * 1000); // re-schedule next Monday
  }, msUntilNextMonday8am());
}

/** @deprecated Use AGENTS.nexus.processDueScheduledContent() — approval gate only */
async function processContentSchedule() {
  return AGENTS.nexus.processDueScheduledContent();
}
