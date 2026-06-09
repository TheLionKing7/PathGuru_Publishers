-- ============================================================
-- Migration 009 — Lead Magnet → Email → Nurture → Attribution
-- Run in Supabase SQL editor
-- ============================================================

-- ── 1. Lead Magnets (gated playbooks / checklists) ───────────
CREATE TABLE IF NOT EXISTS lead_magnets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  slug            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  format          TEXT DEFAULT 'pdf',       -- pdf | checklist | playbook
  download_url    TEXT,                   -- R2 or CMS asset URL
  cta_copy        TEXT DEFAULT 'Download the free guide',

  -- C2C linkage
  pillar_plan_id  TEXT,
  blog_slug       TEXT,
  seo_keyword     TEXT,
  stdc_stage      TEXT DEFAULT 'think',

  status          TEXT DEFAULT 'active',  -- active | draft | archived
  capture_count   INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lead_magnets_slug   ON lead_magnets(slug);
CREATE INDEX IF NOT EXISTS idx_lead_magnets_status ON lead_magnets(status);


-- ── 2. Captures (email gate + attribution) ─────────────────
CREATE TABLE IF NOT EXISTS lead_magnet_captures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  lead_magnet_id  UUID REFERENCES lead_magnets(id) ON DELETE SET NULL,
  magnet_slug     TEXT,
  email           TEXT NOT NULL,
  name            TEXT,

  -- Attribution
  content_slug    TEXT,                   -- blog post that drove capture
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  referrer        TEXT,
  landing_path    TEXT,

  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  nurture_enrolled BOOLEAN DEFAULT FALSE,
  welcome_sent    BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_captures_email      ON lead_magnet_captures(email);
CREATE INDEX IF NOT EXISTS idx_captures_magnet     ON lead_magnet_captures(lead_magnet_id);
CREATE INDEX IF NOT EXISTS idx_captures_created    ON lead_magnet_captures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_captures_content    ON lead_magnet_captures(content_slug);


-- ── 3. Nurture sequences ───────────────────────────────────
CREATE TABLE IF NOT EXISTS nurture_sequences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  lead_magnet_id  UUID REFERENCES lead_magnets(id) ON DELETE SET NULL,
  emails          JSONB NOT NULL DEFAULT '[]',
  -- [{ step: 1, delayDays: 0, subject, html, plain }]
  status          TEXT DEFAULT 'active'
);


-- ── 4. Nurture enrollments ─────────────────────────────────
CREATE TABLE IF NOT EXISTS nurture_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  sequence_id     UUID NOT NULL REFERENCES nurture_sequences(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  name            TEXT,
  capture_id      UUID REFERENCES lead_magnet_captures(id) ON DELETE SET NULL,

  current_step    INT DEFAULT 0,
  next_send_at    TIMESTAMPTZ,
  status          TEXT DEFAULT 'active',  -- active | completed | unsubscribed
  last_sent_at    TIMESTAMPTZ,

  UNIQUE(sequence_id, email)
);

CREATE INDEX IF NOT EXISTS idx_nurture_next_send ON nurture_enrollments(next_send_at, status);
CREATE INDEX IF NOT EXISTS idx_nurture_email     ON nurture_enrollments(email);


-- ── 5. Content attribution events (blog → capture → booking) ─
CREATE TABLE IF NOT EXISTS content_attribution_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  event_type      TEXT NOT NULL,
  -- page_view | magnet_view | magnet_capture | email_open | nurture_sent | booking | converted

  content_slug    TEXT,
  lead_magnet_slug TEXT,
  email           TEXT,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_attr_type     ON content_attribution_events(event_type);
CREATE INDEX IF NOT EXISTS idx_attr_slug     ON content_attribution_events(content_slug);
CREATE INDEX IF NOT EXISTS idx_attr_created  ON content_attribution_events(created_at DESC);
