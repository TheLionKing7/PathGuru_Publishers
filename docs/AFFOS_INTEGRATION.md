# AffiliateOS — Intelligence Library + Blog Integration

## Do you need R2 for paying clients?

**Yes — if you use the DigiFusion Intelligence Store (recommended).**

Paid access on digitafusion.com works like this:

```
Buyer → /shop/affiliateos-headless-commerce-case-study
      → Paystack checkout (df_* reference)
      → Webhook marks order paid
      → Fulfillment reads product.fulfillment.r2_key
      → Signed download link (72h, 5 uses) emailed + /orders/{id}
```

For that flow you must:

1. Zip **PDF + interactive HTML** → `affiliateos-headless-commerce-case-study.zip`
2. Upload to Cloudflare R2 bucket `digifusion-shop` at:
   `Digifusion/Intelligence/affiliateos-headless-commerce-case-study.zip`
3. Run `node --env-file=.env scripts/seed-intelligence-products.mjs` in **digifusion**

**No R2** only if you keep the standalone HTML paywall (`?access=AFFOS2026`) with a manual Paystack Payment Link. That bypasses the shop, is weak security (shared URL secret), and does not integrate with GuruCMS order tracking. **Not recommended for production.**

## Paystack — use digifusion shop, not a static Payment Link

The Claude HTML file used `YOUR_PAYSTACK_PAYMENT_LINK_HERE`. **Do not use that** on production.

DigiFusion already routes Paystack via:

- `POST /api/checkout` → `paystack.createCheckoutSession` (`df_*` references)
- `POST /api/webhooks/paystack` → order paid → R2 download fulfillment

Buyers pay at:

**https://www.digitafusion.com/intelligence/research/affiliateos-headless-commerce-case-study**

($84.99 USD via Paystack — unlocks the interactive HTML on-page after payment)

Shop product (PDF zip download) also available at `/shop/affiliateos-headless-commerce-case-study`.

Ensure on Render/Vercel for digifusion:

- `PAYSTACK_SECRET_KEY`
- `NEXT_PUBLIC_SITE_URL=https://www.digitafusion.com`
- Webhook URL: `https://www.digitafusion.com/api/webhooks/paystack` (hub — forwards `affos_*` to AffiliateOS)
- Optional: `PAYSTACK_AFFILIATEOS_WEBHOOK_URL=https://api.affos.link/webhook/payment`
- See `digifusion/docs/PAYSTACK_WEBHOOK_HUB.md` and `AffiliateOS/docs/AFFOS_LINK_SETUP.md`
- R2 credentials (`R2_*`, `R2_SHOP_BUCKET=digifusion-shop`)

## Content map

| Asset | Where | Tier |
|-------|-------|------|
| AffOS Article (teaser) | Blog `/blog/your-followers-are-ready-to-buy-affiliateos-infrastructure` | Free |
| Research card | `/intelligence/research` → links to blog | Free teaser |
| Full case study | Shop product `affiliateos-headless-commerce-case-study` | Licensed ($97) |
| GuruCMS Blog-room | Same posts via `DIGIFUSION_API_URL` CMS proxy | Edit/publish |

## Deploy checklist

### digifusion repo

```bash
# 1. Copy case study files into content/intelligence/affiliateos/
# 2. Package for R2
node scripts/package-affos-case-study.mjs

# 3. Upload zip to R2 (Cloudflare dashboard or wrangler)

# 4. Seed Supabase products
node --env-file=.env scripts/seed-intelligence-products.mjs

# 5. Deploy Next.js app
```

### PathGuru (GuruCMS)

```bash
# Publish blog article
node --env-file=.env.local scripts/seed-affos-blog.mjs

# Optional: archive weak legacy posts (dry-run first)
node --env-file=.env.local scripts/prune-weak-blog-posts.mjs --dry-run

# Wiring smoke
node scripts/verify-affos-wiring.mjs
```

## Intelligence section (GuruCMS)

- **Network → Agency IP** — firm frameworks pipeline (Orion → Library)
- **Products module** — create/edit shop products; category `research` for case studies
- **Blog-room** — compose, publish, delete posts synced to DigiFusion

The AffiliateOS SKU appears automatically on digitafusion.com/intelligence/research after seed + deploy.
