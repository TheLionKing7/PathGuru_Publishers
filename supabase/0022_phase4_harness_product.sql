-- ============================================================
-- DigiFusion Intelligence Network — Phase 4: Harness Product
-- Migration: 0022_phase4_harness_product.sql
--
-- Tables for the sellable harness product:
--   1. client_charters  — governance charters per client
-- ============================================================

-- ── 1. CLIENT CHARTERS ─────────────────────────────────────────────────────
-- "The charter IS the product. Clients renew the retainer to keep
--  their charter current and their estate governed."

CREATE TABLE IF NOT EXISTS client_charters (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                 TEXT        NOT NULL UNIQUE,

  -- The charter document (markdown)
  charter                   TEXT        NOT NULL,

  -- Governance parameters
  governor                  TEXT        NOT NULL,
  token_ceiling             INT         NOT NULL DEFAULT 200000,
  cost_ceiling_mills        INT         NOT NULL DEFAULT 10000,
  monthly_cost_ceiling_mills INT        NOT NULL DEFAULT 50000,
  retention_days            INT         NOT NULL DEFAULT 90,

  -- Harness health at generation time
  health_score              INT         NOT NULL DEFAULT 0,
  health_band               TEXT        NOT NULL DEFAULT 'opaque',

  -- Timestamps
  generated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cc_client_idx    ON client_charters(client_id);
CREATE INDEX IF NOT EXISTS cc_health_idx    ON client_charters(health_score DESC);
CREATE INDEX IF NOT EXISTS cc_generated_idx ON client_charters(generated_at DESC);

-- ── Trigger: auto-update updated_at ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_charter_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'charter_updated_at') THEN
    CREATE TRIGGER charter_updated_at
      BEFORE UPDATE ON client_charters
      FOR EACH ROW EXECUTE FUNCTION update_charter_updated_at();
  END IF;
END $$;

-- ── View: Active charters summary ──────────────────────────────────────────

CREATE OR REPLACE VIEW v_active_charters AS
SELECT
  client_id, governor, health_score, health_band,
  token_ceiling, cost_ceiling_mills, retention_days,
  generated_at,
  CASE WHEN health_score >= 85 THEN 'engineered'
       WHEN health_score >= 65 THEN 'legible'
       WHEN health_score >= 40 THEN 'approaching'
       ELSE 'opaque'
  END AS current_band
FROM client_charters
ORDER BY health_score DESC;
