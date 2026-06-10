/**
 * Predefined author ↔ domain routing for DigiFusion content.
 * Header: first name only (via byline comma split). Footer: full name + position.
 */

export const CONTENT_DOMAINS = {
  business_development: 'Business Development',
  technology:           'System Design & Automation',
  digital_media:        'Digital Media',
};

/** @typedef {'business_development'|'technology'|'digital_media'} ContentDomain */

export const AUTHOR_PROFILES = {
  boroji: {
    id:         'boroji',
    headerName: 'Boroji',
    byline:     'Boroji Adebayo-Hopewell, Founder',
    domains:    ['business_development', 'technology'],
    bio:        'Founder of DigiFusion and Digital Fusion Labs — writing on AI automation, business development, and systems design for operators who need answers, not fluff.',
  },
  kayode: {
    id:         'kayode',
    headerName: 'Kayode',
    byline:     'Kayode, Head of Digital Media',
    domains:    ['digital_media'],
    bio:        'Head of Digital Media at DigiFusion — writing on content-to-capital, audience growth, and digital media strategy for African SMEs.',
  },
  digifusion: {
    id:         'digifusion',
    headerName: 'DigiFusion',
    byline:     'DigiFusion',
    domains:    ['business_development', 'technology', 'digital_media'],
    bio:        'Insights from the DigiFusion team — AI automation, business development, and digital media for growing businesses.',
  },
};

const DOMAIN_KEYWORDS = {
  business_development: /business development|\bbd\b|deal|pipeline|prospect|sales|revenue|cash flow|financ|procurement|sme scale/i,
  technology:           /automation|system design|saas|ai\b|workflow|integrat|architect|tech\b|nova|ave\b/i,
  digital_media:        /digital media|content|marketing|seo|c2c|ads\b|social|brand|audience|media\b|aether/i,
};

/** Infer practice domain from topic, niche, or category text. */
export function inferContentDomain({ topic = '', niche = '', category = '', domain = '' } = {}) {
  const explicit = String(domain || niche || '').toLowerCase().replace(/\s+/g, '_');
  if (explicit === 'bd' || explicit === 'business_development') return 'business_development';
  if (explicit === 'tech' || explicit === 'technology' || explicit === 'automation') return 'technology';
  if (explicit === 'digital_media' || explicit === 'media') return 'digital_media';

  const blob = `${topic} ${category}`.toLowerCase();
  const scores = {
    business_development: 0,
    technology:           0,
    digital_media:        0,
  };
  for (const [key, re] of Object.entries(DOMAIN_KEYWORDS)) {
    if (re.test(blob)) scores[key] += 2;
  }
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (top[1] > 0) return top[0];
  return 'business_development';
}

/**
 * Resolve author from domain rules + optional settings override.
 * @param {object} opts
 * @param {string} [opts.authorId] — force boroji | kayode | digifusion
 * @param {object} [opts.domainAuthors] — map domain → authorId from settings
 */
export function resolveContentAuthor(opts = {}) {
  const {
    topic = '',
    niche = '',
    category = '',
    domain = '',
    authorId = null,
    domainAuthors = null,
  } = opts;

  const contentDomain = inferContentDomain({ topic, niche, category, domain });

  let chosenId = authorId;
  if (!chosenId && domainAuthors?.[contentDomain]) {
    chosenId = domainAuthors[contentDomain];
  }
  if (!chosenId) {
    if (contentDomain === 'digital_media') chosenId = 'kayode';
    else if (contentDomain === 'technology' || contentDomain === 'business_development') chosenId = 'boroji';
    else chosenId = 'digifusion';
  }

  const profile = AUTHOR_PROFILES[chosenId] || AUTHOR_PROFILES.digifusion;

  return {
    ...profile,
    contentDomain,
    domainLabel: CONTENT_DOMAINS[contentDomain] || contentDomain,
    author_name: profile.byline,
  };
}
