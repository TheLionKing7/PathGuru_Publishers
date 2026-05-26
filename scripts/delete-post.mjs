/**
 * PathGuru — Delete / Unpublish a Blog Post
 *
 * Calls DigiFusion CMS directly — the backend server does NOT need to be running.
 *
 * Usage:
 *   node --env-file=.env scripts/delete-post.mjs --slug beyond-the-algorithm-10-books-every-marketer-must-master
 *
 * Flags:
 *   --slug        Post slug to remove (required)
 *   --unpublish   Set to draft instead of deleting permanently
 */

const args = process.argv.slice(2);
function flag(name, fallback = null) {
  const i = args.indexOf(name);
  if (i === -1 || !args[i + 1]) return fallback;
  return args[i + 1];
}

const SLUG      = flag('--slug');
const UNPUBLISH = args.includes('--unpublish');

if (!SLUG) {
  console.error('\n  --slug is required.\n');
  console.error('  Example:');
  console.error('  node --env-file=.env scripts/delete-post.mjs --slug my-post-slug\n');
  process.exit(1);
}

const BASE  = (process.env.DIGIFUSION_API_URL  || '').replace(/\/$/, '');
const TOKEN =  process.env.DIGIFUSION_CMS_TOKEN || '';

if (!BASE || !TOKEN) {
  console.error('\n  ❌  DIGIFUSION_API_URL or DIGIFUSION_CMS_TOKEN not found in .env\n');
  process.exit(1);
}

console.log(`\n🗑️   PathGuru — ${UNPUBLISH ? 'Unpublish' : 'Delete'} Post`);
console.log('─'.repeat(52));
console.log(`  Slug   : ${SLUG}`);
console.log(`  Action : ${UNPUBLISH ? 'Set to draft (recoverable)' : 'Archive/delete'}`);
console.log(`  CMS    : ${BASE}`);
console.log('─'.repeat(52));
console.log();

const url    = UNPUBLISH
  ? `${BASE}/api/cms/posts/${encodeURIComponent(SLUG)}`
  : `${BASE}/api/cms/posts/${encodeURIComponent(SLUG)}`;
const method = UNPUBLISH ? 'PATCH' : 'DELETE';
const body   = UNPUBLISH ? JSON.stringify({ status: 'draft' }) : undefined;

try {
  const res  = await fetch(url, {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    ...(body ? { body } : {}),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`  ❌  CMS returned ${res.status}: ${data?.error || data?.message || JSON.stringify(data).slice(0, 200)}\n`);
    process.exit(1);
  }

  console.log(`  ✅  Post ${UNPUBLISH ? 'set to draft' : 'deleted'} from DigiFusion CMS.`);
  if (UNPUBLISH) console.log('      It is no longer public but can be republished later.');
  console.log();

} catch (e) {
  console.error(`  ❌  Request failed: ${e.message}\n`);
  process.exit(1);
}
