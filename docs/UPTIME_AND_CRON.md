# UptimeRobot + External Cron Setup (Render)

PathGuru on Render **free tier** spins down after ~15 minutes idle. Use two layers:

1. **Keep-alive** — lightweight `/ping` every 5 minutes (UptimeRobot)
2. **CEO jobs** — scheduled GET to `/api/cron/*` (fires even if in-process timers missed a wake-up)

Production URL (adjust if your Render service name differs):

```
https://pathguru-publishers.onrender.com
```

---

## 1. Set `CRON_SECRET` on Render

Dashboard → PathGuru service → Environment → add variable **`CRON_SECRET`** and paste a value you generate locally (never commit it).

Generate one: `openssl rand -hex 32` or any password manager.

When set, all `/api/cron/*` routes and CEO POST briefing routes require this secret.

---

## 2. UptimeRobot (keep-alive only)

| Setting | Value |
|---|---|
| Monitor type | HTTP(s) |
| URL | `https://pathguru-publishers.onrender.com/ping` |
| Interval | **5 minutes** |
| Request timeout | **60 seconds** (not 30) |
| Keyword (optional) | `"ok":true` |

Do **not** use `/health` for keep-alive — it loads fonts and slows cold starts.

Expected response (instant):

```json
{"ok":true,"service":"pathguru-publishers","ts":"..."}
```

---

## 3. External cron jobs (Nexus CEO)

Use [cron-job.org](https://cron-job.org), GitHub Actions, or UptimeRobot **advanced** with custom schedule.

All URLs append `?secret=` plus your Render value **or** send header `Authorization: Bearer` with the same value.

Times below are **UTC**. Lagos (WAT) = UTC+1 → 7:00 Lagos = **06:00 UTC**, 18:00 Lagos = **17:00 UTC**.

| Job | Schedule (UTC) | URL |
|---|---|---|
| Morning briefing + WhatsApp | `0 6 * * *` | `GET .../api/cron/morning-briefing?secret=...` |
| Evening briefing + WhatsApp | `0 17 * * *` | `GET .../api/cron/evening-briefing?secret=...` |

> **Retired — delete these cron-job.org jobs if still configured.** `content-cadence` and
> `process-scheduled-content` now return **410 Gone**. Content is commissioned by a human
> (`POST /api/content/commission`), not scheduled. They have no fallback route and will only
> 410 — remove them.

Example full URL (replace `{token}` with the value from Render):

```
https://pathguru-publishers.onrender.com/api/cron/morning-briefing?secret={token}
```

Set cron-job.org **request timeout** to **120 seconds** (briefings call the LLM).

---

## 4. In-process timers (backup)

PathGuru still schedules 7am / 6pm / cadence internally when the process stays awake. On free tier, **external cron is the reliable source** — in-process timers are backup only when Render never sleeps.

For guaranteed CEO ops: **Render Starter ($7/mo)** always-on **or** external cron as above.

---

## 5. Manual test

```bash
# Keep-alive
curl -s https://pathguru-publishers.onrender.com/ping

# CEO ops (after CRON_SECRET set on Render — pass ?secret={token})
curl -s "https://pathguru-publishers.onrender.com/api/cron/morning-briefing?secret={token}"
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| UptimeRobot always "down" | Timeout 60s+; use `/ping` not `/health` |
| 401 on cron URLs | `CRON_SECRET` mismatch or missing `?secret=` |
| Briefings never arrive | Add external cron at 06:00 / 17:00 UTC; check WhatsApp env vars |
| Aria still slow first message | Render cold start — upgrade Starter or accept 30s first hit |
