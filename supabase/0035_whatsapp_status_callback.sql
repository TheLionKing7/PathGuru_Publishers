-- ═══════════════════════════════════════════════════════════════════════════
-- 0035_whatsapp_status_callback.sql
--
-- Twilio delivery status callbacks. Outbound WhatsApp messages register a
-- StatusCallback that the Cloudflare Worker verifies and queues (kind
-- `whatsapp_status`); the backend drains it and records the delivery outcome:
--   delivered / undelivered / failed + Twilio's ErrorCode.
--
-- Two changes:
--   1. Widen webhook_queue.kind so the Worker can enqueue `whatsapp_status`.
--   2. Add delivery_status + error_code to notification_attempt so the outcome
--      is queryable alongside the original `ok` ("provider accepted") fact.
--
-- ── RE-RUN SAFE ──────────────────────────────────────────────────────────────
-- drop+add constraint / add column if not exists are idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. New queue kind (superset of 0030's vocabulary — no existing row changes).
alter table public.webhook_queue
  drop constraint if exists webhook_queue_kind_check;

alter table public.webhook_queue
  add constraint webhook_queue_kind_check
    check (kind in ('slack', 'whatsapp', 'whatsapp_status', 'inbound_email', 'outbound_sent'));

-- 2. Delivery outcome on the audit log.
alter table public.notification_attempt
  add column if not exists delivery_status text,
  add column if not exists error_code text;

-- Look up the attempt row by the provider's message id when a callback arrives.
create index if not exists notification_attempt_provider_idx
  on public.notification_attempt (provider_id)
  where provider_id is not null;
