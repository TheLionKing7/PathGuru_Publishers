# PathGuru Hybrid Desktop

Thin Electron client for the **cloud-primary** platform. The Render API keeps agents, cron, and publishing jobs running when this window is closed.

## Quick start

```bash
npm install
npm run desktop:dev
```

Opens `https://pathguru-publishers.onrender.com` by default. Use the launcher to sign in to **PathGuru Publisher** or **DigiFusion Command** — both share the same backend URL and resources.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PATHGURU_CLOUD_URL` | `https://pathguru-publishers.onrender.com` | Cloud webapp + API |
| `PATHGURU_PRODUCT` | _(empty)_ | Skip launcher with `publisher` or `digifusion` |
| `PATHGURU_DESKTOP_LOCAL` | `0` | Set `1` to load `webapp/index.html` from disk |
| `PATHGURU_DESKTOP_DEVTOOLS` | `0` | Set `1` to open DevTools |

## Build installer

```bash
npm run desktop:build
```

Output: `dist/desktop/`

## Commercial Publisher fork

The `publisher` product profile is marked `commercialSku` in `backend/skills/productRegistry.js`. A future deploy can run `PATHGURU_PRODUCT_MODE=publisher` on a separate host while your full firm platform stays on the primary server.
