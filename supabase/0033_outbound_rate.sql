-- ═══════════════════════════════════════════════════════════════════════════
-- 0033_outbound_rate.sql
--
-- A hard cap on outbound email per recipient. Defence in depth on top of the
-- 0031 atomic claim: even if a send loop hands out the same draft twice, a
-- normalised recipient can receive at most one email per 24 hours.
--
-- outbound_send_log records every confirmed send; listApprovedDrafts() refuses
-- to hand out a draft when its recipient already has a row in the last 24h.
-- The (to_addr, sent_at) index makes that 24h look-back a single range scan.
--
-- ── EXISTING ROWS ────────────────────────────────────────────────────────────
-- outbound_send_log is brand new (empty). 'send_blocked' is a new legal value
-- for inbound_message.status — a strict superset of the 0031 vocabulary, so no
-- existing row can violate the re-added CHECK.
--
-- ── RE-RUN SAFE ──────────────────────────────────────────────────────────────
-- Yes. create table/index if not exists + drop constraint if exists + add
-- constraint are all idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.outbound_send_log (
  id                 uuid primary key default gen_random_uuid(),
  to_addr            text not null,
  inbound_message_id uuid,
  sent_at            timestamptz not null default now()
);

create index if not exists outbound_send_log_to_addr_sent_at_idx
  on public.outbound_send_log (to_addr, sent_at);

-- Add 'send_blocked' to the inbound_message status vocabulary (a draft the
-- rate cap refused to hand out). Guard query — must return only legal values:
--   select status, count(*) from public.inbound_message group by status;
alter table public.inbound_message
  drop constraint if exists inbound_message_status_check;
alter table public.inbound_message
  add constraint inbound_message_status_check
    check (status in ('received', 'draft', 'approved', 'rejected', 'sent', 'send_failed', 'send_blocked'));
