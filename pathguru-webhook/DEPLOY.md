# Webhook edge — deploy

## 1. Database

Run `0028_webhook_queue.sql` in the Supabase SQL editor. Then verify:

```sql
select policyname, roles, cmd from pg_policies where tablename = 'webhook_queue';
```

Expect exactly one row: `webhook_queue_anon_insert`, `{anon}`, `INSERT`.

## 2. Worker

```bash
cd worker
npm install -g wrangler          # or npx wrangler for each command
```

Edit `wrangler.toml` — set `SUPABASE_URL` to your project URL and confirm
`RENDER_ORIGIN`. Then set the four secrets (never in the toml, it goes to git):

```bash
npx wrangler secret put SUPABASE_ANON_KEY        # anon key, NOT service_role
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put INBOUND_WEBHOOK_SECRET   # same value as on Render
npx wrangler deploy
```

Confirm it is alive and correctly configured — names only, no values:

```bash
curl -s https://pathguru-webhooks.<your-subdomain>.workers.dev/health
```

All five flags must be `true`.

## 3. Repoint the three senders

| Sender | New URL |
|---|---|
| Slack app → Interactivity → Request URL | `https://…workers.dev/webhooks/slack` |
| Twilio → Sandbox settings → When a message comes in | `https://…workers.dev/webhooks/whatsapp` |
| Make → Scenario A → HTTP module | `https://…workers.dev/webhooks/inbound-email` |

Nothing points at Render any more except the Worker itself.

## 4. Smoke test

```bash
# Unsigned request must be refused and must NOT reach the queue
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://…workers.dev/webhooks/slack -d 'payload=x'
# → 401
```

Then in Supabase: `select kind, status, count(*) from webhook_queue group by 1,2;`
Rows should appear as `pending` and flip to `done` within ~60 seconds of arriving.

## When you move to Render's paid tier

Delete the Worker and point the three senders straight back at
`https://pathguru-publishers-api.onrender.com/api/webhooks/*`. Keep migration
0028 and `/api/queue/drain` — an idempotent, durable queue in front of your
webhooks is worth having whether or not the backend sleeps.
