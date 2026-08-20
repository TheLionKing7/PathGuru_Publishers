/**
 * Run:  node backend/skills/inboundEmail.test.mjs
 *
 * Verifies the outbound route auth accepts EITHER the HMAC signature OR an
 * Authorization bearer token (MAKE_OUTBOUND_TOKEN), and that the bearer path
 * fails closed when the token is unset.
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import { createHmac } from 'node:crypto';
import { verifyOutboundAuth, normaliseAddress } from './inboundEmail.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

const hmac = (secret, msg) => createHmac('sha256', secret).update(msg).digest('hex');
const ts = String(Math.floor(Date.now() / 1000));
const path = '/api/outbound/approved';
const validSig = hmac('inbound-secret', `${ts}.GET.${path}`);

process.env.INBOUND_WEBHOOK_SECRET = 'inbound-secret';
process.env.MAKE_OUTBOUND_TOKEN = 'make-token';

console.log('— outbound auth (HMAC OR bearer) —');
t('bearer valid accepted', verifyOutboundAuth({ authorization: 'Bearer make-token', timestamp: null, signature: null, method: 'GET', path }));
t('bearer wrong rejected', !verifyOutboundAuth({ authorization: 'Bearer nope', timestamp: null, signature: null, method: 'GET', path }));
t('valid HMAC accepted when bearer absent', verifyOutboundAuth({ authorization: null, timestamp: ts, signature: validSig, method: 'GET', path }));
t('both absent rejected', !verifyOutboundAuth({ authorization: null, timestamp: null, signature: null, method: 'GET', path }));

console.log('— bearer fails closed when MAKE_OUTBOUND_TOKEN unset —');
delete process.env.MAKE_OUTBOUND_TOKEN;
t('bearer rejected when token unset', !verifyOutboundAuth({ authorization: 'Bearer make-token', timestamp: null, signature: null, method: 'GET', path }));
t('HMAC still accepted when token unset', verifyOutboundAuth({ authorization: null, timestamp: ts, signature: validSig, method: 'GET', path }));

console.log('— both outbound routes 401 without HMAC or bearer —');
t('GET /api/outbound/approved rejected without auth', !verifyOutboundAuth({ authorization: null, timestamp: null, signature: null, method: 'GET', path: '/api/outbound/approved' }));
t('POST /api/outbound/:id/sent rejected without auth', !verifyOutboundAuth({ authorization: null, timestamp: null, signature: null, method: 'POST', path: '/api/outbound/abc-123/sent' }));

console.log('— address normalisation (sendTo / sendFrom) —');
t('clean address passes through', normaliseAddress('enquiries@digitafusion.com') === 'enquiries@digitafusion.com');
t('display-name wrapper unwrapped', normaliseAddress('Enquiries Desk <enquiries@digitafusion.com>') === 'enquiries@digitafusion.com');
t('literal angle brackets unwrapped', normaliseAddress('<enquiries@digitafusion.com>') === 'enquiries@digitafusion.com');
t('HTML entities decoded then unwrapped', normaliseAddress('&lt;enquiries@digitafusion.com&gt;') === 'enquiries@digitafusion.com');
t('quot entities in display name', normaliseAddress('&quot;Enquiries&quot; &lt;enquiries@digitafusion.com&gt;') === 'enquiries@digitafusion.com');
t('apos + amp entities in display name', normaliseAddress('O&#39;Brien &amp; Co <obrien@example.com>') === 'obrien@example.com');
t('malformed string returns null', normaliseAddress('not-an-address') === null);
t('empty angle brackets return null', normaliseAddress('<>') === null);
t('blank returns null', normaliseAddress('') === null);
t('null input returns null', normaliseAddress(null) === null);
t('undefined input returns null', normaliseAddress(undefined) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
