/**
 * PathGuru Publishers — Blog Publisher Agent
 *
 * Generates award-winning blog posts and publishes directly to:
 *   - WordPress (REST API v2)
 *   - Ghost (Admin API)
 *   - Webflow (CMS API)
 *   - HTML file (universal fallback)
 *
 * Each post includes:
 *   - SEO-optimised title + meta description
 *   - Full structured HTML body
 *   - Featured image from Pexels
 *   - Social captions (Twitter/X, LinkedIn)
 *   - Tags + categories
 */

import { buildBlogPrompt, parseBlogResponse, normalizeSection, stripHtmlTags } from './skills/editorial.js';
import { searchPexels } from './pexelsAssets.js';
import { resolvePersona, injectPersonaIntoPrompt, personaBylineMeta } from './skills/personaPrompt.js';
import { selectPersonaForNiche } from './skills/personas.js';

/* ── Build blog post HTML from sections ───────────────── */
function buildBlogHtml(post, design = {}) {
  const accent    = design?.palette?.accent    || '#2bb3a3';
  const pageFg    = design?.palette?.pageFg    || '#1a2236';
  const bodyFont  = design?.bodyFont           || "'DM Sans', system-ui, sans-serif";
  const titleFont = design?.titleFont          || "'Playfair Display', Georgia, serif";
  const fontImport = design?.fontImport        || '';

  function renderInline(text) {
    return String(text)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>');
  }

  function parseBody(raw = '') {
    const blocks = stripHtmlTags(raw).split(/\n{2,}/);
    return blocks.map((block, i) => {
      const b = block.trim();
      if (!b) return '';
      if (b.startsWith('>>')) {
        return `<blockquote class="blog-pull">${renderInline(b.replace(/^>>\s*/, ''))}</blockquote>`;
      }
      if (/^[-•]\s/.test(b)) {
        const items = b.split('\n').filter(l => /^[-•]\s/.test(l.trim()))
          .map(l => `<li>${renderInline(l.replace(/^[-•]\s/,''))}</li>`).join('');
        return `<ul class="blog-list">${items}</ul>`;
      }
      if (/^\d+\.\s/.test(b)) {
        const items = b.split('\n').filter(l => /^\d+\.\s/.test(l.trim()))
          .map(l => `<li>${renderInline(l.replace(/^\d+\.\s/,''))}</li>`).join('');
        return `<ol class="blog-list">${items}</ol>`;
      }
      return `<p>${renderInline(b)}</p>`;
    }).join('\n');
  }

  function renderSection(s) {
    const t = (s.type || 'h2').toLowerCase();
    const body = parseBody(s.body || '');

    if (t === 'hook') {
      return `<div class="blog-hook">${body}</div>`;
    }
    if (t === 'h2') {
      return `<h2>${renderInline(s.heading || '')}</h2>${body}`;
    }
    if (t === 'h3') {
      return `<h3>${renderInline(s.heading || '')}</h3>${body}`;
    }
    if (t === 'bulletlist') {
      const lines = (s.body || '').split('\n').filter(l => l.trim())
        .map(l => `<li>${renderInline(l.replace(/^[-•\d.]+\s*/,''))}</li>`).join('');
      return `${s.heading ? `<h2>${renderInline(s.heading)}</h2>` : ''}<ul class="blog-list">${lines}</ul>`;
    }
    if (t === 'numberedlist') {
      const lines = (s.body || '').split('\n').filter(l => l.trim())
        .map(l => `<li>${renderInline(l.replace(/^[-•\d.]+\s*/,''))}</li>`).join('');
      return `${s.heading ? `<h2>${renderInline(s.heading)}</h2>` : ''}<ol class="blog-list">${lines}</ol>`;
    }
    if (t === 'pullquote') {
      return `<blockquote class="blog-pull">${parseBody(s.body)}</blockquote>`;
    }
    if (t === 'cta') {
      return `<div class="blog-cta">${s.heading ? `<p class="cta-label">Next step</p><h3>${renderInline(s.heading)}</h3>` : ''}${body}</div>`;
    }
    if (t === 'conclusion') {
      return `<div class="blog-conclusion">${s.heading ? `<h2>${renderInline(s.heading)}</h2>` : ''}${body}</div>`;
    }
    return `${s.heading ? `<h2>${renderInline(s.heading)}</h2>` : ''}${body}`;
  }

  const sectionsHtml = (post.sections || []).map(renderSection).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${renderInline(post.title || '')}</title>
  <meta name="description" content="${String(post.metaDescription || '').replace(/"/g,'&quot;')}">
  ${post.focusKeyword ? `<meta name="keywords" content="${String(post.focusKeyword).replace(/"/g,'&quot;')}">` : ''}
  ${fontImport ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="${fontImport}" rel="stylesheet">` : ''}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${bodyFont}; font-size: 17px; line-height: 1.72; color: ${pageFg}; background: #fff; }
    .post-wrap { max-width: 740px; margin: 0 auto; padding: 48px 24px 80px; }
    .post-meta { font-size: 13px; color: #888; margin-bottom: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .post-title { font-family: ${titleFont}; font-size: 38px; font-weight: 700; line-height: 1.12; letter-spacing: -.02em; margin-bottom: 14px; color: ${pageFg}; }
    .post-excerpt { font-size: 18px; color: #555; line-height: 1.55; margin-bottom: 32px; border-left: 3px solid ${accent}; padding-left: 16px; }
    .post-image { width: 100%; height: 420px; object-fit: cover; border-radius: 10px; margin-bottom: 40px; display: block; }
    .post-body h2 { font-family: ${titleFont}; font-size: 24px; font-weight: 700; margin: 40px 0 14px; letter-spacing: -.01em; }
    .post-body h3 { font-family: ${titleFont}; font-size: 18px; font-weight: 700; margin: 28px 0 10px; }
    .post-body p { margin-bottom: 18px; }
    .post-body strong { font-weight: 700; }
    .post-body em { font-style: italic; }
    .blog-hook { font-size: 18.5px; line-height: 1.65; color: ${pageFg}; margin-bottom: 32px; }
    .blog-hook p { margin-bottom: 14px; }
    .blog-list { padding-left: 22px; margin: 10px 0 22px; }
    .blog-list li { margin-bottom: 8px; font-size: 16px; line-height: 1.6; }
    ol.blog-list li::marker { color: ${accent}; font-weight: 700; }
    blockquote.blog-pull {
      border-left: 4px solid ${accent};
      background: #f8f9fc;
      padding: 20px 24px;
      margin: 32px 0;
      font-size: 17px;
      font-style: italic;
      color: ${pageFg};
      border-radius: 0 8px 8px 0;
    }
    blockquote.blog-pull p { margin: 0; }
    .blog-cta {
      background: ${pageFg};
      color: #fff;
      padding: 32px 36px;
      border-radius: 10px;
      margin: 48px 0 32px;
    }
    .blog-cta .cta-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: ${accent}; margin-bottom: 8px; }
    .blog-cta h3 { font-family: ${titleFont}; font-size: 22px; color: #fff; margin-bottom: 14px; }
    .blog-cta p { color: rgba(255,255,255,.82); margin-bottom: 10px; }
    .blog-conclusion { padding: 32px 0 0; border-top: 1px solid #e5e7eb; margin-top: 40px; }
    .post-tags { margin-top: 40px; display: flex; flex-wrap: wrap; gap: 8px; }
    .post-tag { font-size: 12px; font-weight: 600; color: ${accent}; background: #f0fdf9; padding: 4px 12px; border-radius: 20px; border: 1px solid ${accent}40; }
    .post-social { margin-top: 40px; padding: 24px; background: #f8f9fc; border-radius: 10px; }
    .post-social h4 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #888; margin-bottom: 12px; }
    .social-caption { font-size: 14px; color: #555; background: #fff; padding: 12px 16px; border-radius: 6px; border: 1px solid #e5e7eb; margin-bottom: 10px; white-space: pre-wrap; }
    @media (max-width: 600px) { .post-title { font-size: 28px; } .post-image { height: 240px; } .blog-cta { padding: 24px 20px; } }
  </style>
</head>
<body>
<article class="post-wrap" itemscope itemtype="https://schema.org/BlogPosting">
  <p class="post-meta">${post.categories?.join(' · ') || ''} ${post.readingTimeMinutes ? `· ${post.readingTimeMinutes} min read` : ''}</p>
  <h1 class="post-title" itemprop="headline">${renderInline(post.title || '')}</h1>
  ${post.excerpt ? `<p class="post-excerpt">${renderInline(post.excerpt)}</p>` : ''}
  ${post.featuredImageUrl ? `<img class="post-image" src="${post.featuredImageUrl}" alt="${renderInline(post.title || '')}" itemprop="image">` : ''}
  <div class="post-body" itemprop="articleBody">
    ${sectionsHtml}
  </div>
  ${post.tags?.length ? `<div class="post-tags">${post.tags.map(t=>`<span class="post-tag">#${t}</span>`).join('')}</div>` : ''}
  ${(post.socialCaption || post.linkedinCaption) ? `
  <div class="post-social">
    <h4>Social captions</h4>
    ${post.socialCaption    ? `<p class="social-caption" title="Twitter/X">𝕏 &nbsp;${post.socialCaption}</p>` : ''}
    ${post.linkedinCaption  ? `<p class="social-caption" title="LinkedIn">in &nbsp;${post.linkedinCaption}</p>` : ''}
  </div>` : ''}
</article>
</body>
</html>`;
}

/* ── WordPress publisher ─────────────────────────────── */
async function publishToWordPress(post, settings, featuredImageUrl) {
  const { siteUrl, username, appPassword } = settings;
  const base    = siteUrl.replace(/\/$/, '');
  const auth    = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };

  // 1. Create/find tags
  const tagIds = [];
  for (const tag of (post.tags || []).slice(0, 5)) {
    try {
      const res = await fetch(`${base}/wp-json/wp/v2/tags?search=${encodeURIComponent(tag)}`, { headers });
      const existing = await res.json();
      if (existing.length) {
        tagIds.push(existing[0].id);
      } else {
        const cr = await fetch(`${base}/wp-json/wp/v2/tags`, { method:'POST', headers, body: JSON.stringify({ name: tag }) });
        const ct = await cr.json();
        if (ct.id) tagIds.push(ct.id);
      }
    } catch {}
  }

  // 2. Create/find category
  const catIds = [];
  for (const cat of (post.categories || []).slice(0, 2)) {
    try {
      const res = await fetch(`${base}/wp-json/wp/v2/categories?search=${encodeURIComponent(cat)}`, { headers });
      const existing = await res.json();
      if (existing.length) {
        catIds.push(existing[0].id);
      } else {
        const cr = await fetch(`${base}/wp-json/wp/v2/categories`, { method:'POST', headers, body: JSON.stringify({ name: cat }) });
        const ct = await cr.json();
        if (ct.id) catIds.push(ct.id);
      }
    } catch {}
  }

  // 3. Build HTML content from sections
  const htmlContent = buildBlogHtml(post);

  // 4. Create the post
  const payload = {
    title:          post.title,
    content:        htmlContent,
    excerpt:        post.excerpt || '',
    slug:           post.slug   || '',
    status:         settings.status || 'draft',
    tags:           tagIds,
    categories:     catIds,
    meta: {
      _yoast_wpseo_metadesc:      post.metaDescription || '',
      _yoast_wpseo_focuskw:       post.focusKeyword    || '',
    },
  };

  const res = await fetch(`${base}/wp-json/wp/v2/posts`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WordPress API error ${res.status}: ${err.message || JSON.stringify(err)}`);
  }

  const created = await res.json();
  return {
    platform: 'wordpress',
    postId:   created.id,
    url:      created.link,
    editUrl:  `${base}/wp-admin/post.php?post=${created.id}&action=edit`,
    status:   created.status,
  };
}

/* ── Ghost publisher ─────────────────────────────────── */
async function publishToGhost(post, settings, featuredImageUrl) {
  const { siteUrl, adminApiKey } = settings;
  const base   = siteUrl.replace(/\/$/, '');
  const [id, secret] = adminApiKey.split(':');

  // Generate JWT for Ghost Admin API
  const jwt = await generateGhostJwt(id, secret);
  const headers = { 'Authorization': `Ghost ${jwt}`, 'Content-Type': 'application/json' };

  const htmlContent = buildBlogHtml(post);

  const payload = {
    posts: [{
      title:            post.title,
      html:             htmlContent,
      custom_excerpt:   post.excerpt || '',
      slug:             post.slug    || '',
      status:           settings.status || 'draft',
      tags:             (post.tags || []).map(t => ({ name: t })),
      feature_image:    featuredImageUrl || null,
      meta_description: post.metaDescription || '',
    }],
  };

  const res = await fetch(`${base}/ghost/api/admin/posts/`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Ghost API error ${res.status}: ${JSON.stringify(err.errors || err)}`);
  }

  const created = await res.json();
  const p = created.posts?.[0];
  return {
    platform: 'ghost',
    postId:   p?.id,
    url:      p?.url,
    editUrl:  `${base}/ghost/#/editor/post/${p?.id}`,
    status:   p?.status,
  };
}

/* ── Ghost JWT helper ────────────────────────────────── */
async function generateGhostJwt(keyId, secret) {
  const hexToBytes = hex => new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const header  = btoa(JSON.stringify({ alg: 'HS256', kid: keyId, typ: 'JWT' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const now     = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const sigInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey('raw', hexToBytes(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${sigInput}.${sigB64}`;
}

/* ── DigiFusion CMS publisher ───────────────────────── */
async function publishToDigiFusion (post, settings, html) {
  const { upsertPost } = await import('./cmsClient.js');

  const slug = post.slug || (post.title || 'post')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  const payload = {
    title:                 post.title,
    slug,
    excerpt:               post.excerpt               || '',
    content:               html,
    post_type:             settings.postType          || 'blog_post',
    status:                settings.status            || 'published',
    meta_description:      post.metaDescription       || '',
    focus_keyword:         post.focusKeyword          || '',
    featured_image_url:    post.featuredImageUrl      || null,
    featured_image_credit: post.featuredImageCredit   || null,
    social_caption:        post.socialCaption         || '',
    linkedin_caption:      post.linkedinCaption       || '',
    categories:            post.categories            || [],
    tags:                  post.tags                  || [],
    author_name:           post.authorName            || 'DigiFusion Team',
    reading_time_minutes:  post.readingTimeMinutes    || null,
    word_count:            post.wordCount             || null,
  };

  const result = await upsertPost(payload);
  const saved  = result?.data;

  return {
    platform: 'digifusion',
    postId:   saved?.id   || null,
    url:      saved?.slug ? `/blog/${saved.slug}` : null,
    status:   saved?.status || settings.status || 'published',
  };
}

/* ── Webflow publisher ───────────────────────────────── */
async function publishToWebflow(post, settings, featuredImageUrl) {
  const { apiKey, collectionId, siteId } = settings;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type':  'application/json',
    'accept-version': '1.0.0',
  };

  const htmlContent = buildBlogHtml(post);

  const payload = {
    isArchived:  false,
    isDraft:     settings.status !== 'published',
    fieldData: {
      name:              post.title,
      slug:              post.slug || post.title.toLowerCase().replace(/[^a-z0-9]+/g,'-'),
      'post-body':       htmlContent,
      'post-summary':    post.excerpt || '',
      'meta-title':      post.title,
      'meta-description':post.metaDescription || '',
      'thumbnail-image': featuredImageUrl ? { url: featuredImageUrl } : undefined,
      'tags':            (post.tags || []).join(', '),
    },
  };

  const res = await fetch(`https://api.webflow.com/v2/collections/${collectionId}/items`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Webflow API error ${res.status}: ${JSON.stringify(err)}`);
  }

  const created = await res.json();
  return {
    platform: 'webflow',
    postId:   created.id,
    url:      null,
    editUrl:  `https://webflow.com/design/${siteId}`,
    status:   settings.status || 'draft',
  };
}

/* ══════════════════════════════════════════════════
   MAIN EXPORT — generateAndPublishBlogPost
══════════════════════════════════════════════════ */
export async function generateAndPublishBlogPost(input, aiProvider) {
  // 1. Research (reuse existing research agent if available)
  let research = { summary: '', sources: [] };
  try {
    const { runResearchAgent } = await import('./skills/research.js');
    research = await runResearchAgent({ topic: input.topic, audience: input.audience }, {});
  } catch {}

  // 2. Resolve persona — explicit pick > niche auto-select > null (default voice)
  const persona = resolvePersona(
    input.personaId || null,
    () => input.niche ? selectPersonaForNiche(input.niche, input.postType) : null
  );

  // 3. Build prompt and inject persona voice + samples
  const basePrompt = buildBlogPrompt(input, research);
  const { prompt: finalPrompt } = injectPersonaIntoPrompt({ persona, user: basePrompt });
  let rawResponse = '';

  if (process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
          generationConfig: { temperature: 0.75, responseMimeType: 'application/json' },
        }),
      }
    );
    const data = await res.json();
    rawResponse = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
  } else {
    throw new Error('No AI provider configured. Set GEMINI_API_KEY.');
  }

  // 3. Parse response
  const post = parseBlogResponse(rawResponse);
  post.sections = (post.sections || []).map(s => ({
    ...s,
    body: stripHtmlTags(String(s.body || '')),
  }));

  // 4. Fetch featured image from Pexels
  let featuredImageUrl = null;
  try {
    const keyword = post.featuredImageKeyword || input.topic;
    const images  = await searchPexels(keyword, { orientation: 'landscape', perPage: 5 });
    featuredImageUrl = images?.[0]?.src?.large || images?.[0]?.src?.medium || null;
    post.featuredImageUrl = featuredImageUrl;
    post.featuredImageCredit = images?.[0]?.photographer || 'Pexels';
  } catch {}

  // 5. Build HTML
  const html = buildBlogHtml(post);

  // 6. Publish to platform(s)
  const publishResults = [];
  const platforms = input.platforms || [];

  for (const platform of platforms) {
    try {
      let result;
      if (platform.type === 'wordpress')   result = await publishToWordPress(post, platform, featuredImageUrl);
      else if (platform.type === 'ghost')       result = await publishToGhost(post, platform, featuredImageUrl);
      else if (platform.type === 'webflow')     result = await publishToWebflow(post, platform, featuredImageUrl);
      else if (platform.type === 'digifusion')  result = await publishToDigiFusion(post, platform, html);
      if (result) publishResults.push(result);
    } catch (err) {
      publishResults.push({ platform: platform.type, error: err.message });
    }
  }

  // 7. Save to Supabase database
  let dbResult = null;
  try {
    const { createPost } = await import('./supabaseClient.js');
    const slug = post.slug || input.topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);

    const wordCount = (post.sections || []).reduce((sum, s) => sum + (s.body || '').split(/\s+/).length, 0);

    dbResult = await createPost({
      title: post.title || input.topic,
      slug,
      excerpt: post.excerpt || '',
      content: html,
      postType: input.postType || 'guide',
      metaDescription: post.metaDescription || '',
      focusKeyword: post.focusKeyword || input.seoKeyword || '',
      featuredImageUrl: featuredImageUrl,
      featuredImageCredit: post.featuredImageCredit,
      socialCaption: post.socialCaption || '',
      linkedinCaption: post.linkedinCaption || '',
      categories: post.categories || [],
      tags: post.tags || [],
      authorName: input.author || 'DigiFusion Team',
      readingTimeMinutes: post.readingTimeMinutes || Math.max(1, Math.round(wordCount / 200)),
      wordCount,
      status: 'draft', // Always start as draft
    });
  } catch (err) {
    console.error('[BlogPublisher] Failed to save to database:', err.message);
  }

  return {
    post,
    html,
    dbResult:      dbResult?.data || null,
    publishResults,
    persona:       personaBylineMeta(persona),
    socialCaptions: {
      twitter:  post.socialCaption   || '',
      linkedin: post.linkedinCaption || '',
    },
    seo: {
      title:           post.title,
      metaDescription: post.metaDescription,
      slug:            post.slug,
      focusKeyword:    post.focusKeyword,
      readingTime:     post.readingTimeMinutes,
    },
  };
}
