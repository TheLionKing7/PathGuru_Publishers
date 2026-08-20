-- ═══════════════════════════════════════════════════════════════════════════
-- 0036_invariant_alerts.sql
--
-- Persistent key/value state for invariant alerting: the last authorised drain
-- heartbeat and the per-condition alert cooldown timestamps. The backend runs on
-- Render's free tier and sleeps, so an in-memory cooldown would be wiped on every
-- spin-down — the "at most once per hour per condition" guarantee must survive a
-- restart.
--
-- ── RE-RUN SAFE ──────────────────────────────────────────────────────────────
-- create table if not exists is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.invariant_state (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
