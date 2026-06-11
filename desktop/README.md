# GuruCMS Desktop

Hybrid Electron client: **bundled local UI** + **cloud API** on Render. Agents, cron, and publishing jobs keep running when the window is closed.

## Quick start (development)

```bash
npm install
npm run desktop:dev
```

Opens the bundled `webapp/index.html` and talks to `https://pathguru-publishers.onrender.com` by default.

## Build Windows installer

```bash
npm install
npm run desktop:build
```

Output: `dist/desktop/GuruCMS Setup *.exe` (NSIS installer).

Unpacked app (no installer): `npm run desktop:build:dir` → `dist/desktop/win-unpacked/GuruCMS.exe`

Icons are generated from `webapp/assets/gurucms-logo.png` via `npm run desktop:icons`.

**Note:** Code signing is disabled (`signAndEditExecutable: false`) so builds work without Developer Mode / admin symlinks. For distribution, sign the installer with your certificate.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PATHGURU_CLOUD_URL` | `https://pathguru-publishers.onrender.com` | Cloud API base URL |
| `PATHGURU_PRODUCT` | `digifusion` | Product profile (`digifusion` = full GuruCMS) |
| `PATHGURU_DESKTOP_CLOUD` | `0` | Set `1` to load UI from cloud instead of bundled webapp |
| `PATHGURU_DESKTOP_DEVTOOLS` | `0` | Set `1` to open DevTools |

## Architecture

```
┌─────────────────────────────────────┐
│  Electron window (GuruCMS)          │
│  webapp/index.html  (local, file://)│
│         │                           │
│         ▼  HTTPS API                │
│  pathguru-publishers.onrender.com   │
│  agents · CMS · cron · storage      │
└─────────────────────────────────────┘
```

Settings (`pg_settings.backendUrl`) are seeded from preload on first launch. Change API URL in **Settings** if you run a local backend (`npm run dev` on `:8787`).

## Smoke test (no Electron)

```bash
npm run test:desktop-smoke
```

Verifies bundled `file://` UI + cloud API wiring (same as desktop default).
