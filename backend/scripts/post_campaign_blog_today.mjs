/**
 * One-shot: publish first SME campaign article via production write-blog API.
 * Usage: node backend/scripts/post_campaign_blog_today.mjs [baseUrl]
 */
const base = (process.argv[2] || 'https://pathguru-publishers.onrender.com').replace(/\/$/, '');
const taskId = '6a35384b-83c6-4600-a5f8-7cf70a260f26';
const topic =
  "Cash Flow on the Go: How Mobile Money Invoice Discounting Can Unlock 78% of Africa's SME Capital";

console.log('[post] Fetching research brief…');
const delRes = await fetch(`${base}/api/agents/research/deliverables/${taskId}`);
if (!delRes.ok) throw new Error(`Deliverable fetch failed: ${delRes.status}`);
const del = await delRes.json();
const brief = del.brief || del.task?.output?.brief || '';
if (brief.length < 120) throw new Error('Research brief too short');

const body = {
  topic,
  researchBrief: brief.slice(0, 6000),
  publish:       true,
  force:         true,
  postType:      'article',
  author:        'Boroji Adebayo-Hopewell, Founder',
  domain:        'business_development',
  niche:         'business_development',
  audience:      'African SME founders, finance leads, and operators',
  seoKeyword:    'mobile money invoice discounting Africa SME',
  wordCount:     1400,
};

console.log('[post] Aether write-blog →', topic.slice(0, 60), '…');
const res = await fetch(`${base}/api/agents/aether/write-blog`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify(body),
});

const text = await res.text();
let data;
try { data = JSON.parse(text); } catch { data = { raw: text }; }

if (!res.ok) {
  console.error('[post] FAILED', res.status, data);
  process.exit(1);
}

console.log('[post] OK');
console.log(JSON.stringify({
  slug: data.slug || data.publishResults?.[0]?.slug,
  url:  data.url || data.publishResults?.[0]?.url,
  title: data.post?.title || topic,
}, null, 2));
