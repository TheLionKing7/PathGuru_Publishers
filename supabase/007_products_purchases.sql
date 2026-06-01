-- DigiFusion Products & Purchases
-- Enables blueprint monetisation and gated IP access

-- Products catalogue (blueprints, playbooks, etc.)
CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,          -- e.g. 'sme-scale-engine-blueprint'
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'blueprint',  -- 'blueprint' | 'playbook' | 'framework'
  industry      TEXT,                                -- 'sme' | 'pharma' | 'government' etc.
  price_usd     NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_ngn     NUMERIC(12,2),                       -- optional NGN pricing
  currency      TEXT NOT NULL DEFAULT 'USD',
  firm_ip_slug  TEXT NOT NULL,             -- maps to firm_ip/_manifest.json slug
  access_level  TEXT NOT NULL DEFAULT 'purchasable', -- 'free' | 'purchasable' | 'enterprise'
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  preview_url   TEXT,                      -- thumbnail or preview image
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchase records
CREATE TABLE IF NOT EXISTS purchases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    TEXT NOT NULL REFERENCES products(id),
  buyer_email   TEXT NOT NULL,
  buyer_name    TEXT,
  amount_paid   NUMERIC(10,2),
  currency      TEXT DEFAULT 'USD',
  payment_ref   TEXT,                      -- Stripe charge ID / Paystack ref etc.
  payment_method TEXT DEFAULT 'manual',    -- 'stripe' | 'paystack' | 'manual' | 'comp'
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'refunded'
  download_count INTEGER NOT NULL DEFAULT 0,
  max_downloads  INTEGER NOT NULL DEFAULT 5,
  expires_at    TIMESTAMPTZ,               -- null = no expiry
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Download audit log
CREATE TABLE IF NOT EXISTS download_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id),
  product_id  TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchases_email      ON purchases(buyer_email);
CREATE INDEX IF NOT EXISTS idx_purchases_product    ON purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status     ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_download_log_purchase ON download_log(purchase_id);

-- Seed the 7 blueprint products
INSERT INTO products (id, title, description, category, industry, price_usd, price_ngn, firm_ip_slug, access_level) VALUES
  ('sme-scale-engine-blueprint',
   'SME Scale Engine Blueprint',
   'AI-powered BD and revenue architecture for small and medium enterprises. Includes the 5-Pillar framework, Deal Engine pipeline, AVE proposal system, and 90-day activation plan.',
   'blueprint', 'sme', 49.00, 75000, 'sme-scale-engine-blueprint', 'purchasable'),

  ('enterprise-velocity-architecture-blueprint',
   'Enterprise Velocity Architecture Blueprint',
   'Strategic revenue and BD intelligence framework for large corporations and conglomerates. Built for Dangote-scale organisations with multi-subsidiary BD coordination.',
   'blueprint', 'enterprise', 99.00, 150000, 'enterprise-velocity-architecture-blueprint', 'purchasable'),

  ('public-sector-digital-transformation-blueprint',
   'Public Sector Digital Transformation Blueprint',
   'AI-driven modernisation methodology for government ministries, departments, and agencies. GovTech 4-layer framework with ministry-level implementation model.',
   'blueprint', 'government', 79.00, 120000, 'public-sector-digital-transformation-blueprint', 'purchasable'),

  ('financial-intelligence-revenue-architecture-blueprint',
   'Financial Intelligence & Revenue Architecture Blueprint',
   'AI-powered commercial strategy for banks, fintechs, and financial institutions. FIRA 3-engine model with corporate banking BD model and Nigerian market benchmarks.',
   'blueprint', 'financial', 99.00, 150000, 'financial-intelligence-revenue-architecture-blueprint', 'purchasable'),

  ('pharma-commercial-excellence-blueprint',
   'Pharma Commercial Excellence Blueprint',
   'AI-augmented revenue strategy for pharmaceutical and life sciences companies in Africa. PCE 4-pillar framework with MSR performance system and hospital KAM model.',
   'blueprint', 'pharmaceutical', 79.00, 120000, 'pharma-commercial-excellence-blueprint', 'purchasable'),

  ('hospitality-revenue-intelligence-blueprint',
   'Hospitality Revenue Intelligence System Blueprint',
   'AI-driven revenue optimisation for hotels, resorts, and hospitality groups. HRIS 3-engine model with dynamic pricing, corporate account KAM, and MICE pipeline.',
   'blueprint', 'hospitality', 69.00, 105000, 'hospitality-revenue-intelligence-blueprint', 'purchasable'),

  ('commodity-intelligence-market-edge-blueprint',
   'Commodity Intelligence & Market Edge Framework Blueprint',
   'AI-driven trade intelligence and commercial strategy for commodity traders and exchange operators. CIMEF 4-dimension architecture with price prediction and counterparty intelligence.',
   'blueprint', 'commodity', 79.00, 120000, 'commodity-intelligence-market-edge-blueprint', 'purchasable')

ON CONFLICT (id) DO NOTHING;
