-- ============================================================
-- Migration 008 — Service Bookings & Newsletter
-- Run in Supabase SQL editor
-- ============================================================

-- ── 1. Service Bookings ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Client details
  client_name      TEXT,
  client_email     TEXT,
  client_phone     TEXT,        -- with country code e.g. +2348012345678
  company          TEXT,

  -- Session details
  track            TEXT,        -- 'bd' | 'automation' | 'digital_media'
  booking_time     TIMESTAMPTZ, -- confirmed session start time
  duration_mins    INT DEFAULT 45,
  timezone         TEXT DEFAULT 'Africa/Lagos',
  notes            TEXT,        -- anything the client shared in conversation

  -- Booking source
  source           TEXT DEFAULT 'aria', -- 'aria' | 'calendly' | 'manual'
  calendly_event_id TEXT,       -- from Calendly webhook if applicable
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Status
  status           TEXT DEFAULT 'pending',
  -- 'pending'     = Aria collected details, awaiting confirmation
  -- 'confirmed'   = time set and confirmed
  -- 'cancelled'   = cancelled by client or team
  -- 'completed'   = session happened
  -- 'no_show'     = client did not attend

  -- Reminder
  reminder_sent    BOOLEAN DEFAULT FALSE,
  reminder_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bookings_status       ON service_bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_time ON service_bookings(booking_time);
CREATE INDEX IF NOT EXISTS idx_bookings_lead_id      ON service_bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_bookings_reminder     ON service_bookings(reminder_sent, booking_time, status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_bookings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_bookings_updated_at ON service_bookings;
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON service_bookings
  FOR EACH ROW EXECUTE FUNCTION update_bookings_updated_at();


-- ── 2. Newsletter Subscribers ────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  source        TEXT DEFAULT 'website', -- 'website' | 'aria' | 'manual'
  status        TEXT DEFAULT 'active',  -- 'active' | 'unsubscribed'
  unsubscribed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);


-- ── 3. Newsletter Campaigns ──────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Proposal (from Nexus)
  proposed_topic  TEXT NOT NULL,
  proposed_angle  TEXT,         -- why this topic now / the hook
  proposed_by     TEXT DEFAULT 'nexus',
  week_of         DATE,         -- the Monday of the target week

  -- Approval
  status          TEXT DEFAULT 'proposed',
  -- 'proposed'   = Nexus generated, awaiting your approval
  -- 'approved'   = you approved, Aether will curate
  -- 'curating'   = Aether is writing the newsletter
  -- 'ready'      = content ready, awaiting send
  -- 'sent'       = newsletter dispatched
  -- 'rejected'   = you rejected this topic

  approved_at     TIMESTAMPTZ,
  approved_by     TEXT,

  -- Content (Aether fills this after approval)
  subject_line    TEXT,
  preview_text    TEXT,
  html_body       TEXT,
  plain_body      TEXT,

  -- Send
  sent_at         TIMESTAMPTZ,
  recipient_count INT,
  resend_batch_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status  ON newsletter_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_week_of ON newsletter_campaigns(week_of);

CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON newsletter_campaigns;
CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON newsletter_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_campaigns_updated_at();
