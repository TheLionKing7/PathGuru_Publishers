#!/usr/bin/env node
/**
 * AffOS + Intelligence wiring smoke tests (production-safe GETs).
 */
const DIGIFUSION = (process.env.DIGIFUSION_API_URL || 'https://www.digitafusion.com').replace(/\/$/, '');
const PATHGURU = (process.env.PATHGURU_URL || 'https://pathguru-publishers.onrender.com').replace(/\/$/, '');
const BLOG_SLUG = 'your-followers-are-ready-to-buy-affiliateos-infrastructure';
const SHOP_SLUG = 'affiliateos-headless-commerce-case-study';
const CASE_STUDY_PATH = '/intelligence/research/affiliateos-headless-commerce-case-study';

const checks = [];

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    checks.push({ name, ok: false, err: e.message });
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}

await check('PathGuru /ping', async () => {
  const r = await fetch(`${PATHGURU}/ping`);
  const j = await r.json();
  if (!j.ok) throw new Error('ping not ok');
});

await check('PathGuru platform config', async () => {
  const r = await fetch(`${PATHGURU}/api/platform/config`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
});

await check('DigiFusion intelligence research page', async () => {
  const r = await fetch(`${DIGIFUSION}/intelligence/research`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  if (!html.includes('AffiliateOS') && !html.includes('Followers Are Ready')) {
    throw new Error('AffiliateOS teaser not in HTML (deploy digifusion first)');
  }
});

await check('DigiFusion shop product slug (after seed)', async () => {
  const r = await fetch(`${DIGIFUSION}/shop/${SHOP_SLUG}`);
  if (r.status === 404) throw new Error('product page 404 — run seed-intelligence-products + R2 upload');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
});

await check('AffiliateOS interactive case study page', async () => {
  const r = await fetch(`${DIGIFUSION}${CASE_STUDY_PATH}`);
  if (r.status === 404) throw new Error('case study route 404 — deploy digifusion');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  if (!html.includes('paywall-gate') || !html.includes('affiliateos-paywall.js')) {
    throw new Error('case study HTML paywall not wired');
  }
});

await check('AffOS blog post published', async () => {
  const r = await fetch(`${DIGIFUSION}/blog/${BLOG_SLUG}`);
  if (r.status === 404) throw new Error('blog 404 — run scripts/seed-affos-blog.mjs');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
});

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
