#!/usr/bin/env node
/**
 * Upload a local image to R2 and set featured_image_url on a CMS post.
 *
 * Usage:
 *   node --env-file=.env --env-file=.env.local backend/scripts/set-featured-image.mjs \
 *     --slug=my-post-slug --file=path/to/image.png
 */
import fs from 'fs';
import path from 'path';

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const slug = arg('slug');
const file = arg('file');
const credit = arg('credit') || 'DigiFusion';

if (!slug || !file) {
  console.error('Usage: --slug=post-slug --file=path/to/image.png [--credit=...]');
  process.exit(1);
}

const cmsBase = arg('cms') || process.env.DIGIFUSION_API_URL || 'https://www.digitafusion.com';
if (!cmsBase.includes('localhost')) {
  process.env.DIGIFUSION_API_URL = cmsBase.replace(/\/$/, '');
} else {
  process.env.DIGIFUSION_API_URL = 'https://www.digitafusion.com';
}

const { uploadMediaAsset } = await import('../cloudflareR2.js');
const { getPost, upsertPost } = await import('../cmsClient.js');

const absFile = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
if (!fs.existsSync(absFile)) {
  console.error(`File not found: ${absFile}`);
  process.exit(1);
}

const ext = path.extname(absFile).toLowerCase();
const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
const filename = path.basename(absFile);

const body = fs.readFileSync(absFile);
console.log(`Uploading ${filename} (${Math.round(body.length / 1024)} KB)…`);
const asset = await uploadMediaAsset(filename, body, mime);
console.log('R2 URL:', asset.url);

const existing = await getPost(slug);
const post = existing?.data || existing;
if (!post?.slug) {
  console.error(`Post not found: ${slug}`);
  process.exit(1);
}

await upsertPost({
  slug: post.slug,
  title: post.title,
  content: post.content || '',
  excerpt: post.excerpt || '',
  status: post.status || 'published',
  post_type: post.post_type || 'article',
  meta_description: post.meta_description || '',
  focus_keyword: post.focus_keyword || '',
  categories: post.categories || [],
  tags: post.tags || [],
  author_name: post.author_name || null,
  featured_image_url: asset.url,
  featured_image_credit: credit,
});

console.log(`Updated featured_image_url for /blog/${slug}`);
