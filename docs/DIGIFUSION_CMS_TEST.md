# DigiFusion Command — CMS reliability test

Publisher is **shelved** until redesign (`PATHGURU_PUBLISHER_ENABLED` unset on Render).  
**Primary product:** DigiFusion Command → **Intelligence → Blog-room** (CMS).

**Pass criteria:** list, create, edit, publish, and unpublish posts on `digitafusion.com` via the Command desktop client — no invented slugs, no 502 from missing CMS token.

---

## Prerequisites (Render env)

| Variable | Required |
|----------|----------|
| `DIGIFUSION_API_URL` | e.g. `https://www.digitafusion.com` |
| `DIGIFUSION_CMS_TOKEN` | Bearer token for `/api/cms/*` |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Agent tasks, approvals (Network dept) |

Confirm: `GET /api/platform/config` → `defaultProduct: "digifusion"`, `publisherEnabled: false`.

---

## Department test order

Run in sequence. Log failures using the template at the bottom.

### 1. Intelligence — Blog-room (CMS core)

| Step | Action | Pass |
|------|--------|------|
| List posts | Blog-room → post list loads (`GET /api/posts`) | ☐ |
| Open draft | Click a draft → editor shows title, body, status | ☐ |
| Create draft | New post → save as draft → appears in list with `draft` status | ☐ |
| Edit draft | Change title/body → save → reload shows changes | ☐ |
| Publish | Publish → `PATCH .../publish` → post live on DigiFusion site | ☐ |
| Unpublish | Unpublish → post returns to draft on site | ☐ |
| Delete | Delete test draft → removed from list | ☐ |
| Author routing | Published post shows correct byline (Boroji / Kayode / DigiFusion rules) | ☐ |

### 2. Intelligence — Blog assets

| Step | Action | Pass |
|------|--------|------|
| Media list | Blog Assets → `GET /api/media/list` returns grid or empty state | ☐ |
| Upload | Upload image → appears in library | ☐ |
| Delete | Remove test asset → gone from list | ☐ |

### 3. Intelligence — Content schedule

| Step | Action | Pass |
|------|--------|------|
| Calendar | Content Schedule tab loads without JS errors | ☐ |
| Pending items | Scheduled posts show as approval-pending (not auto-published) | ☐ |

### 4. Products — Catalog (DigiFusion shop CMS)

| Step | Action | Pass |
|------|--------|------|
| List | Products → catalog loads (`GET /api/shop/products`) | ☐ |
| Create | Add test product → saves via CMS proxy | ☐ |
| Edit | Update price/description → persists | ☐ |
| Delete | Remove test product | ☐ |

### 5. Network — Agent publish path (optional)

| Step | Action | Pass |
|------|--------|------|
| Research task | Orion completes research → real `taskId` in output | ☐ |
| Approval flow | Boss approval → Aether draft → publish cites real `slug` | ☐ |
| No hallucination | Nexus does not claim publish without CMS response proof | ☐ |

### 6. Analytics

| Step | Action | Pass |
|------|--------|------|
| Pageviews | Analytics tab → `GET /api/shop/analytics/pageviews` → chart or empty | ☐ |

---

## API smoke tests (curl)

Replace `BASE` with your Render URL and ensure CMS env is set.

```bash
# Platform bootstrap
curl -s BASE/api/platform/config

# Post list (proxied to DigiFusion CMS)
curl -s BASE/api/posts?status=draft

# Create draft
curl -s -X POST BASE/api/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"CMS smoke test","slug":"cms-smoke-test","content":"<p>test</p>","status":"draft"}'
```

---

## Failure log

1. Department + UI action  
2. Network: method, path, status  
3. Response body or CMS error message  
4. Render log timestamp  

---

## Re-enabling Publisher later

Set `PATHGURU_PUBLISHER_ENABLED=1` on Render and redeploy.  
Publisher card reappears on the product launcher. Editorial pipeline needs redesign before production use.
