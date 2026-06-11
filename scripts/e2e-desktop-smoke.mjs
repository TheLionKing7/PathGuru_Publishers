#!/usr/bin/env node
/** Desktop smoke — bundled file:// UI + cloud API (mirrors Electron default). */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'webapp', 'index.html');
const indexUrl = `file:///${indexPath.replace(/\\/g, '/')}`;
const api = (process.env.PATHGURU_URL || 'https://pathguru-publishers.onrender.com').replace(/\/$/, '');

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(({ backendUrl, productId }) => {
  localStorage.setItem('pg_settings', JSON.stringify({ backendUrl }));
  localStorage.setItem('pg_product', productId);
}, { backendUrl: api, productId: 'digifusion' });

const page = await ctx.newPage();
const apiCalls = [];
page.on('request', (r) => {
  if (r.url().startsWith(api)) apiCalls.push(r.url());
});

await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForSelector('#module-blog.module-shell.active', { timeout: 30_000 });

await Promise.all([
  page.waitForResponse((r) => r.url().includes('/api/posts') && r.request().method() === 'GET' && r.ok()),
  page.click('.blog-subtab[data-blogtab="dashboard"]'),
]);

const configRes = await fetch(`${api}/api/platform/config`);
if (!configRes.ok) throw new Error(`platform config HTTP ${configRes.status}`);

console.log('Desktop smoke PASS');
console.log(`  UI: ${indexUrl}`);
console.log(`  API: ${api}`);
console.log(`  Render API requests from UI: ${apiCalls.length}`);
console.log(`  Sample: ${apiCalls.find((u) => u.includes('/api/posts')) || apiCalls[0] || 'none'}`);

await browser.close();
