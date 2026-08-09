-- ============================================================
-- DigiFusion Intelligence Network — Agent Harness
-- Migration: 0019_agent_harness.sql
--
-- Phase 1: The Harness — trace, verification, budget, perimeter.
-- Four tables that make the agent estate auditable.
-- ============================================================

-- ── 1. AGENT TRACES ──────────────────────────────────────────────────────────
-- Per-run trace: every agent invocation writes one row.
-- This is the raw material for Phase 3 calibration.
CREATE TABLE IF NOT EXISTS agent_traces (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          TEXT        NOT NULL,           -- groups steps of one orchestration run
  agent_id        TEXT        NOT NULL,           -- which agent executed this step
  step_index      INT         NOT NULL DEFAULT 0, -- position in the chain (0-based)
  chain_length    INT         NOT NULL DEFAULT 1, -- total steps in this chain
  verified        BOOLEAN     NOT NULL DEFAULT FALSE, -- did this step pass a verification gate?

  -- Cryptographic hashes of input/output (SHA-256 hex) for audit
  input_hash      TEXT,
  output_hash     TEXT,

  -- Tool / provider telemetry
  provider_name   TEXT,                           -- e.g. 'deepseek', 'groq', 'claude'
  model_name      TEXT,                           -- e.g. 'deepseek-chat', 'llama-3.3-70b'
  tool_calls      JSONB       DEFAULT '[]',       -- [{name, args_hash, duration_ms}]
  tokens_in       INT         DEFAULT 0,
  tokens_out      INT         DEFAULT 0,
  cost_usd_mills  NUMERIC(12,6) DEFAULT 0,       -- cost in milli-dollars (1/1000 USD)

  -- Timing
  duration_ms     INT         DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,

  -- Verdict
  verdict         TEXT        DEFAULT 'pending',  -- 'passed' | 'failed' | 'aborted' | 'pending'
  error_message   TEXT,
  verification_check TEXT,                        -- the checkable condition that was asserted

  -- Namespace access log (for perimeter audit)
  namespaces_accessed TEXT[]  DEFAULT '{}',       -- e.g. {'firm_ip', 'knowledge_base.general'}

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS traces_run_id_idx      ON agent_traces(run_id);
CREATE INDEX IF NOT EXISTS traces_agent_id_idx    ON agent_traces(agent_id);
CREATE INDEX IF NOT EXISTS traces_verdict_idx     ON agent_traces(verdict);
CREATE INDEX IF NOT EXISTS traces_started_at_idx  ON agent_traces(started_at DESC);

-- ── 2. BUDGET LEDGER ─────────────────────────────────────────────────────────
-- Enforces budget ceilings per run. A run that exceeds its limit is aborted.
CREATE TABLE IF NOT EXISTS agent_budgets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          TEXT        NOT NULL UNIQUE,

  -- Ceilings set at run start
  token_limit     INT         NOT NULL DEFAULT 200000,  -- total tokens across all steps
  cost_limit_usd_mills NUMERIC(12,6) DEFAULT 10000,     -- in milli-dollars (=$10.00)
  step_limit      INT         NOT NULL DEFAULT 12,      -- max chain length allowed

  -- Running totals
  tokens_consumed INT         NOT NULL DEFAULT 0,
  cost_consumed_usd_mills NUMERIC(12,6) DEFAULT 0,
  steps_executed  INT         NOT NULL DEFAULT 0,

  -- Status
  status          TEXT        NOT NULL DEFAULT 'active', -- 'active' | 'exceeded' | 'aborted'
  exceeded_at     TIMESTAMPTZ,
  aborted_reason  TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS budgets_run_id_idx ON agent_budgets(run_id);

-- ── 3. CONTEXT PERIMETER ─────────────────────────────────────────────────────
-- Declares which agent may read which knowledge namespace.
-- Stored in the DB so it can be updated without a redeploy.
CREATE TABLE IF NOT EXISTS agent_permissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        TEXT        NOT NULL,
  namespace       TEXT        NOT NULL,  -- e.g. 'knowledge_base.business_development', 'leads', 'posts'
  access_level    TEXT        NOT NULL DEFAULT 'read', -- 'read' | 'write' | 'none'
  reason          TEXT,                   -- why this agent needs this namespace
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(agent_id, namespace)
);

CREATE INDEX IF NOT EXISTS perm_agent_id_idx ON agent_permissions(agent_id);
CREATE INDEX IF NOT EXISTS perm_namespace_idx ON agent_permissions(namespace);

-- ── Seed perimeter: canonical agent → namespace assignments ──────────────────
-- Based on the Phase 1 context perimeter design rule:
-- "Atlas does not need the blog drafts; Aether does not need the prospect register."

INSERT INTO agent_permissions (agent_id, namespace, access_level, reason) VALUES
  -- Nexus: CEO sees everything
  ('nexus',       'knowledge_base.*',        'read',  'CEO oversight'),
  ('nexus',       'tasks.*',                  'read',  'Orchestration'),
  ('nexus',       'leads.*',                  'read',  'Pipeline visibility'),
  ('nexus',       'agent_traces.*',           'read',  'Calibration data'),

  -- Orion (researcher): web intelligence + general KB
  ('researcher',  'knowledge_base.general',   'read',  'Research grounding'),
  ('researcher',  'knowledge_base.business_development', 'read', 'BD research'),
  ('researcher',  'knowledge_base.automation', 'read', 'Automation research'),
  ('researcher',  'knowledge_base.digital_media', 'read', 'Content research'),

  -- Atlas: BD intelligence, leads, deals
  ('atlas',       'knowledge_base.business_development', 'read', 'BD frameworks'),
  ('atlas',       'knowledge_base.general',   'read',  'General context'),
  ('atlas',       'leads',                    'read',  'Prospect intelligence'),

  -- Nova: automation + general — NOT BD, NOT content
  ('nova',        'knowledge_base.automation', 'read', 'Automation frameworks'),
  ('nova',        'knowledge_base.general',   'read',  'General context'),

  -- Aether: content + digital media — NOT leads, NOT BD
  ('aether',      'knowledge_base.digital_media', 'read', 'Content frameworks'),
  ('aether',      'knowledge_base.general',   'read',  'General context'),
  ('aether',      'posts.*',                  'write', 'Blog publishing'),

  -- Synthesizer: all knowledge_base namespaces (it IS the knowledge engine)
  ('synthesizer', 'knowledge_base.*',          'read',  'Knowledge ingestion'),
  ('synthesizer', 'knowledge_base.*',          'write', 'Knowledge extraction'),

  -- Pulse: monitoring — read-only on everything
  ('pulse',       'agent_traces.*',           'read',  'Observability'),
  ('pulse',       'tasks.*',                  'read',  'Status monitoring'),
  ('pulse',       'notifications.*',          'write', 'Alert dispatch'),

  -- Assistant (Aria): leads write, general KB read
  ('assistant',   'knowledge_base.general',   'read',  'Visitor context'),
  ('assistant',   'leads',                    'write', 'Lead intake')
ON CONFLICT (agent_id, namespace) DO NOTHING;

-- ── 4. VERIFICATION GATE LOG ─────────────────────────────────────────────────
-- Records every verification check applied between chain steps.
CREATE TABLE IF NOT EXISTS verification_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          TEXT        NOT NULL,
  step_index      INT         NOT NULL,
  agent_id        TEXT        NOT NULL,
  check_type      TEXT        NOT NULL,  -- 'schema' | 'range' | 'citation' | 'non_empty' | 'custom'
  check_condition TEXT        NOT NULL,  -- human-readable description of the check
  passed          BOOLEAN     NOT NULL,
  detail          TEXT,                  -- why it passed or failed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verif_run_id_idx ON verification_log(run_id);