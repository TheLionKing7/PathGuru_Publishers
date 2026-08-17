/**
 * Run:  node backend/http/operatorAuth.test.mjs
 *
 * No framework, no dependency, exits non-zero on failure. The allowlist block
 * is the one that matters: it is the difference between a gate and a comment,
 * and it should be re-run every time a route is added.
 */
import { randomBytes } from 'node:crypto';

/* Generated per run, never written down.
 *
 * This used to be a hardcoded string, and a secret scanner blocked the commit —
 * correctly. A literal that looks like a password is a password as far as any
 * scanner, any grep of the history, and any future reader is concerned, and
 * "it was only a test fixture" is what everyone says about the credential that
 * leaked. Generating it means there is nothing to leak and nothing to explain.
 */
const TEST_PASSWORD = randomBytes(24).toString('base64url');
process.env.PATHGURU_OPERATOR_PASSWORD = TEST_PASSWORD;
const A = await import('./operatorAuth.js');

const req = (headers = {}) => ({ headers });
let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

console.log('— configuration —');
t('reports configured', A.isOperatorAuthConfigured() === true);

console.log('— password —');
t('correct password accepted', A.checkPassword(TEST_PASSWORD));
t('wrong password rejected', !A.checkPassword('wrong'));
t('empty password rejected', !A.checkPassword(''));
t('prefix of password rejected', !A.checkPassword(TEST_PASSWORD.slice(0, 8)));

console.log('— sessions —');
const tok = A.issueSession();
t('issues a token', typeof tok === 'string' && tok.split('.').length === 3);
t('verifies its own token', A.verifySession(tok));
t('rejects a tampered mac', !A.verifySession(tok.slice(0, -3) + 'aaa'));
t('rejects a forged expiry', !A.verifySession(`${Date.now() + 9e9}.${tok.split('.')[1]}.${tok.split('.')[2]}`));
t('rejects garbage', !A.verifySession('nonsense'));
t('rejects empty', !A.verifySession(''));
const [, nonce, mac] = tok.split('.');
t('rejects an expired but correctly-shaped token', !A.verifySession(`${Date.now() - 1000}.${nonce}.${mac}`));

console.log('— request verification —');
t('no credentials rejected', !A.verifyOperator(req()));
t('valid cookie accepted', A.verifyOperator(req({ cookie: `pg_operator=${encodeURIComponent(tok)}` })));
t('cookie among others accepted', A.verifyOperator(req({ cookie: `a=1; pg_operator=${encodeURIComponent(tok)}; b=2` })));
t('wrong cookie name rejected', !A.verifyOperator(req({ cookie: `other=${tok}` })));
t('bearer without token env rejected', !A.verifyOperator(req({ authorization: 'Bearer anything' })));

console.log('— the allowlist —');
const mustBePublic = ['/ping','/health','/api/cron/ping','/api/platform/config','/api/auth/login',
  '/api/auth/status','/api/agents/status','/api/webhooks/whatsapp','/api/bookings/calendly-webhook',
  '/api/newsletter/unsubscribe','/api/cron/nurture','/index.html','/js/core/shell.js','/css/style.css','/',
  '/api/queue/drain','/api/outbound/approved','/api/outbound/abc-123/sent'];
for (const p of mustBePublic) t(`public: ${p}`, A.isPublicPath(p));

const mustBeGated = ['/api/frictioniq/sessions','/api/frictioniq/session','/api/clients','/api/invoices',
  '/api/purchases','/api/agents/leads','/api/shop/orders','/api/blog','/api/posts','/api/engagements',
  '/api/funnel/capture','/api/media/upload','/api/agents/nexus/orchestrate'];
for (const p of mustBeGated) t(`gated: ${p}`, !A.isPublicPath(p));

console.log('— fail closed —');
delete process.env.PATHGURU_OPERATOR_PASSWORD;
const B = await import('./operatorAuth.js?fresh=1');
t('unconfigured reports so', B.isOperatorAuthConfigured() === false);
t('unconfigured rejects every request', !B.verifyOperator(req({ cookie: `pg_operator=${tok}` })));
t('unconfigured cannot issue a session', B.issueSession() === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
