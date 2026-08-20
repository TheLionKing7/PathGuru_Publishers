/**
 * Run:  node pathguru-webhook/src/index.test.mjs
 *
 * Confirms the Worker's enqueue treats a 409 from the (kind, dedupe_key) unique
 * index as success for the new outbound_sent kind — so a Make retry of the same
 * confirmation never becomes a second write.
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import { enqueue } from './index.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };
const row = { kind: 'outbound_sent', dedupe_key: '7f0f0f0f-0000-0000-0000-000000000001', raw_body: '{"id":"7f0f0f0f-0000-0000-0000-000000000001","providerMessageId":"zoho-123"}' };

console.log('— outbound_sent dedupe at the edge —');

globalThis.fetch = async () => new Response('', { status: 409 });
const dup = await enqueue(env, row);
t('409 dedupe is treated as success', dup.ok === true && dup.duplicate === true);

globalThis.fetch = async () => new Response('', { status: 201 });
const ok = await enqueue(env, row);
t('2xx insert is treated as success', ok.ok === true && !ok.duplicate);

globalThis.fetch = async () => new Response('boom', { status: 500 });
const err = await enqueue(env, row);
t('5xx is not success', err.ok === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
