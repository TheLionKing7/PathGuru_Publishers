import worker from './src/index.js';

const enc = new TextEncoder();
async function hmac(alg, secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name:'HMAC', hash:alg }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const hex = b => [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
const b64 = b => btoa(String.fromCharCode(...b));

const env = {
  SUPABASE_URL: 'https://stub.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SLACK_SIGNING_SECRET: 'slack-secret',
  TWILIO_AUTH_TOKEN: 'twilio-token',
  INBOUND_WEBHOOK_SECRET: 'inbound-secret',
  MAKE_INBOUND_TOKEN: 'make-inbound-token',
  RENDER_ORIGIN: 'https://render.example',
};
let inserted = [], woke = 0;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('/rest/v1/webhook_queue')) { inserted.push(JSON.parse(opts.body)); return new Response('', {status:201}); }
  if (String(url).includes('/api/queue/drain')) { woke++; return new Response('{}', {status:200}); }
  throw new Error('unexpected fetch ' + url);
};
const ctx = { waitUntil: p => p.catch(()=>{}) };
const now = () => Math.floor(Date.now()/1000);
const run = (path, body, headers, method='POST') =>
  worker.fetch(new Request('https://w.example'+path, { method, body, headers }), env, ctx);

let pass=0, fail=0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   '+name); pass++; } catch(e){ console.log('  FAIL '+name+' — '+e.message); fail++; } };
const eq = (a,b,m) => { if (a!==b) throw new Error(`${m}: got ${a}, want ${b}`); };

console.log('Slack');
await t('valid block_actions is queued', async () => {
  inserted=[];
  const body = 'payload=' + encodeURIComponent(JSON.stringify({type:'block_actions',actions:[{action_id:'approve',value:'task-1'}]}));
  const ts = String(now());
  const sig = 'v0=' + hex(await hmac('SHA-256','slack-secret',`v0:${ts}:${body}`));
  const r = await run('/webhooks/slack', body, {'x-slack-request-timestamp':ts,'x-slack-signature':sig,'content-type':'application/x-www-form-urlencoded'});
  eq(r.status,200,'status'); eq(inserted.length,1,'inserted'); eq(inserted[0].kind,'slack','kind');
  const j = await r.json(); if(!/Received/.test(j.text)) throw new Error('no interim text');
});
await t('url_verification answers challenge inline, not queued', async () => {
  inserted=[];
  const body = JSON.stringify({type:'url_verification',challenge:'abc123'});
  const ts = String(now());
  const sig = 'v0=' + hex(await hmac('SHA-256','slack-secret',`v0:${ts}:${body}`));
  const r = await run('/webhooks/slack', body, {'x-slack-request-timestamp':ts,'x-slack-signature':sig,'content-type':'application/json'});
  eq((await r.json()).challenge,'abc123','challenge'); eq(inserted.length,0,'must not queue');
});
await t('bad signature rejected, nothing queued', async () => {
  inserted=[];
  const r = await run('/webhooks/slack','payload=x',{'x-slack-request-timestamp':String(now()),'x-slack-signature':'v0=deadbeef'});
  eq(r.status,401,'status'); eq(inserted.length,0,'queued');
});
await t('stale timestamp rejected', async () => {
  const ts = String(now()-600); const body='payload=x';
  const sig = 'v0=' + hex(await hmac('SHA-256','slack-secret',`v0:${ts}:${body}`));
  const r = await run('/webhooks/slack', body, {'x-slack-request-timestamp':ts,'x-slack-signature':sig});
  eq(r.status,401,'status');
});

console.log('Twilio');
await t('valid urlencoded message queued with MessageSid dedupe', async () => {
  inserted=[];
  const body = 'From=whatsapp%3A%2B2347064100000&Body=hello&MessageSid=SM123&To=whatsapp%3A%2B14155238886';
  const p = new URLSearchParams(body);
  let payload = 'https://w.example/webhooks/whatsapp';
  for (const k of [...p.keys()].sort()) payload += k + p.get(k);
  const sig = b64(await hmac('SHA-1','twilio-token',payload));
  const r = await run('/webhooks/whatsapp', body, {'x-twilio-signature':sig,'content-type':'application/x-www-form-urlencoded'});
  eq(r.status,200,'status'); eq(inserted[0].dedupe_key,'SM123','dedupe'); eq(await r.text(),'','body must be empty');
});
await t('wrong twilio signature rejected', async () => {
  inserted=[];
  const r = await run('/webhooks/whatsapp','Body=hi&MessageSid=SM9',{'x-twilio-signature':'bogus'});
  eq(r.status,401,'status'); eq(inserted.length,0,'queued');
});

console.log('Inbound email');
await t('valid HMAC body queued with messageId dedupe', async () => {
  inserted=[];
  const body = JSON.stringify({messageId:'<a@b>',from:'x@y.com',subject:'hi',body:'text'});
  const ts = String(now());
  const sig = hex(await hmac('SHA-256','inbound-secret',body));
  const r = await run('/webhooks/inbound-email', body, {'x-timestamp':ts,'x-signature':sig,'content-type':'application/json'});
  eq(r.status,200,'status'); eq(inserted[0].dedupe_key,'<a@b>','dedupe');
});
await t('missing signature rejected', async () => {
  const r = await run('/webhooks/inbound-email','{}',{'content-type':'application/json'});
  eq(r.status,401,'status');
});
await t('bearer valid accepted', async () => {
  inserted=[];
  const body = JSON.stringify({messageId:'<bearer@x>',from:'x@y.com',subject:'hi',body:'text'});
  const r = await run('/webhooks/inbound-email', body, {'content-type':'application/json','authorization':'Bearer make-inbound-token'});
  eq(r.status,200,'status'); eq(inserted.length,1,'queued'); eq(inserted[0].dedupe_key,'<bearer@x>','dedupe');
});
await t('bearer wrong rejected', async () => {
  inserted=[];
  const r = await run('/webhooks/inbound-email','{"messageId":"<bad@x>"}', {'content-type':'application/json','authorization':'Bearer wrong-token'});
  eq(r.status,401,'status'); eq(inserted.length,0,'queued');
});
await t('bearer absent + valid HMAC accepted', async () => {
  inserted=[];
  const body = JSON.stringify({messageId:'<hmac@x>'});
  const ts = String(now());
  const sig = hex(await hmac('SHA-256','inbound-secret',body));
  const r = await run('/webhooks/inbound-email', body, {'x-timestamp':ts,'x-signature':sig,'content-type':'application/json'});
  eq(r.status,200,'status'); eq(inserted.length,1,'queued');
});
await t('both absent rejected', async () => {
  inserted=[];
  const r = await run('/webhooks/inbound-email','{}',{'content-type':'application/json'});
  eq(r.status,401,'status'); eq(inserted.length,0,'queued');
});

console.log('Misc');
await t('queue failure returns 500 so the sender retries', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async (u,o) => String(u).includes('webhook_queue') ? new Response('boom',{status:503}) : saved(u,o);
  const body='payload=y'; const ts=String(now());
  const sig='v0='+hex(await hmac('SHA-256','slack-secret',`v0:${ts}:${body}`));
  const r = await run('/webhooks/slack', body, {'x-slack-request-timestamp':ts,'x-slack-signature':sig});
  eq(r.status,500,'status');
  globalThis.fetch = saved;
});
await t('409 from unique index treated as success', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async (u,o) => String(u).includes('webhook_queue') ? new Response('dup',{status:409}) : saved(u,o);
  const body = JSON.stringify({messageId:'<dup@x>'}); const ts=String(now());
  const sig = hex(await hmac('SHA-256','inbound-secret',body));
  const r = await run('/webhooks/inbound-email', body, {'x-timestamp':ts,'x-signature':sig});
  eq(r.status,200,'status'); eq((await r.json()).duplicate,true,'duplicate flag');
  globalThis.fetch = saved;
});
await t('unknown path 404, GET /health reports config by name only', async () => {
  eq((await run('/webhooks/nope','{}',{})).status,404,'404');
  const h = await run('/health',undefined,{}, 'GET');
  const j = await h.json();
  eq(j.configured.slack,true,'slack flag');
  if (JSON.stringify(j).includes('slack-secret')) throw new Error('health leaked a secret');
});
await t('wake was fired', async () => { if (woke < 1) throw new Error('backend never woken'); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
