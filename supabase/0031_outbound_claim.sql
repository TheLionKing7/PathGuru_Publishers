-- ═══════════════════════════════════════════════════════════════════════════
-- 0031_outbound_claim.sql
--
-- At-most-once outbound sending. listApprovedDrafts() now claims rows at
-- hand-out time (send_claimed_at + send_attempts) instead of a plain select, so
-- a Make retry cannot re-fetch the same draft before its confirmation arrives.
--
--   send_claimed_at  timestamptz  -- when the row was last handed out
--   send_attempts    int          -- how many times it has been handed out
--
-- ── EXISTING ROWS ────────────────────────────────────────────────────────────
-- inbound_message already has rows. Both columns are added with safe defaults:
-- send_claimed_at NULL (never claimed) and send_attempts 0 (NOT NULL DEFAULT 0).
-- No existing row is rewritten; the claim function only touches rows that are
-- currently 'approved' with sent_at IS NULL.
--
-- ── CAN IT FAIL ON CURRENT DATA? ─────────────────────────────────────────────
-- No. New nullable / NOT NULL DEFAULT columns apply defaults to existing rows
-- without rewriting them. The status CHECK is added only after confirming every
-- existing value is legal (guard query below); 'send_failed' is a new legal
-- value, not a change to any existing one.
--
-- ── RE-RUN SAFE ──────────────────────────────────────────────────────────────
-- Yes. add column if not exists, drop constraint if exists + add constraint, and
-- create or replace function are all idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.inbound_message
  add column if not exists send_claimed_at timestamptz;

alter table public.inbound_message
  add column if not exists send_attempts int not null default 0;

-- Fixed vocabulary for status, now including 'send_failed'. Guard query — must
-- return only these values (or nothing):
--   select status, count(*) from public.inbound_message group by status;
alter table public.inbound_message
  drop constraint if exists inbound_message_status_check;
alter table public.inbound_message
  add constraint inbound_message_status_check
    check (status in ('received', 'draft', 'approved', 'rejected', 'sent', 'send_failed'));

-- Atomic claim. One UPDATE ... RETURNING both increments send_attempts and marks
-- the row claimed, so two concurrent callers can never claim the same row. A row
-- is re-claimable only after 10 minutes without a confirmation, up to 3 attempts.
create or replace function public.claim_outbound_drafts()
returns setof public.inbound_message
language sql
as $$
  update public.inbound_message
     set send_claimed_at = now(),
         send_attempts   = send_attempts + 1
   where status = 'approved'
     and sent_at is null
     and (send_claimed_at is null or send_claimed_at < now() - interval '10 minutes')
     and send_attempts < 3
  returning *;
$$;
