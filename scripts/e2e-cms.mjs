#!/usr/bin/env node
/**
 * DigiFusion Command — Blog Room CMS E2E (Playwright)
 *
 * Verifies wiring: platform config → post list → edit/save → optional publish/unpublish → delete.
 * Aligns with docs/DIGIFUSION_CMS_TEST.md department 1.
 *
 * Usage:
 *   npm run install-playwright   # once
 *   npm run test:cms
 *   npm run test:cms -- --url https://pathguru-publishers.onrender.com
 *   npm run test:cms -- --publish --headed
 *
 * Flags:
 *   --url <base>     Backend + webapp origin (default: PATHGURU_URL or http://localhost:8787)
 *   --publish        Include publish + unpublish steps (off by default)
 *   --keep           Skip delete cleanup
 *   --headed         Show browser window
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : true;
}

const BASE = (flag('--url') || process.env.PATHGURU_URL || 'http://localhost:8787').replace(/\/$/, '');
const WITH_PUBLISH = args.includes('--publish');
const KEEP_POST = args.includes('--keep');
const HEADLESS = !args.includes('--headed');

const slug = `e2e-cms-${Date.now()}`;
const initialTitle = `E2E CMS smoke ${new Date().toISOString().slice(0, 19)}`;
const updatedTitle = `${initialTitle} (edited)`;

const results = [];

function pass(step, detail = '') {
  results.push({ step, ok: true, detail });
  console.log(`  ✓ ${step}${detail ? ` — ${detail}` : ''}`);
}

function fail(step, err) {
  const msg = err?.message || String(err);
  results.push({ step, ok: false, detail: msg });
  console.error(`  ✗ ${step} — ${msg}`);
  throw new Error(`${step}: ${msg}`);
}

async function apiJson(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function runApiChecks() {
  console.log('\n── API bootstrap ──');
  const config = await apiJson('GET', '/api/platform/config');
  if (config.defaultProduct !== 'digifusion') {
    fail('platform config', new Error(`expected defaultProduct digifusion, got ${config.defaultProduct}`));
  }
  if (config.publisherEnabled !== false) {
    fail('platform config', new Error('publisherEnabled should be false on Command'));
  }
  pass('platform config', `defaultProduct=${config.defaultProduct}`);

  await apiJson('GET', '/ping');
  pass('ping');
}

async function seedDraftPost() {
  console.log('\n── Seed draft (API) ──');
  const created = await apiJson('POST', '/api/posts', {
    title: initialTitle,
    slug,
    content: '<p>E2E CMS wiring test body.</p>',
    status: 'draft',
    post_type: 'article',
    author_name: 'DigiFusion',
    meta_description: 'Automated CMS e2e test — safe to delete',
  });
  pass('create draft', slug);
  return created;
}

async function cleanupPost(postId) {
  if (KEEP_POST) {
    console.log(`\n── Keeping test post (--keep): ${slug}`);
    return;
  }
  console.log('\n── Cleanup ──');
  try {
    await apiJson('DELETE', `/api/posts/${encodeURIComponent(slug)}`);
    pass('delete post', slug);
  } catch (e) {
    if (postId) {
      try {
        await apiJson('DELETE', `/api/posts/${encodeURIComponent(postId)}`);
        pass('delete post (by id)', String(postId));
        return;
      } catch { /* fall through */ }
    }
    console.warn(`  ! cleanup failed: ${e.message}`);
  }
}

async function runUiFlow(postId) {
  console.log('\n── Blog Room UI ──');
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  await context.addInitScript(({ backendUrl, productId }) => {
    localStorage.setItem('pg_settings', JSON.stringify({ backendUrl }));
    localStorage.setItem('pg_product', productId);
  }, { backendUrl: BASE, productId: 'digifusion' });

  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  await page.waitForSelector('#module-blog.module-shell.active', { timeout: 30_000 });
  pass('Blog Room module active');

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/posts') && r.request().method() === 'GET' && r.status() === 200,
      { timeout: 60_000 },
    ),
    page.click('.blog-subtab[data-blogtab="dashboard"]'),
  ]);
  pass('dashboard loads posts', 'GET /api/posts');

  await page.waitForSelector('#blogDashList .blog-dash-item', { timeout: 30_000 });
  const rowBySlug = page.locator(`.blog-dash-item[data-id="${slug}"]`);
  const row = (await rowBySlug.count()) ? rowBySlug.first() : page.locator('.blog-dash-item').filter({ hasText: initialTitle.slice(0, 20) }).first();
  if (!(await row.count())) fail('list contains seed post', new Error(`slug ${slug} not in dashboard`));
  pass('seed post visible in list');

  await row.locator('.dash-edit').click();

  await page.waitForSelector('#blogViewEditor.active', { timeout: 15_000 });
  await page.waitForSelector('#blogEditorTitle', { timeout: 10_000 });
  pass('editor opens');

  await page.fill('#blogEditorTitle', updatedTitle);
  await page.fill('#blogEditorAuthor', 'DigiFusion');
  await page.locator('#blogEditorArea').evaluate((el) => {
    el.innerHTML = '<p>E2E CMS wiring test body — edited via Playwright.</p>';
  });

  const [saveRes] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/posts/') && r.request().method() === 'PUT' && r.status() === 200,
      { timeout: 30_000 },
    ),
    page.click('#blogEditorSave'),
  ]);
  if (!saveRes.ok()) fail('save edit', new Error(`HTTP ${saveRes.status()}`));
  pass('save edit', 'PUT /api/posts/:id');

  await page.click('#blogEditorBack');
  await page.waitForSelector('#blogViewDashboard.active', { timeout: 10_000 });

  await page.fill('#blogDashSearch', updatedTitle.slice(0, 20));
  await page.waitForTimeout(500);
  await page.waitForSelector('.blog-dash-item', { hasText: updatedTitle.slice(0, 24) });
  pass('edited title in dashboard');

  if (WITH_PUBLISH) {
    await page.fill('#blogDashSearch', '');
    await page.waitForTimeout(600);
    const pubRow = page.locator(`.blog-dash-item[data-id="${slug}"]`).first();
    await pubRow.scrollIntoViewIfNeeded();

    const publishBtn = pubRow.locator('.dash-publish');
    if (await publishBtn.count()) {
      const [pubRes] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/publish') && !r.url().includes('unpublish') && r.request().method() === 'PATCH',
          { timeout: 60_000 },
        ),
        publishBtn.click(),
      ]);
      if (!pubRes.ok()) fail('publish', new Error(`HTTP ${pubRes.status()}`));
      pass('publish', 'PATCH /api/posts/:slug/publish');
    } else {
      pass('publish', 'already published after save (CMS PUT defaults status to published)');
    }

    await page.waitForSelector(`.blog-dash-item[data-id="${slug}"] .dash-status-pill.published`, { timeout: 15_000 });
    pass('published badge visible');

    const [unpubRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/unpublish') && r.request().method() === 'PATCH',
        { timeout: 60_000 },
      ),
      pubRow.locator('.dash-unpublish').click(),
    ]);
    if (!unpubRes.ok()) fail('unpublish', new Error(`HTTP ${unpubRes.status()}`));
    pass('unpublish', 'PATCH /api/posts/:slug/unpublish');
  } else {
    console.log('  · publish/unpublish skipped (use --publish to enable)');
  }

  if (!KEEP_POST) {
    await page.fill('#blogDashSearch', '');
    await page.waitForTimeout(600);
    const delRow = page.locator(`.blog-dash-item[data-id="${slug}"]`).first();
    await delRow.scrollIntoViewIfNeeded();
    const [delRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'DELETE' && /\/api\/posts\//.test(r.url()),
        { timeout: 45_000 },
      ),
      delRow.locator('.dash-delete').click(),
    ]);
    if (!delRes.ok()) fail('delete via UI', new Error(`HTTP ${delRes.status()}`));
    pass('delete via UI', 'DELETE /api/posts/:slug');
  }

  await browser.close();
}

async function main() {
  console.log(`DigiFusion CMS E2E\n  Base: ${BASE}\n  Slug: ${slug}\n  Publish steps: ${WITH_PUBLISH ? 'yes' : 'no'}`);

  let postId = slug;
  try {
    await runApiChecks();
    const created = await seedDraftPost();
    postId = created?.supabase?.slug || created?.slug || slug;
    await runUiFlow(postId);
  } catch (e) {
    console.error(`\nE2E FAILED: ${e.message}`);
    await cleanupPost(postId);
    process.exit(1);
  }

  if (KEEP_POST) {
    console.log(`\nAll steps passed. Test post kept: ${slug}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nDone — ${results.length - failed.length}/${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
