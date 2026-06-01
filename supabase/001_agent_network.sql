-- ============================================================
-- DigiFusion Intelligence Network — Foundation Schema
-- Migration: 001_agent_network.sql
--
-- Tables:
--   agents          — agent registry and live status
--   tasks           — all work items across the network
--   agent_memory    — episodic memory per agent (what they did, found, produced)
--   knowledge_base  — structured knowledge extracted from PDFs by Synthesizer
--   leads           — prospects qualified by the Assistant VA
--   notifications   — system alerts routed to the team via Pulse
-- ============================================================


-- ── 1. AGENTS ────────────────────────────────────────────────────────────────
-- One row per agent. Seeded at startup if missing.
-- status: 'idle' | 'busy' | 'error' | 'offline'

CREATE TABLE IF NOT EXISTS agents (
  id              TEXT        PRIMARY KEY,          -- e.g. 'synthesizer', 'atlas'
  display_name    TEXT        NOT NULL,             -- e.g. 'Synthesizer'
  role            TEXT        NOT NULL,             -- short role description
  status          TEXT        NOT NULL DEFAULT 'idle',
  current_task_id UUID,                             -- FK to tasks (set when busy)
  last_active_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the 7 agents
INSERT INTO agents (id, display_name, role) VALUES
  ('synthesizer', 'Synthesizer', 'Knowledge Engine & Orchestrator'),
  ('nexus',       'Nexus',       'Project Manager & Task Coordinator'),
  ('atlas',       'Atlas',       'Research & Business Development'),
  ('nova',        'Nova',        'Automation Engineering & Technical Design'),
  ('aether',      'Aether',      'Content Strategy & Digital Media'),
  ('pulse',       'Pulse',       'Analytics & Operations Monitoring'),
  ('assistant',   'Assistant',   'Customer-Facing VA & Lead Qualification')
ON CONFLICT (id) DO NOTHING;


-- ── 2. TASKS ─────────────────────────────────────────────────────────────────
-- Every unit of work in the network.
-- status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
-- priority: 1 (low) → 5 (critical)

CREATE TABLE IF NOT EXISTS tasks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  description     TEXT,
  agent_id        TEXT        REFERENCES agents(id),      -- assigned agent
  created_by      TEXT        NOT NULL DEFAULT 'system',  -- 'system' | agent_id | 'team'
  parent_task_id  UUID        REFERENCES tasks(id),       -- for sub-tasks
  status          TEXT        NOT NULL DEFAULT 'pending',
  priority        INT         NOT NULL DEFAULT 3          CHECK (priority BETWEEN 1 AND 5),
  type            TEXT        NOT NULL DEFAULT 'general', -- 'research' | 'content' | 'design' | 'analysis' | 'general'
  input           JSONB,                                   -- task parameters / instructions
  output          JSONB,                                   -- result produced by the agent
  error           TEXT,                                    -- error message if failed
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  due_at          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_agent_id_idx    ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx      ON tasks(status);
CREATE INDEX IF NOT EXISTS tasks_created_at_idx  ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_parent_task_idx ON tasks(parent_task_id);


-- ── 3. AGENT MEMORY ──────────────────────────────────────────────────────────
-- Episodic memory — what each agent has done and learned.
-- type: 'task_result' | 'observation' | 'decision' | 'error' | 'context'
-- Each entry is attached to a task and written by the agent after completing work.

CREATE TABLE IF NOT EXISTS agent_memory (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT        NOT NULL REFERENCES agents(id),
  task_id     UUID        REFERENCES tasks(id),
  type        TEXT        NOT NULL DEFAULT 'task_result',
  summary     TEXT        NOT NULL,   -- 1–3 sentence human-readable summary
  content     JSONB,                  -- full structured content (findings, output, etc.)
  tags        TEXT[]      DEFAULT '{}',
  importance  INT         DEFAULT 3   CHECK (importance BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_memory_agent_id_idx   ON agent_memory(agent_id);
CREATE INDEX IF NOT EXISTS agent_memory_task_id_idx    ON agent_memory(task_id);
CREATE INDEX IF NOT EXISTS agent_memory_tags_idx       ON agent_memory USING GIN(tags);
CREATE INDEX IF NOT EXISTS agent_memory_created_at_idx ON agent_memory(created_at DESC);


-- ── 4. KNOWLEDGE BASE ────────────────────────────────────────────────────────
-- Structured knowledge extracted from PDFs by Synthesizer.
-- Each row is a knowledge unit: a concept, framework, stat, case study, etc.
-- domain: 'business_development' | 'automation' | 'digital_media' | 'general'
-- source_type: 'pdf' | 'research' | 'published_output' | 'web'

CREATE TABLE IF NOT EXISTS knowledge_base (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  domain          TEXT        NOT NULL DEFAULT 'general',
  source_type     TEXT        NOT NULL DEFAULT 'pdf',
  source_key      TEXT,                   -- R2 object key or URL
  source_name     TEXT,                   -- human-readable source name (e.g. filename)
  content         TEXT        NOT NULL,   -- the extracted knowledge text
  metadata        JSONB       DEFAULT '{}',
  -- Structured extraction fields
  frameworks      TEXT[]      DEFAULT '{}',   -- e.g. ['McKinsey 7S', 'RACE']
  concepts        TEXT[]      DEFAULT '{}',   -- key concepts/topics
  entities        TEXT[]      DEFAULT '{}',   -- companies, people, products mentioned
  statistics      JSONB       DEFAULT '[]',   -- [{stat, source, year}]
  tags            TEXT[]      DEFAULT '{}',
  relevance_score INT         DEFAULT 3       CHECK (relevance_score BETWEEN 1 AND 5),
  processed_by    TEXT        DEFAULT 'synthesizer',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kb_domain_idx     ON knowledge_base(domain);
CREATE INDEX IF NOT EXISTS kb_source_key_idx ON knowledge_base(source_key);
CREATE INDEX IF NOT EXISTS kb_tags_idx       ON knowledge_base USING GIN(tags);
CREATE INDEX IF NOT EXISTS kb_concepts_idx   ON knowledge_base USING GIN(concepts);
CREATE INDEX IF NOT EXISTS kb_frameworks_idx ON knowledge_base USING GIN(frameworks);
CREATE INDEX IF NOT EXISTS kb_created_at_idx ON knowledge_base(created_at DESC);


-- ── 5. LEADS ─────────────────────────────────────────────────────────────────
-- Prospects qualified by the Assistant VA on DigiFusion.
-- status: 'new' | 'qualified' | 'unqualified' | 'booked' | 'converted' | 'lost'
-- score: 1 (cold) → 5 (hot / ready)

CREATE TABLE IF NOT EXISTS leads (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT,
  email               TEXT,
  company             TEXT,
  challenge           TEXT,                   -- what problem they described
  tried_before        TEXT,                   -- what they have already attempted
  company_size        TEXT,                   -- 'solo' | 'small' | 'mid' | 'enterprise'
  budget_range        TEXT,                   -- e.g. '$5k–$10k'
  timeline            TEXT,                   -- e.g. 'within 1 month'
  status              TEXT        NOT NULL DEFAULT 'new',
  score               INT         DEFAULT 0   CHECK (score BETWEEN 0 AND 5),
  qualification_notes TEXT,                   -- VA's reasoning for the score
  conversation        JSONB       DEFAULT '[]',  -- full chat transcript [{role, content, ts}]
  booking_url         TEXT,                   -- Calendly link sent to this lead
  booked_at           TIMESTAMPTZ,
  source_url          TEXT,                   -- which page they came from
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_status_idx     ON leads(status);
CREATE INDEX IF NOT EXISTS leads_score_idx      ON leads(score DESC);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS leads_email_idx      ON leads(email);


-- ── 6. NOTIFICATIONS ─────────────────────────────────────────────────────────
-- System alerts generated by Pulse and routed to the team.
-- channel: 'push' | 'whatsapp' | 'dashboard' | 'all'
-- severity: 'info' | 'warning' | 'critical'
-- status: 'pending' | 'sent' | 'failed' | 'read'

CREATE TABLE IF NOT EXISTS notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  body          TEXT        NOT NULL,
  channel       TEXT        NOT NULL DEFAULT 'dashboard',
  severity      TEXT        NOT NULL DEFAULT 'info',
  status        TEXT        NOT NULL DEFAULT 'pending',
  -- status values: 'pending' | 'sent' | 'partial' | 'skipped' | 'error' | 'read'
  source        TEXT,                   -- which agent or system generated this
  related_id    TEXT,                   -- task_id, lead_id, etc.
  dispatch_log  JSONB,                  -- { push: {...}, whatsapp: {...} } from notifier
  dispatched_at TIMESTAMPTZ,            -- when Pulse dispatched this notification
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If upgrading an existing deployment, run these ALTER TABLE statements:
-- ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dispatch_log JSONB;
-- ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notif_status_idx    ON notifications(status);
CREATE INDEX IF NOT EXISTS notif_severity_idx  ON notifications(severity);
CREATE INDEX IF NOT EXISTS notif_created_idx   ON notifications(created_at DESC);


-- ── 7. AUTO-UPDATE TRIGGERS ──────────────────────────────────────────────────
-- Keep updated_at current on tasks, knowledge_base, leads

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tasks_updated_at') THEN
    CREATE TRIGGER tasks_updated_at
      BEFORE UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'kb_updated_at') THEN
    CREATE TRIGGER kb_updated_at
      BEFORE UPDATE ON knowledge_base
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'leads_updated_at') THEN
    CREATE TRIGGER leads_updated_at
      BEFORE UPDATE ON leads
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ── Migration addendum: Add Researcher agent ──────────────────────────────────
INSERT INTO agents (id, display_name, role) VALUES
  ('researcher', 'Researcher', 'Web Intelligence & Research Specialist')
ON CONFLICT (id) DO NOTHING;
