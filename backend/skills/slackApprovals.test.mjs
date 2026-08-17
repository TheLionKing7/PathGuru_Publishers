/**
 * Run:  node backend/skills/slackApprovals.test.mjs
 *
 * Verifies Slack request parsing: Interactivity's urlencoded `payload` field
 * (block_actions) and the Events API's raw JSON body (url_verification), plus
 * that the x-slack-signature is validated over the RAW body in both cases.
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import { createHmac } from 'node:crypto';
import { parseSlackPayload, verifySlackSignature } from './slackApprovals.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

const blockActions = {
  type: 'block_actions',
  user: { id: 'U123', username: 'boss' },
  actions: [{ action_id: 'approve', value: 'task-123' }],
  response_url: 'https://hooks.slack.com/actions/T/B/R',
};
const urlencoded = 'payload=' + encodeURIComponent(JSON.stringify(blockActions));

console.log('— urlencoded block_actions body —');
const fromForm = parseSlackPayload(urlencoded, 'application/x-www-form-urlencoded');
t('parses type block_actions', fromForm && fromForm.type === 'block_actions');
t('parses action_id', fromForm?.actions?.[0]?.action_id === 'approve');
t('parses task id value', fromForm?.actions?.[0]?.value === 'task-123');
t('parses user', fromForm?.user?.username === 'boss');

console.log('— JSON url_verification body —');
const verification = { type: 'url_verification', challenge: 'challenge-abc', token: 'tok-123' };
const fromJson = parseSlackPayload(JSON.stringify(verification), 'application/json');
t('parses type url_verification', fromJson && fromJson.type === 'url_verification');
t('parses challenge', fromJson?.challenge === 'challenge-abc');

console.log('— invalid inputs —');
t('non-JSON payload field → null', parseSlackPayload('payload=not-json', 'application/x-www-form-urlencoded') === null);
t('missing payload field → null', parseSlackPayload('foo=bar', 'application/x-www-form-urlencoded') === null);
t('invalid JSON body → null', parseSlackPayload('not-json', 'application/json') === null);

console.log('— signature stays over the RAW body —');
process.env.SLACK_SIGNING_SECRET = 'test-secret';
const ts = Math.floor(Date.now() / 1000);
const sig = 'v0=' + createHmac('sha256', 'test-secret').update(`v0:${ts}:${urlencoded}`).digest('hex');
t('signature over raw urlencoded body accepted', verifySlackSignature({ rawBody: urlencoded, timestamp: String(ts), signature: sig }));
t('signature over parsed payload rejected', !verifySlackSignature({ rawBody: JSON.stringify(blockActions), timestamp: String(ts), signature: sig }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
