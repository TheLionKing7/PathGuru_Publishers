#!/usr/bin/env node
/** High-DPI UI captures for design review — run: node scripts/capture-ui.mjs [dept|all] */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'tmp-ui-captures');
const BASE = process.env.PATHGURU_URL || 'http://localhost:8787';

const DEPTS = {
  publisher:    'button[data-dept="publisher"]',
  intelligence: 'button[data-dept="intelligence"]',
  products:     'button[data-dept="products"]',
  network:      'button[data-dept="network"]',
  analytics:    'button[data-dept="analytics"]',
};

const arg = (process.argv[2] || 'all').toLowerCase();
const targets = arg === 'all' ? Object.keys(DEPTS) : [arg];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60_000 });

for (const name of targets) {
  const sel = DEPTS[name];
  if (!sel) {
    console.error(`Unknown dept: ${name}. Use: ${Object.keys(DEPTS).join(', ')}, all`);
    process.exit(1);
  }
  await page.click(sel);
  await page.waitForTimeout(600);
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(path);
}

await browser.close();
