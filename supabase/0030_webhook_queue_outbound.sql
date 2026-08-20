-- ═══════════════════════════════════════════════════════════════════════════
-- 0030_webhook_queue_outbound.sql
--
-- Add 'outbound_sent' to webhook_queue.kind so the Worker can queue Make's
-- "email actually sent" confirmations alongside the other channels.
--
-- ── EXISTING ROWS ────────────────────────────────────────────────────────────
-- webhook_queue already has rows. The new vocabulary is a strict superset of the
-- old (slack, whatsapp, inbound_email → + outbound_sent), so no existing row can
-- violate the widened constraint; nothing is cleaned or rewritten.
--
-- ── CAN IT FAIL ON CURRENT DATA? ─────────────────────────────────────────────
-- No — superset. The guard query must return only slack/whatsapp/inbound_email:
--      select kind, count(*) from public.webhook_queue group by kind;
--
-- ── RE-RUN SAFE ──────────────────────────────────────────────────────────────
-- Yes: drop constraint if exists + add constraint always ends in the same state.
--
-- The unique dedupe index on (kind, dedupe_key) already spans every kind, so a
-- Make retry of the same confirmation still lands as a 409 at the edge (which
-- the Worker treats as success). Only this CHECK constraint blocked the kind.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.webhook_queue
  drop constraint if exists webhook_queue_kind_check;

alter table public.webhook_queue
  add constraint webhook_queue_kind_check
    check (kind in ('slack', 'whatsapp', 'inbound_email', 'outbound_sent'));
