/**
 * Run:  node backend/skills/inboundEmailPipeline.test.mjs
 *
 * Verifies the three-stage inbound-email pipeline helpers: category routing,
 * grounded-composition prompt, and the 120-word first-touch cap.
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import {
  CLASSIFICATION_CATEGORIES,
  shouldDraft,
  enforceWordCap,
  findUngroundedClaims,
  buildDraftPrompt,
  buildClassificationPrompt,
  loadCapabilityCorpus,
} from './inboundEmailPipeline.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

console.log('— category routing —');
t('client_enquiry drafts', shouldDraft('client_enquiry') === true);
t('partner_approach drafts', shouldDraft('partner_approach') === true);
t('not_a_fit drafts a decline', shouldDraft('not_a_fit') === true);
t('vendor_pitch does not draft', shouldDraft('vendor_pitch') === false);
t('recruiter does not draft', shouldDraft('recruiter') === false);
t('newsletter does not draft', shouldDraft('newsletter') === false);
t('notification does not draft', shouldDraft('notification') === false);
t('support does not draft', shouldDraft('support') === false);
t('other does not draft', shouldDraft('other') === false);
t('all 9 categories present', CLASSIFICATION_CATEGORIES.length === 9);

console.log('— grounded composition (no capability match → question, not claim) —');
const corpus = loadCapabilityCorpus();
const prompt = buildDraftPrompt(
  { from: 'prospect@example.com', to: 'hello@digitafusion.com', subject: 'ERP build', body: 'Can you build us a custom ERP?' },
  { senderName: 'Ann', organisation: 'ACME', statedNeed: 'build us a custom ERP', timelineSignal: '', budgetSignal: '', referralSource: '' },
  corpus,
);
t('prompt embeds the capability corpus', prompt.includes('CAPABILITY CORPUS'));
t('prompt instructs ask-a-question over claim', /ask a question instead of making a claim/i.test(prompt));
t('prompt forbids pricing/scope/timeline', /Never state pricing, scope, or timeline/i.test(prompt));

// A draft that asserts an absent capability is flagged as ungrounded.
const ungrounded = findUngroundedClaims('We build AI/ML-driven recommendation systems for you.', corpus);
t('ungrounded capability language is flagged', ungrounded.length > 0 && ungrounded.some((u) => u.ungrounded.includes('ai')));

// A draft that only asks a question is not flagged.
const grounded = findUngroundedClaims('Could you tell me more about what you need?', corpus);
t('question-only draft is not flagged', grounded.length === 0);

// not_a_fit → a polite decline, not an engagement + FrictionIQ next step.
const decline = buildDraftPrompt(
  { from: 'bob@example.com', to: 'hello@digitafusion.com', subject: 'Bakery order', body: 'Can you bake 500 cakes for Friday?' },
  { senderName: 'Bob', organisation: 'Bakery Co', statedNeed: 'bake 500 cakes', timelineSignal: '', budgetSignal: '', referralSource: '' },
  corpus,
  'not_a_fit',
);
t('not_a_fit prompt declines rather than engages', /decline it briefly/i.test(decline) && !/propose ONE concrete next step/.test(decline));

// Classification prompt carries the new category + firm context for fit judgement.
const clsPrompt = buildClassificationPrompt({ from: 'a@b.com', subject: 's', body: 'b' }, corpus);
t('classification prompt lists not_a_fit', clsPrompt.includes('not_a_fit'));
t('classification prompt embeds firm context', clsPrompt.includes('FIRM CONTEXT'));

console.log('— 120-word cap —');
const under = 'Thank you for reaching out. What outcome are you hoping to measure?';
const over = Array(130).fill('word').join(' ');

const ok = await enforceWordCap(under, () => 'should not run');
t('under cap is untouched', ok.regenerated === false && ok.flagged === false && ok.draftBody === under);

const compliant = await enforceWordCap(over, () => under);
t('over cap regenerates once to compliant', compliant.regenerated === true && compliant.flagged === false && compliant.draftBody === under);

const stillOver = await enforceWordCap(over, () => over);
t('over cap after one regeneration is flagged', stillOver.regenerated === true && stillOver.flagged === true);

const noRegen = await enforceWordCap(over, null);
t('over cap with no regenerate fn is flagged', noRegen.flagged === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
