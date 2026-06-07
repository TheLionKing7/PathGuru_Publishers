/**
 * Seed DigiFusion blog posts directly via CMS API (no LLM required).
 * Use when AI provider keys are unavailable — replaces mock data immediately.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-digifusion-static.mjs
 */

const CMS_BASE  = (process.env.DIGIFUSION_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const CMS_TOKEN = process.env.DIGIFUSION_CMS_TOKEN || '';

const POSTS = [
  {
    slug: 'ai-automation-diagnostic-most-teams-skip',
    title: 'Why Most AI Automation Projects Fail Before Go-Live',
    excerpt: 'The failure is rarely the technology. It is the diagnostic step most teams skip — and it costs six figures in rework.',
    post_type: 'guide',
    focus_keyword: 'AI automation diagnostic',
    categories: ['AI Automation'],
    tags: ['automation', 'AVE', 'diagnostic'],
    content: `
<div class="blog-hook"><p>Seventy percent of automation initiatives fail not because the stack was wrong, but because nobody mapped the process before writing a single line of code.</p></div>
<h2>The hidden failure mode</h2>
<p>Most teams start with a tool — Zapier, Make, a custom agent — and work backwards. The Automation Velocity Engine inverts this: <strong>diagnose first, architect second, build third</strong>. Without a completed Automation Opportunity Matrix, you are automating chaos.</p>
<h2>What a real diagnostic looks like</h2>
<p>A proper diagnostic answers three questions: Which processes are standardized enough to automate? What is the real cost of manual execution per month? Who owns adoption after go-live?</p>
<ul class="blog-list"><li>Map manual steps against ROI × complexity</li><li>Score team readiness (ADKAR) before build</li><li>Define adoption KPIs before deployment</li></ul>
<h2>What to do this week</h2>
<p>Pick your highest-volume manual process. Document it as-is for three days. If three different people execute it three different ways, you are not ready to automate — you are ready to standardize.</p>
<div class="blog-cta"><p><strong>Want the full AVE diagnostic?</strong> Explore DigiFusion Intelligence playbooks or book a strategy session.</p></div>
`.trim(),
  },
  {
    slug: 'dream-50-b2b-targeting-mistake',
    title: 'The Dream 50 Mistake: Why B2B Teams Target the Wrong Accounts',
    excerpt: 'Dream 50 only works when Pain Fit, Deal Size Fit, Access Fit, and Timing Fit are scored — not when marketing hands sales a vanity list.',
    post_type: 'how-to',
    focus_keyword: 'B2B account targeting',
    categories: ['Business Development'],
    tags: ['deal-engine', 'ABM', 'pipeline'],
    content: `
<div class="blog-hook"><p>Your Dream 50 is probably a wish list, not a strategy. Here is how to fix it in one working session.</p></div>
<h2>Why most Dream 50 lists fail</h2>
<p>Teams pick logos they admire, not accounts they can win. The Deal Engine scores four fits: <strong>Pain, Deal Size, Access, and Timing</strong>. Miss one and you are burning BD hours on accounts that will never close this quarter.</p>
<h2>The one-afternoon fix</h2>
<ol class="blog-list"><li>List 50 accounts that match your ICP on paper</li><li>Score each 1–5 on all four fits</li><li>Cut anything below 14/20 — ruthlessly</li><li>Map the Decision Unit for your top 15</li></ol>
<h2>What changes when you get this right</h2>
<p>Pipeline velocity improves because every outreach message speaks to a verified pain, a known stakeholder map, and a specific commercial window — not generic thought leadership.</p>
`.trim(),
  },
  {
    slug: 'pillar-cluster-authority-architecture',
    title: 'Pillar Pages Without Clusters Burn Budget',
    excerpt: 'A 4,000-word pillar with no cluster map is an expensive orphan page. Topical authority requires architecture, not volume.',
    post_type: 'guide',
    focus_keyword: 'pillar cluster SEO strategy',
    categories: ['Digital Media'],
    tags: ['content-strategy', 'SEO', 'C2C'],
    content: `
<div class="blog-hook"><p>Companies spend $15K on a pillar page and wonder why traffic flatlines. The page was never designed as a hub.</p></div>
<h2>Authority is architecture, not word count</h2>
<p>The Content-to-Capital Pipeline starts with an ICP Search Journey Map: where is your buyer stuck between See, Think, Do, and Care? Every cluster article must target one stage and link back to the pillar.</p>
<h2>Minimum viable pillar-cluster</h2>
<ul class="blog-list"><li>1 pillar (3,000–5,000 words) on your core commercial keyword</li><li>8–12 clusters, each mapped to a search-intent stage</li><li>Internal links defined before writing begins</li><li>Attribution dashboard from day one</li></ul>
<h2>The commercial payoff</h2>
<p>When architecture precedes production, content compounds. When production precedes architecture, you rent attention campaign by campaign.</p>
`.trim(),
  },
];

async function upsertPost(post) {
  const res = await fetch(`${CMS_BASE}/api/cms/posts`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${CMS_TOKEN}`,
    },
    body: JSON.stringify({
      ...post,
      status:               'published',
      meta_description:     post.excerpt.slice(0, 155),
      author_name:          'Boroji Adebayo-Hopewell, Founder',
      reading_time_minutes: 6,
      word_count:           800,
      published_at:         new Date().toISOString(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `CMS ${res.status}`);
  return data;
}

async function main() {
  if (!CMS_TOKEN) {
    console.error('DIGIFUSION_CMS_TOKEN is not set. Match PATHGURU_CMS_TOKEN in DigiFusion .env.local');
    process.exit(1);
  }
  console.log(`Seeding ${POSTS.length} posts → ${CMS_BASE}/api/cms/posts\n`);

  for (const post of POSTS) {
    try {
      await upsertPost(post);
      console.log(`✓ ${post.slug}`);
    } catch (e) {
      console.error(`✗ ${post.slug}: ${e.message}`);
    }
  }
  console.log(`\nDone. View: ${CMS_BASE}/blog`);
}

main();
