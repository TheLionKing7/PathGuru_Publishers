-- ============================================================
-- DigiFusion Intelligence Network — Phase 2: Delivery Leverage
-- Migration: 0020_phase2_delivery.sql
--
-- Tables for the three Phase 2 harness modules:
--   1. exception_catalog     — Exception Harvest results
--   2. friction_tax_runs     — Friction Tax Assembly Agent runs
--   3. ink_classifications   — Three-Ink First Pass + reclassification
-- ============================================================

-- ── 1. EXCEPTION CATALOG ────────────────────────────────────────────────────
-- Stores the 4-field catalog produced by the Exception Harvest agent.
-- Each row is one deviation cluster: trigger, frequency, cost, reason.

CREATE TABLE IF NOT EXISTS exception_catalog (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                TEXT        NOT NULL,
  agent_id              TEXT        NOT NULL,
  cluster_index         INT         NOT NULL DEFAULT 0,

  -- The 4-field catalog
  trigger               TEXT        NOT NULL,
  frequency_per_month   NUMERIC(12,2) DEFAULT 0,
  annual_cost_estimate  NUMERIC(14,2) DEFAULT 0,
  cost_working          TEXT,                       -- arithmetic shown to client
  reason                TEXT        NOT NULL,       -- root cause classification
  recommendation        TEXT,                       -- one concrete elimination step

  -- Metadata
  deviation_count       INT         DEFAULT 0,
  input_hash            TEXT,                       -- SHA-256 of source logs
  total_annual_cost     NUMERIC(14,2) DEFAULT 0,   -- summary across all clusters
  total_clusters        INT         DEFAULT 0,
  top_cluster           TEXT,                       -- costliest cluster description
  consultant_note       TEXT,                       -- what to validate first

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(run_id, cluster_index)
);

CREATE INDEX IF NOT EXISTS excat_run_id_idx     ON exception_catalog(run_id);
CREATE INDEX IF NOT EXISTS excat_agent_id_idx   ON exception_catalog(agent_id);
CREATE INDEX IF NOT EXISTS excat_created_idx    ON exception_catalog(created_at DESC);

-- ── 2. FRICTION TAX RUNS ────────────────────────────────────────────────────
-- Stores agent-extracted inputs and deterministic computation results.

CREATE TABLE IF NOT EXISTS friction_tax_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          TEXT        NOT NULL UNIQUE,
  agent_id        TEXT        NOT NULL,

  inputs          JSONB       NOT NULL DEFAULT '{}',  -- raw FrictionTaxInputs
  result          JSONB       NOT NULL DEFAULT '{}',  -- computed FrictionTaxResult
  input_hash      TEXT,                               -- SHA-256 of source data

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ftax_run_id_idx    ON friction_tax_runs(run_id);
CREATE INDEX IF NOT EXISTS ftax_agent_idx     ON friction_tax_runs(agent_id);
CREATE INDEX IF NOT EXISTS ftax_created_idx   ON friction_tax_runs(created_at DESC);

-- ── 3. INK CLASSIFICATIONS ──────────────────────────────────────────────────
-- Stores both proposed (agent) and final (human) classifications.
-- This table IS the reclassification_rate metric.

CREATE TABLE IF NOT EXISTS ink_classifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          TEXT        NOT NULL,
  agent_id        TEXT        NOT NULL,
  flow_name       TEXT        NOT NULL,

  -- Agent proposal
  proposed_ink    TEXT        NOT NULL,              -- 'green' | 'blue' | 'red'
  rationale       TEXT,                              -- agent's reasoning
  confidence      NUMERIC(4,3) DEFAULT 0,           -- agent's confidence 0-1

  -- Human reclassification (null until reviewed)
  original_ink    TEXT,                              -- what agent proposed (for tracking)
  final_ink       TEXT,                              -- what human decided
  reason          TEXT,                              -- why it was changed
  was_changed     BOOLEAN     DEFAULT FALSE,        -- did human change it?

  -- Metadata
  input_hash      TEXT,                              -- SHA-256 of process description

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(run_id, flow_name)
);

CREATE INDEX IF NOT EXISTS ink_run_id_idx       ON ink_classifications(run_id);
CREATE INDEX IF NOT EXISTS ink_agent_idx        ON ink_classifications(agent_id);
CREATE INDEX IF NOT EXISTS ink_was_changed_idx  ON ink_classifications(was_changed);
CREATE INDEX IF NOT EXISTS ink_created_idx      ON ink_classifications(created_at DESC);

-- ── 4. AGGREGATE VIEW: Reclassification rate ────────────────────────────────
-- The honest measure of whether the agent is helping.

CREATE OR REPLACE VIEW v_ink_reclassification_rate AS
SELECT
  agent_id,
  COUNT(*)                                              AS total_flows,
  COUNT(*) FILTER (WHERE was_changed)                   AS changed_flows,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE was_changed)::numeric / COUNT(*), 4)
    ELSE NULL
  END                                                   AS reclassification_rate,
  MIN(created_at)                                       AS first_run,
  MAX(created_at)                                       AS last_run
FROM ink_classifications
WHERE was_changed IS NOT NULL
GROUP BY agent_id;

-- ── Trigger: auto-update updated_at on ink_classifications ───────────────────

CREATE OR REPLACE FUNCTION update_ink_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ink_updated_at') THEN
    CREATE TRIGGER ink_updated_at
      BEFORE UPDATE ON ink_classifications
      FOR EACH ROW EXECUTE FUNCTION update_ink_updated_at();
  END IF;
END $$;
