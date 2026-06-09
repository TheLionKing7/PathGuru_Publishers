-- ============================================================
-- Migration 010 — Engagement OS, Economics, Client 360, NPS, Utilization
-- Run in Supabase SQL editor after 009
-- ============================================================

-- ── 1. Client accounts (CRM hub) ─────────────────────────────
CREATE TABLE IF NOT EXISTS client_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  name            TEXT NOT NULL,
  segment         TEXT DEFAULT 'sme',  -- enterprise | sme | gov | startup
  primary_email   TEXT,
  primary_phone   TEXT,
  company         TEXT,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  hubspot_id      TEXT,
  notion_page_id  TEXT,
  status          TEXT DEFAULT 'active'  -- active | churned | prospect
);

CREATE INDEX IF NOT EXISTS idx_accounts_lead ON client_accounts(lead_id);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON client_accounts(primary_email);


-- ── 2. Engagements (delivery OS) ─────────────────────────────
CREATE TABLE IF NOT EXISTS engagements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  account_id      UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  client_name     TEXT NOT NULL,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  blueprint_id    TEXT,

  track           TEXT DEFAULT 'integrated',  -- automation | business_development | digital_media | integrated
  status          TEXT DEFAULT 'active',     -- active | paused | completed | cancelled
  current_phase   TEXT DEFAULT 'discovery_audit',
  -- discovery_audit | gap_analysis | solution_design | build_deploy_measure
  health          TEXT DEFAULT 'on_track',   -- on_track | at_risk | blocked

  fee_model       TEXT DEFAULT 'fixed',      -- retainer | performance | fixed | hybrid
  contract_value  NUMERIC(12,2) DEFAULT 0,
  currency        TEXT DEFAULT 'USD',
  started_at      TIMESTAMPTZ DEFAULT now(),
  target_end_at   TIMESTAMPTZ,

  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements(status);
CREATE INDEX IF NOT EXISTS idx_engagements_health ON engagements(health);
CREATE INDEX IF NOT EXISTS idx_engagements_account ON engagements(account_id);


-- ── 3. Milestones ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS engagement_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  phase           TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  due_at          TIMESTAMPTZ,
  status          TEXT DEFAULT 'pending',  -- pending | in_progress | done | overdue
  signed_off_at   TIMESTAMPTZ,
  signed_off_by   TEXT,
  sort_order      INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_milestones_engagement ON engagement_milestones(engagement_id);
CREATE INDEX IF NOT EXISTS idx_milestones_due ON engagement_milestones(due_at, status);


-- ── 4. Deliverables (ProcureIQ, SmartCapture, custom) ────────
CREATE TABLE IF NOT EXISTS engagement_deliverables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  milestone_id    UUID REFERENCES engagement_milestones(id) ON DELETE SET NULL,
  product_slug    TEXT,   -- procureiq | smartcapture | custom
  title           TEXT NOT NULL,
  status          TEXT DEFAULT 'planned',  -- planned | in_progress | deployed | accepted
  deployed_url    TEXT,
  evidence_json   JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_deliverables_engagement ON engagement_deliverables(engagement_id);


-- ── 5. Sprints ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS engagement_sprints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  sprint_number   INT NOT NULL,
  start_at        DATE,
  end_at          DATE,
  goal            TEXT,
  status          TEXT DEFAULT 'planned'  -- planned | active | done
);

CREATE INDEX IF NOT EXISTS idx_sprints_engagement ON engagement_sprints(engagement_id);


-- ── 6. Engagement economics ──────────────────────────────────
CREATE TABLE IF NOT EXISTS engagement_economics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  engagement_id   UUID UNIQUE NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  revenue_booked  NUMERIC(12,2) DEFAULT 0,
  revenue_collected NUMERIC(12,2) DEFAULT 0,
  boss_hours      NUMERIC(8,2) DEFAULT 0,
  boss_rate       NUMERIC(10,2) DEFAULT 250,
  agent_cost_est  NUMERIC(10,2) DEFAULT 0,
  tool_cost       NUMERIC(10,2) DEFAULT 0,
  margin_pct      NUMERIC(6,2),
  performance_bonus NUMERIC(10,2) DEFAULT 0,
  notes           TEXT
);


-- ── 7. Client segment scores ─────────────────────────────────
CREATE TABLE IF NOT EXISTS client_segment_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  segment         TEXT UNIQUE NOT NULL,
  avg_margin      NUMERIC(6,2) DEFAULT 0,
  avg_nps         NUMERIC(4,1) DEFAULT 0,
  engagement_count INT DEFAULT 0,
  repeat_rate     NUMERIC(5,2) DEFAULT 0,
  scale_score     NUMERIC(6,2) DEFAULT 0
);


-- ── 8. Client timeline (CRM event stream) ────────────────────
CREATE TABLE IF NOT EXISTS client_timeline (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  account_id      UUID REFERENCES client_accounts(id) ON DELETE CASCADE,
  engagement_id   UUID REFERENCES engagements(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,
  -- blueprint_created | phase_signed | booking | nps | invoice | deliverable_deployed | milestone_overdue
  email           TEXT,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_timeline_account ON client_timeline(account_id, created_at DESC);


-- ── 9. NPS surveys ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nps_surveys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  engagement_id   UUID REFERENCES engagements(id) ON DELETE SET NULL,
  account_id      UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  email           TEXT NOT NULL,
  score           INT CHECK (score BETWEEN 0 AND 10),
  comment         TEXT,
  sent_at         TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  status          TEXT DEFAULT 'pending'  -- pending | sent | responded | skipped
);

CREATE INDEX IF NOT EXISTS idx_nps_engagement ON nps_surveys(engagement_id);


-- ── 10. Utilization logs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS utilization_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  boss_hours_used NUMERIC(8,2) DEFAULT 0,
  boss_hours_capacity NUMERIC(8,2) DEFAULT 40,
  delivery_hours_scheduled NUMERIC(8,2) DEFAULT 0,
  active_tasks    INT DEFAULT 0,
  utilization_pct NUMERIC(5,2),
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_utilization_period ON utilization_logs(period_start DESC);


-- ── 11. ERP / invoice hooks ──────────────────────────────────
CREATE TABLE IF NOT EXISTS engagement_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  engagement_id   UUID REFERENCES engagements(id) ON DELETE SET NULL,
  external_id     TEXT,
  provider        TEXT DEFAULT 'manual',  -- quickbooks | xero | manual
  amount          NUMERIC(12,2),
  currency        TEXT DEFAULT 'USD',
  status          TEXT DEFAULT 'draft',   -- draft | sent | paid | overdue | cancelled
  due_at          TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_invoices_engagement ON engagement_invoices(engagement_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON engagement_invoices(status);


-- ── 12. GEM crystallization audit ────────────────────────────
CREATE TABLE IF NOT EXISTS gem_crystallizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  title           TEXT NOT NULL,
  slug            TEXT,
  domain          TEXT,
  ipms            NUMERIC(5,3),
  tier            TEXT,
  gem_count       INT DEFAULT 0,
  promoted        BOOLEAN DEFAULT FALSE,
  provenance      JSONB DEFAULT '[]',
  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_gem_cryst_ipms ON gem_crystallizations(ipms DESC);
