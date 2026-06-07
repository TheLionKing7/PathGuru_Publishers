/**
 * PathGuru — Content Advocate Skill Pack
 *
 * Expert voice for blog derivatives and Aether production.
 * Framework truth lives in firmFrameworks.js — not invented here.
 */

import {
  FIRM_IP_FRAMEWORKS,
  getFrameworkById,
  buildFrameworksListBlock,
} from './firmKnowledge.js';

export { FIRM_IP_FRAMEWORKS, getFrameworkById };

/** Phrases that signal generic AI copy — never appear in published output. */
export const AI_FLUFF_BAN_LIST = [
  'delve', 'tapestry', 'multifaceted', 'game-changer', 'game-changing',
  'revolutionary', 'revolutionizing', 'in today\'s fast-paced world',
  'in the ever-evolving landscape', 'it\'s important to note',
  'at the end of the day', 'unlock the power', 'unlocking the power',
  'harness the power', 'synergy', 'paradigm shift', 'cutting-edge',
  'beacon of hope', 'giant leap', 'welcome to a world where',
  'imagine a world where', 'dive deep', 'navigate the complexities',
  'robust solution', 'holistic approach', 'seamlessly integrate',
  'transformative journey', 'empower', 'elevate your',
];

/**
 * Validate write-blog input — derivatives require IP lineage.
 * Nexus-orchestrated posts pass researchBrief from Orion automatically.
 */
export function validateBlogDerivativeInput({ researchBrief, playbookSlug, force = false }) {
  if (force) return { ok: true };
  const hasBrief    = typeof researchBrief === 'string' && researchBrief.trim().length >= 120;
  const hasPlaybook = typeof playbookSlug === 'string' && playbookSlug.trim().length >= 2;
  if (hasBrief || hasPlaybook) return { ok: true };
  return {
    ok:    false,
    error: 'Blog derivatives require IP lineage: pass researchBrief (Orion output, 120+ chars) or playbookSlug. Boss override: force=true.',
  };
}

export function buildContentAdvocateSystemBlock() {
  const bans = AI_FLUFF_BAN_LIST.slice(0, 20).map(b => `"${b}"`).join(', ');
  return [
    'You are a globally rated expert practitioner — not an AI assistant, not a content mill.',
    'Your reader is a senior operator who will close the tab at the first generic sentence.',
    '',
    'VOICE CONTRACT:',
    '— Write like a founder or practice lead who has done the work, lost deals, fixed systems, and shipped.',
    '— Open with a specific observation, number, or contrarian truth — never a definition or rhetorical question.',
    '— Every claim is evidenced or explicitly framed as professional opinion.',
    '— Human-centric: name the reader\'s situation, the cost of inaction, and one action they can take today.',
    '— Teasers reveal insight, not paid playbook internals.',
    '',
    'BANNED:', bans,
    '— Fake quotes from unnamed officials or generic "experts say".',
    '',
    'DIGIFUSION FIVE PROPRIETARY IP FRAMEWORKS:',
    buildFrameworksListBlock(),
  ].join('\n');
}

export function buildContentAdvocateUserBlock(opts = {}) {
  const {
    researchBrief = '',
    playbookTitle = '',
    playbookExcerpt = '',
    frameworkId = '',
    derivativeGoal = 'THINK — consideration-stage teaser that earns trust without giving away paid IP',
  } = opts;

  const framework = frameworkId ? getFrameworkById(frameworkId) : null;
  const parts = [
    '## Content Advocate — Expert Production Brief',
    `Derivative goal: ${derivativeGoal}`,
  ];

  if (framework) parts.push(`Primary framework lens: ${framework.name}`);

  if (playbookTitle || playbookExcerpt) {
    parts.push('', '## Source Playbook (derivative only)', '');
    if (playbookTitle) parts.push(`Title: ${playbookTitle}`);
    if (playbookExcerpt) parts.push(`Excerpt:\n${playbookExcerpt.slice(0, 2500)}`);
  }

  if (researchBrief?.trim()) {
    parts.push('', '## Orion Research Brief (ground truth)', '');
    parts.push(researchBrief.slice(0, 4000));
  }

  parts.push('', 'No AI vocabulary. End with one concrete next step for the reader.');
  return parts.join('\n');
}

export function injectAdvocateIntoBlogPrompt(basePrompt, opts = {}) {
  return `${buildContentAdvocateUserBlock(opts)}\n\n---\n\n${basePrompt}`;
}
