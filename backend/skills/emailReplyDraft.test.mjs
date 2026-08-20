/**
 * Run:  node backend/skills/emailReplyDraft.test.mjs
 *
 * Verifies the email-reply draft guard strips internal agent/network names and
 * appends the human signature (REPLY_SIGNATURE) rather than letting the model
 * sign as itself.
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import {
  REPLY_SIGNATURE,
  INTERNAL_NAMES,
  stripInternalNames,
  finalizeEmailDraft,
} from './emailReplyDraft.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

console.log('— email reply draft guard —');

const raw = 'Thank you for your enquiry. We will be in touch shortly.\n\nBest regards, Nexus';
const out = finalizeEmailDraft(raw);

t('signature is appended', out.includes(REPLY_SIGNATURE));
t('draft ends with the signature', out.endsWith(REPLY_SIGNATURE));
t('no internal names remain', INTERNAL_NAMES.every((name) => !out.toLowerCase().includes(name.toLowerCase())));
t('the Nexus sign-off line was stripped', !out.includes('Nexus'));

const stripped = stripInternalNames(raw);
t('stripInternalNames removes the offending line', !stripped.toLowerCase().includes('nexus'));
t('stripInternalNames does not append a signature', !stripped.includes(REPLY_SIGNATURE));

const clean = finalizeEmailDraft('We will be in touch shortly.');
t('clean draft gets signature appended', clean.endsWith(REPLY_SIGNATURE));

t('null passthrough', finalizeEmailDraft(null) === null);
t('empty passthrough', finalizeEmailDraft('') === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
