-- ============================================================
-- DigiFusion Intelligence Network — Phase 3: Calibration
-- Migration: 0021_phase3_calibration.sql
--
-- Tables for the calibration engine:
--   1. engagement_outcomes  — structured outcomes per engagement
--   2. calibration_state    — the prior→calibrated flip state
-- ============================================================

-- ── 1. ENGAGEMENT OUTCOMES REGISTER ─────────────────────────────────────────
-- "Instrument every engagement, from the next one."
-- One row per closed engagement. This IS the moat.

CREATE TABLE IF NOT EXISTS engagement_outcomes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id         TEXT        NOT NULL UNIQUE,

  -- Outcome verdict
  outcome               TEXT        NOT NULL,  -- 'delivered' | 'declined' | 'stalled' | 'abandoned'

  -- Self-score (FrictionIQ public diagnostic)
  self_score_band       TEXT,                  -- 'opaque' | 'approaching' | 'legible' | 'engineered'
  self_score_total      INT,
  self_score_process    INT,
  self_score_data       INT,
  self_score_governance INT,

  -- Assessor score (14-day engagement assessment)
  assessor_score_band   TEXT,
  assessor_score_total  INT,

  -- Friction Tax result
  friction_tax_low      NUMERIC(14,2),
  friction_tax_high     NUMERIC(14,2),
  friction_tax_currency TEXT,

  -- Three-ink distribution
  ink_green             INT,
  ink_blue              INT,
  ink_red               INT,

  -- Reclassification rate (the honest metric)
  reclassification_rate NUMERIC(5,4),

  -- Realised (not projected) payback
  actual_payback_months NUMERIC(6,2),

  -- Delivery metadata
  sector                TEXT,
  delivery_weeks        INT,
  stall_points          JSONB       DEFAULT '[]',

  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eo_outcome_idx        ON engagement_outcomes(outcome);
CREATE INDEX IF NOT EXISTS eo_assessor_band_idx  ON engagement_outcomes(assessor_score_band);
CREATE INDEX IF NOT EXISTS eo_self_band_idx      ON engagement_outcomes(self_score_band);
CREATE INDEX IF NOT EXISTS eo_sector_idx         ON engagement_outcomes(sector);
CREATE INDEX IF NOT EXISTS eo_recorded_idx       ON engagement_outcomes(recorded_at DESC);

-- ── 2. CALIBRATION STATE ────────────────────────────────────────────────────
-- The single row that controls whether basis is 'prior' or 'calibrated'.
-- Written by computeMeasuredPriors(). Read by getActivePriors() and DigiFusion's
-- commitment.ts to decide which priors to use.

CREATE TABLE IF NOT EXISTS calibration_state (
  id              TEXT        PRIMARY KEY DEFAULT 'current',
  basis           TEXT        NOT NULL DEFAULT 'prior',  -- 'prior' | 'calibrated'
  measured_priors JSONB       NOT NULL DEFAULT '{}',    -- { opaque: number, approaching: number, ... }
  total_outcomes  INT         NOT NULL DEFAULT 0,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert the default row if it doesn't exist
INSERT INTO calibration_state (id, basis, measured_priors, total_outcomes)
VALUES ('current', 'prior', '{}'::jsonb, 0)
ON CONFLICT (id) DO NOTHING;

-- ── 3. VIEW: Calibration dashboard ──────────────────────────────────────────

CREATE OR REPLACE VIEW v_calibration_dashboard AS
SELECT
  cs.basis,
  cs.total_outcomes,
  cs.measured_priors,
  cs.computed_at,
  (SELECT COUNT(*) FROM engagement_outcomes WHERE outcome = 'delivered') AS delivered,
  (SELECT COUNT(*) FROM engagement_outcomes WHERE outcome = 'stalled')   AS stalled,
  (SELECT COUNT(*) FROM engagement_outcomes WHERE outcome = 'abandoned') AS abandoned,
  (SELECT COUNT(*) FROM engagement_outcomes WHERE outcome = 'declined')  AS declined
FROM calibration_state cs
WHERE cs.id = 'current';

-- ── 4. VIEW: Divergence by band ─────────────────────────────────────────────

CREATE OR REPLACE VIEW v_divergence_by_band AS
SELECT
  assessor_score_band AS band,
  COUNT(*) AS pairs,
  ROUND(AVG(assessor_score_total - self_score_total)::numeric, 2) AS mean_delta,
  CASE WHEN COUNT(*) >= 2
    THEN ROUND(AVG(assessor_score_total - self_score_total)::numeric, 2)
    ELSE NULL
  END AS correction_factor,
  COUNT(*) >= 2 AS is_defensible
FROM engagement_outcomes
WHERE self_score_total IS NOT NULL
  AND assessor_score_total IS NOT NULL
GROUP BY assessor_score_band
ORDER BY COUNT(*) DESC;
