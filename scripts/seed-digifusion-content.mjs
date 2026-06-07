/**
 * Seed DigiFusion with real agent-authored content (replaces mock blog data).
 *
 * Uses Aether (content strategy) + blog publisher → DigiFusion CMS.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-digifusion-content.mjs
 *   node --env-file=.env.local scripts/seed-digifusion-content.mjs --only 1
 *   node --env-file=.env.local scripts/seed-digifusion-content.mjs --dry-run
 *
 * Prerequisites:
 *   1. PathGuru running:  npm run dev  →  http://localhost:8787
 *   2. DigiFusion running: npm run dev  →  http://localhost:3000
 *   3. PATHGURU_CMS_TOKEN in DigiFusion matches DIGIFUSION_CMS_TOKEN in PathGuru
 */

const BACKEND = (process.env.PATHGURU_LOCAL_URL || `http://localhost:${process.env.PORT || 8787}`).replace(/\/$/, '');
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const onlyIdx = args.includes('--only') ? parseInt(args[args.indexOf('--only') + 1], 10) : null;

/** Teaser posts — one per agency pillar (derivative of Intelligence IP strategy) */
const SEED_POSTS = [
  {
    topic: 'Why most AI automation projects fail before go-live — and the one diagnostic step teams skip',
    audience: 'SMB operators and agency owners evaluating automation',
    niche: 'automation',
    seoKeyword: 'AI automation failure diagnostic',
    postType: 'guide',
    tone: 'direct, expert, practical',
    ctaGoal: 'Book a free Automation Velocity diagnostic at digitafusion.com/agency/booking',
  },
  {
    topic: 'The Dream 50 mistake: why B2B teams target the wrong accounts first (and how to fix it in one afternoon)',
    audience: 'founders and BD leads at growth-stage B2B companies',
    niche: 'business_development',
    seoKeyword: 'B2B account targeting strategy',
    postType: 'how-to',
    tone: 'authoritative, commercially sharp',
    ctaGoal: 'Explore DigiFusion Business Development frameworks at digitafusion.com/agency',
  },
  {
    topic: 'Pillar pages without clusters burn ad budget — what topical authority architecture actually requires',
    audience: 'marketing directors and content leads at SMBs',
    niche: 'digital_media',
    seoKeyword: 'pillar cluster content strategy',
    postType: 'guide',
    tone: 'intellectually rigorous, warm',
    ctaGoal: 'See the Content-to-Capital approach at digitafusion.com/intelligence/playbooks',
  },
];

async function writeBlog(post, index) {
  console.log(`\n── Post ${index + 1}/${SEED_POSTS.length} ──`);
  console.log(`   Topic: ${post.topic.slice(0, 72)}…`);

  if (DRY_RUN) {
    console.log('   [dry-run] Would call /api/agents/aether/write-blog');
    return { dryRun: true };
  }

  const res = await fetch(`${BACKEND}/api/agents/aether/write-blog`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      ...post,
      publish: true,
      author:  'Boroji Adebayo-Hopewell, Founder',
      force:   true, // bootstrap teasers — production derivatives require researchBrief or playbookSlug
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  const slug = data.post?.post?.slug || data.post?.seo?.slug || data.publishResults?.[0]?.slug;
  const url  = data.publishResults?.[0]?.url || (slug ? `http://localhost:3000/blog/${slug}` : null);
  console.log(`   ✓ Published${url ? `: ${url}` : ''}`);
  return data;
}

async function checkHealth() {
  try {
    const res = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`health ${res.status}`);
    console.log(`✓ PathGuru backend reachable at ${BACKEND}`);
  } catch (e) {
    console.error(`\n✗ Cannot reach PathGuru at ${BACKEND}`);
    console.error('  Start it first:  cd PathGuru_Publishers_v3 && npm run dev\n');
    process.exit(1);
  }
}

async function main() {
  console.log('DigiFusion content seed — Aether (Content Strategy agent)');
  console.log(`Backend: ${BACKEND}`);
  console.log(`DigiFusion CMS target: ${process.env.DIGIFUSION_API_URL || 'http://localhost:3000'}`);
  if (DRY_RUN) console.log('Mode: DRY RUN (no API calls)\n');

  await checkHealth();

  const posts = onlyIdx != null ? [SEED_POSTS[onlyIdx - 1]].filter(Boolean) : SEED_POSTS;
  if (!posts.length) {
    console.error('Invalid --only index. Use 1, 2, or 3.');
    process.exit(1);
  }

  const results = [];
  for (let i = 0; i < posts.length; i++) {
    try {
      results.push(await writeBlog(posts[i], onlyIdx != null ? onlyIdx - 1 : i));
      // Brief pause between LLM calls
      if (i < posts.length - 1) await new Promise(r => setTimeout(r, 3000));
    } catch (e) {
      console.error(`   ✗ Failed: ${e.message}`);
      results.push({ error: e.message });
    }
  }

  const ok = results.filter(r => !r.error && !r.dryRun).length;
  console.log(`\nDone — ${ok}/${posts.length} posts seeded.`);
  console.log('View at: http://localhost:3000/blog');
}

main().catch(e => { console.error(e); process.exit(1); });
