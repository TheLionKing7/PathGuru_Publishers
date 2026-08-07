import assert from 'node:assert/strict';
import { check, clientIp, enforce, POLICIES, _reset, _size } from './rateLimit.js';

let n = 0;
const ok = (l, f) => { _reset(); f(); n += 1; console.log(`  ok  ${l}`); };
console.log('\nrateLimit\n');

ok('admits up to the limit then refuses', () => {
  const { limit } = POLICIES.chat;
  for (let i = 0; i < limit; i++) {
    assert.equal(check('chat', '1.1.1.1').allowed, true, `refused at request ${i + 1}`);
  }
  const over = check('chat', '1.1.1.1');
  assert.equal(over.allowed, false);
  assert.ok(over.retryAfterSec > 0, 'a 429 without Retry-After is a dead end for the caller');
});

ok('buckets are per IP — one abuser does not lock out everyone', () => {
  for (let i = 0; i < POLICIES.chat.limit; i++) check('chat', '1.1.1.1');
  assert.equal(check('chat', '1.1.1.1').allowed, false);
  assert.equal(check('chat', '2.2.2.2').allowed, true, 'a second visitor was blocked by the first');
});

ok('buckets are per endpoint — burning chat does not block lead capture', () => {
  for (let i = 0; i < POLICIES.chat.limit; i++) check('chat', '1.1.1.1');
  assert.equal(check('chat', '1.1.1.1').allowed, false);
  assert.equal(check('lead', '1.1.1.1').allowed, true);
});

ok('the window resets and the visitor is admitted again', () => {
  const t0 = 1_000_000;
  for (let i = 0; i < POLICIES.chat.limit; i++) check('chat', '1.1.1.1', t0);
  assert.equal(check('chat', '1.1.1.1', t0).allowed, false);
  const later = t0 + POLICIES.chat.windowMs + 1;
  assert.equal(check('chat', '1.1.1.1', later).allowed, true);
});

ok('an unknown bucket fails OPEN — a route typo must not take the site down', () => {
  assert.equal(check('nonsense', '1.1.1.1').allowed, true);
});

ok('expired buckets are swept rather than accumulating forever', () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 50; i++) check('chat', `10.0.0.${i}`, t0);
  assert.equal(_size(), 50);
  // Re-checking one key well past its window replaces it rather than adding.
  check('chat', '10.0.0.0', t0 + POLICIES.chat.windowMs + 1);
  assert.ok(_size() <= 50, `table grew to ${_size()}`);
});

ok('clientIp takes the leftmost forwarded entry, then falls back', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } }), '9.9.9.9');
  assert.equal(clientIp({ headers: { 'x-real-ip': '8.8.8.8' } }), '8.8.8.8');
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '7.7.7.7' } }), '7.7.7.7');
  assert.equal(clientIp({ headers: {} }), 'unknown');
  assert.equal(clientIp(undefined), 'unknown');
});

ok('enforce writes a 429 with Retry-After and tells the caller to stop', () => {
  const headers = {};
  let status = null, body = null;
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    writeHead: (s) => { status = s; },
    end: (b) => { body = b; },
  };
  const req = { headers: { 'x-forwarded-for': '3.3.3.3' } };

  for (let i = 0; i < POLICIES.chat.limit; i++) {
    assert.equal(enforce('chat', req, res), false, `stopped early at ${i + 1}`);
  }
  assert.equal(enforce('chat', req, res), true, 'did not signal stop when over limit');
  assert.equal(status, 429);
  assert.ok(headers['Retry-After']);
  assert.equal(headers['X-RateLimit-Limit'], String(POLICIES.chat.limit));
  assert.match(String(body), /Too many requests/);
});

console.log(`\n${n} checks passed\n`);
