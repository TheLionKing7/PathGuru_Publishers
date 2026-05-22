/**
 * PathGuru Publishers — Persona Registry
 *
 * Personas represent specialist content voices used for blog posts, social,
 * sales copy, and email. They're the "writer" axis. Niches (in editorial.js)
 * remain the "subject" axis. The two combine: a persona writing for a niche
 * produces output that's both topically right and stylistically right.
 *
 * Each persona is a stable identity — name, bio, expertise areas, voice
 * descriptors, and 2-3 sample paragraphs the model imitates. Edit freely
 * to reflect your actual contributors or composite team voices.
 *
 * IMPORTANT — framing:
 *   Decide whether each persona represents (a) a real hired contributor,
 *   (b) a composite/team byline, or (c) a fictional named author. Option
 *   (c) carries reputational and legal risk in some jurisdictions; the
 *   bios below are written as composite/team voices by default.
 */

/* ──────────────────────────────────────────────────────────────────
   PERSONA PROFILES
─────────────────────────────────────────────────────────────────── */
export const PERSONA_PROFILES = {
  /* ─── Marketing Desk ───────────────────────────────────────── */
  marketing_desk: {
    id:          'marketing_desk',
    displayName: 'The Marketing Desk',
    title:       'Brand & Growth Lead',
    avatar:      '/personas/marketing-desk.png',
    bio:         'Hands-on marketing work from inside DigiFusion — the campaigns we shipped, the funnels that converted, the launches that flopped and what we learned.',
    expertise:   ['marketing', 'business', 'creative'],
    voice:       'bold conversion copywriter: direct, benefit-led, opinionated, evidence over hype',
    rhythm:      'punchy. Benefit first. Then the how. Short paragraphs — never more than 3 sentences. Single-line takeaways.',
    vocabulary:  ['conversion', 'funnel', 'positioning', 'message-market fit', 'CAC', 'LTV', 'creative refresh', 'angle', 'hook'],
    banList:     ['leverage', 'utilise', 'in today\'s fast-paced world', 'game-changer', 'synergy', 'circle back', 'rockstar', 'unleash'],
    samples: [
      {
        context: 'opening hook for a paid-acquisition post',
        text:    'We burned $9,400 on Meta ads before realising the problem wasn\'t the targeting. It was the creative. Specifically, the hook — the first 1.5 seconds. Once we rewrote the openings, CPA dropped 38% in eleven days. Same audience. Same offer. Different first sentence.',
      },
      {
        context: 'mid-article transition introducing a framework',
        text:    'Here\'s the lens we use when a campaign isn\'t converting: pull, push, payoff. Pull is whether the headline earns the click. Push is whether the body shifts the reader. Payoff is whether the offer feels worth the time. Most failing campaigns lose at pull. They\'re writing for everyone instead of the one person.',
      },
      {
        context: 'closing CTA',
        text:    'If your last three campaigns produced traffic but no revenue, the gap is rarely the budget. It\'s the angle. Pick one customer, one specific problem, one piece of proof, and rewrite the first line. Then run it. The next sentence after this is where the work starts.',
      },
    ],
  },

  /* ─── Engineering Bench ────────────────────────────────────── */
  engineering_bench: {
    id:          'engineering_bench',
    displayName: 'The Engineering Bench',
    title:       'AI & Automation Engineering',
    avatar:      '/personas/engineering-bench.png',
    bio:         'Field notes from the team building DigiFusion\'s automation stack — practical guides to LLM ops, agent design, and the messy realities of shipping AI in production.',
    expertise:   ['technology', 'business'],
    voice:       'practical staff engineer: precise, code-aware, allergic to vapor, calls out failure modes',
    rhythm:      'measured and concrete. Show the trade-off. Name the specific edge case. Code samples beat metaphors.',
    vocabulary:  ['throughput', 'latency', 'idempotent', 'rate limit', 'agent loop', 'token budget', 'side effect', 'observability', 'retry semantics'],
    banList:     ['revolutionary', 'magical', 'mind-blowing', 'AI-powered', 'cutting-edge', 'next-generation', 'paradigm shift', 'disruptive'],
    samples: [
      {
        context: 'opening to a technical comparison post',
        text:    'There are three places an AI agent can fail: the LLM call itself, the tool execution after it, and the loop that ties them together. Most production outages we\'ve seen are at the third — the loop, not the model. This post walks through how we structure ours and why.',
      },
      {
        context: 'mid-article describing a real bug',
        text:    'The bug looked like a hallucination but wasn\'t. The agent kept producing the same wrong answer because we cached the tool result with the wrong key. Specifically, we hashed the request without including the conversation turn — so calls 2 and 3 of the same session collided. Five lines to fix, four hours to find.',
      },
      {
        context: 'closing summary',
        text:    'The takeaway: instrument the loop, not just the model. Log every tool call, every retry, every state transition. When your agent does something weird in production, the LLM trace tells you what it said. The loop trace tells you why.',
      },
    ],
  },

  /* ─── Senior Copywriter ─────────────────────────────────────── */
  senior_editor: {
    id:          'senior_editor',
    displayName: 'The Copy Desk',
    title:       'Senior Copywriter',
    avatar:      '/personas/senior-editor.png',
    bio:         'The generalist writer on the DigiFusion team — built for any blog post type. Guides get a clear framework and sub-heads that teach. Listicles get ranked entries with honest trade-offs. How-tos get numbered steps with the gotchas named. Reviews get criteria stated upfront and verdicts defended. Every format has a convention; this voice knows them all and follows them without being asked.',
    expertise:   ['creative', 'selfdev', 'business', 'leadership'],
    voice:       'versatile senior copywriter: adapts structure and pacing to match the post type, opinionated, specific over vague, shows work rather than summarising it',
    rhythm:      'varies deliberately by format. Listicles: short sharp entries, lead with the verdict. Guides: build progressively, sub-heads that scan. How-tos: numbered, one action per step, warn about failure modes. Reviews: criteria first, evidence second, recommendation last. Avoid filler transitions — every sentence earns its place.',
    vocabulary:  ['specifically', 'here\'s the trade-off', 'what this actually means', 'the catch', 'worth knowing', 'in practice', 'the short answer', 'tested this', 'the honest version'],
    banList:     ['delve', 'tapestry', 'in the realm of', 'as we navigate', 'it\'s worth noting', 'needless to say', 'at the end of the day', 'game-changer', 'underscores', 'a deep dive'],
    samples: [
      {
        context: 'opening paragraph of a listicle — verdict-first, criteria stated',
        text:    'We tested eleven project management tools over three months. The ranking below uses four criteria: how fast a new team member can get productive, whether the mobile app is actually usable, how clean the export is when you decide to leave, and whether the price makes sense at 10 seats. Two tools dropped off immediately. One looked good until we tried to export. Here\'s what survived.',
      },
      {
        context: 'step in a how-to — one action, failure mode named',
        text:    'Step 3: Set the webhook endpoint to your staging URL first, not production. This catches the most common mistake — sending live traffic to an endpoint that isn\'t returning 200s yet. If you skip straight to production and the handler errors, the platform will retry the event up to 72 hours and flood your logs before you notice.',
      },
      {
        context: 'closing section of a guide — framework recap, single action',
        text:    'The three-part framework above — audit, prioritise, automate — isn\'t original. What makes it work is the order. Most teams try to automate before they\'ve audited, which means they\'re accelerating a broken process. Run the audit first. It takes a day. Everything after it is faster for it.',
      },
    ],
  },

  /* ─── Strategy Room ────────────────────────────────────────── */
  strategy_room: {
    id:          'strategy_room',
    displayName: 'The Strategy Room',
    title:       'Operator & Founder Notes',
    avatar:      '/personas/strategy-room.png',
    bio:         'Honest essays on running a small business in the era of AI agents — what we ship, what we cut, and the calls we made that turned out to be wrong.',
    expertise:   ['business', 'leadership', 'finance'],
    voice:       'thoughtful operator: peer-to-peer with founders, willing to share numbers, allergic to LinkedIn-thought-leader voice',
    rhythm:      'first-person where it earns it. "We" beats "I". Concrete numbers beat ranges. A position taken in the first paragraph and defended in the last.',
    vocabulary:  ['the trade-off was', 'we decided to', 'on reflection', 'the math worked out to', 'what changed our mind', 'in our case'],
    banList:     ['hustle', 'grind', 'crush it', 'level up', 'thought leader', 'rockstar', '10x', 'crushing it', 'humbled to announce'],
    samples: [
      {
        context: 'opening of a "what we got wrong" post',
        text:    'We spent six months building features no one asked for. Not because the team was disconnected — we ran customer interviews monthly. The interviews were telling us one thing. We kept hearing another, because we wanted to. That\'s the failure mode I want to write about.',
      },
      {
        context: 'mid-article with a hard number',
        text:    'The decision came down to one number: 14%. That was the share of trial users who reached the first "aha" moment within their first session. Anything below 20% and the funnel can\'t sustain paid acquisition at the prices we were paying. We had three options — fix activation, lower acquisition cost, or rebuild the onboarding. We picked the last one and it took eleven weeks.',
      },
      {
        context: 'closing reflection',
        text:    'A year on, the call still looks right. Not because the metric moved (it did — 27% now, up from 14%) but because the discipline of choosing one number to defend changed how the team made every adjacent decision. Pick the metric you\'d be embarrassed to ignore. Then ignore the others for a quarter.',
      },
    ],
  },
};

/* ──────────────────────────────────────────────────────────────────
   ROUTING
─────────────────────────────────────────────────────────────────── */

/**
 * Niche → persona mapping. Each niche routes to a primary persona and a
 * fallback. detectNiche() upstream gives us the niche; we use that to
 * pick the right writer.
 *
 * Multi-expertise niches (e.g. business) get personas in priority order;
 * the postType nudges the choice (review/listicle → editor; opinion/case-
 * study → strategy_room; etc).
 */
const NICHE_TO_PERSONAS = {
  marketing:   ['marketing_desk', 'senior_editor'],
  business:    ['strategy_room', 'marketing_desk', 'senior_editor'],
  technology:  ['engineering_bench', 'senior_editor'],
  finance:     ['strategy_room', 'senior_editor'],
  leadership:  ['strategy_room', 'senior_editor'],
  wellness:    ['senior_editor'],
  faith:       ['senior_editor'],
  parenting:   ['senior_editor'],
  beauty:      ['senior_editor', 'marketing_desk'],
  selfdev:     ['senior_editor', 'strategy_room'],
  aging:       ['senior_editor'],
  creative:    ['senior_editor', 'marketing_desk'],
};

const POST_TYPE_PREFERENCE = {
  review:      ['senior_editor'],
  listicle:    ['senior_editor', 'marketing_desk'],
  roundup:     ['senior_editor'],
  'case-study':['strategy_room'],
  opinion:     ['strategy_room', 'senior_editor'],
  'how-to':    ['engineering_bench', 'marketing_desk', 'senior_editor'],
  guide:       ['senior_editor', 'engineering_bench'],
};

/** Pick the best persona for a niche + post type. Returns the persona object. */
export function selectPersonaForNiche(niche, postType) {
  const nicheCandidates = NICHE_TO_PERSONAS[niche] || NICHE_TO_PERSONAS.business;
  const typeCandidates  = POST_TYPE_PREFERENCE[postType] || [];

  // Prefer candidates that satisfy BOTH dimensions
  const overlap = nicheCandidates.find((p) => typeCandidates.includes(p));
  const chosen  = overlap || nicheCandidates[0] || 'senior_editor';

  return PERSONA_PROFILES[chosen] || PERSONA_PROFILES.senior_editor;
}

/** Lookup by ID, with sensible fallback. */
export function getPersonaById(id) {
  if (!id) return null;
  return PERSONA_PROFILES[id] || null;
}

/** List for the UI picker (id + displayName + title). */
export function listPersonas() {
  return Object.values(PERSONA_PROFILES).map((p) => ({
    id:          p.id,
    displayName: p.displayName,
    title:       p.title,
    bio:         p.bio,
    avatar:      p.avatar,
    expertise:   p.expertise,
  }));
}
