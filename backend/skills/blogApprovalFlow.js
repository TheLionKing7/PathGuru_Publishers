/**
 * Blog approval execution — Nexus → Orion → Boss YES → Aether → live publish
 */

import { aether } from '../agents/aether.js';
import { generateAndPublishBlogPost, DEFAULT_BLOG_AUTHOR } from '../blogPublisher.js';

/**
 * After Boss approves via WhatsApp, write and publish the blog to DigiFusion CMS.
 *
 * @param {object} payload — stored on approval task (from Nexus orchestrate blog step)
 */
export async function executeApprovedBlogPublish(payload = {}) {
  const topic = (payload.proposedTitle || payload.topic || '').trim();
  if (!topic) throw new Error('Approved blog payload missing topic / proposedTitle');

  const researchBrief = payload.researchBrief || '';
  const rawContent = await aether.produceContent('blog post', topic, {
    audience:       payload.audience || 'business professionals',
    voiceNotes:     payload.recommendedTone || payload.tone || '',
    callToAction:     payload.ctaGoal || 'Book a free strategy session at digitafusion.com/agency/booking',
    wordCount:        payload.estimatedWordCount || payload.wordCount || 1400,
    stdcStage:        'THINK — consideration and authority-building',
    researchBrief,
    frameworkId:    payload.frameworkId || 'c2c',
  });

  const siteUrl = (process.env.DIGIFUSION_API_URL || 'https://www.digitafusion.com').replace(/\/$/, '');

  const result = await generateAndPublishBlogPost({
    topic,
    audience:       payload.audience,
    tone:           payload.recommendedTone || payload.tone || 'authoritative yet accessible',
    seoKeyword:     payload.seoKeyword || topic,
    niche:          payload.niche || payload.sector || 'digital_media',
    ctaGoal:        payload.ctaGoal,
    aetherContent:  rawContent,
    researchBrief,
    postType:       payload.postType || 'guide',
    author:         payload.author || payload.recommendedAuthor || DEFAULT_BLOG_AUTHOR,
    platforms: [{
      type:    'digifusion',
      status:  'published',
      siteUrl,
    }],
  });

  const slug = result?.publishResults?.[0]?.slug
    || result?.post?.slug
    || result?.dbResult?.slug
    || '';
  const url  = result?.publishResults?.[0]?.url
    || (slug ? `${siteUrl}/blog/${slug}` : null);

  return { ...result, slug, url, topic };
}
