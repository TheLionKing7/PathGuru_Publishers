-- ═══════════════════════════════════════════════════════════════════════════
-- 0034_notification_attempt.sql
--
-- Audit log for every outbound notification attempt. Slack is now the primary
-- approval/ops surface, WhatsApp is a fallback for high-priority items only —
-- so a human must be able to answer "did the provider actually accept it?" for
-- every single delivery, not just the ones that succeeded.
--
--   ok          — "the provider ACCEPTED it" (Slack `ok:true`, a Twilio SID or
--                 a Meta message id). This is NOT "the human read it": reading
--                 is provider delivery confirmation (Twilio status callbacks,
--                 Slack receipts), tracked out-of-band. Do not conflate the two.
--   provider_id — Slack `ts`, Twilio `sid`, or Meta message id — the provider's
--                 own receipt, used to correlate a delivery confirmation later.
--   error       — human-readable reason when ok = false (including "skipped"
--                 causes, so a skipped notification is never lost into the void).
--
-- ── RE-RUN SAFE ──────────────────────────────────────────────────────────────
-- Yes. create table/index if not exists are idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.notification_attempt (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null,
  target      text not null,
  ok          boolean not null,
  provider_id text,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists notification_attempt_created_idx
  on public.notification_attempt (created_at desc);

create index if not exists notification_attempt_channel_idx
  on public.notification_attempt (channel);
