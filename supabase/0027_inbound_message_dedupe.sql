-- ═══════════════════════════════════════════════════════════════════════════
-- 0027_inbound_message_dedupe.sql
--
-- Deduplicate inbound messages by provider message id. A redelivered webhook
-- (the sender never saw the 200 and retried) must not create a second draft or
-- a second approval task, so message_id becomes a partial unique key — unique
-- only when present, since messages without an id are allowed to repeat.
-- ═══════════════════════════════════════════════════════════════════════════

create unique index if not exists inbound_message_message_id_unique
  on public.inbound_message(message_id)
  where message_id is not null;
