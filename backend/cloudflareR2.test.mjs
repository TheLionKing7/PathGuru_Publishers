/**
 * Run:  node backend/cloudflareR2.test.mjs
 *
 * Verifies R2 object keys are percent-encoded once, with the AWS Signature V4
 * canonical-URI rules — the same encoded string the request URL carries and the
 * signature is computed over. The key under test contains a space, an ampersand
 * and an em dash; the closing block covers the SigV4-critical characters that
 * encodeURIComponent leaves raw.
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import { encodeKey } from './cloudflareR2.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

const key = 'knowledge/media/See, Think, Do & Care — A Content Focused Business Framework _ by Allan Baptista _ Medium.pdf';
const encoded = encodeKey(key);

console.log('— space, ampersand, em dash —');
t('preserves / separators', encoded.split('/').length === key.split('/').length);
t('encodes spaces and commas', encoded.includes('See%2C%20Think%2C%20Do'));
t('encodes the ampersand as %26', encoded.includes('%26%20Care'));
t('encodes the em dash as %E2%80%94', encoded.includes('%E2%80%94'));
t('does not double-encode (no %25)', !encoded.includes('%25'));
t('leaves underscores unencoded', encoded.includes('Business%20Framework%20_%20by'));

console.log('— SigV4 characters encodeURIComponent leaves raw —');
t('encodes ! as %21', encodeKey('a!b') === 'a%21b');
t('encodes * as %2A', encodeKey('a*b') === 'a%2Ab');
t("encodes ' as %27", encodeKey("a'b") === 'a%27b');
t('encodes ( as %28', encodeKey('a(b') === 'a%28b');
t('encodes ) as %29', encodeKey('a)b') === 'a%29b');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
