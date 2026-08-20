-- ═══════════════════════════════════════════════════════════════════════════
-- 0040_frictioniq_soft_delete.sql
--
-- Soft delete + test flag for frictioniq_session.
--
-- WHAT THIS IS FOR
-- ────────────────
-- Most rows in the FrictionIQ register are test submissions. Deleting them for
-- real would destroy the one table that can ever let this instrument claim
-- predictive validity, and a per-row hard delete is a one-way door. Soft delete
-- instead: the row stays, but every register and analytics read excludes it by
-- default, so it vanishes from the register, the band mix, the tiles and the
-- funnel — a soft delete that still inflates the counts is worse than no
-- delete, because it silently corrupts every number on the page.
--
-- `is_test` is the second half of the same cleanup: mark the existing backlog
-- once (bulk), filter to it, and delete the test rows in one pass rather than
-- row by row.
--
-- Run this BEFORE patching backend/server.js. The sessions route adds these
-- names to its select, and PostgREST rejects the whole query when one name is
-- wrong — which takes the register down rather than degrading it.
--
-- Safe to run more than once: every statement is IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The columns ────────────────────────────────────────────────────────────
-- deleted_at is the one bit the reads key off. deleted_by and delete_reason
-- record who did it and why, because a soft delete that cannot be explained
-- later is a hard delete with extra steps.
alter table public.frictioniq_session
  add column if not exists deleted_at     timestamptz,
  add column if not exists deleted_by     text,
  add column if not exists delete_reason  text,
  add column if not exists is_test        boolean not null default false;

comment on column public.frictioniq_session.deleted_at is
  'Set when an operator soft-deletes the row. Non-null means the row is excluded
   from the register and every analytics read by default, and can be restored.';

comment on column public.frictioniq_session.deleted_by is
  'Who deleted the row (operator handle). Kept so a soft delete is explainable.';

comment on column public.frictioniq_session.delete_reason is
  'Why the row was deleted (e.g. ''test submission''). Kept for the same reason.';

comment on column public.frictioniq_session.is_test is
  'true for test submissions. The register filters on this so the existing
   backlog can be identified and cleared in one pass.';

-- ── Indexes ────────────────────────────────────────────────────────────────
-- Partial, where deleted_at is null: the default read is "the live rows", and
-- those are the ones every register query touches. Deleted rows (the recovery
-- view) are the rare minority.
create index if not exists frictioniq_session_deleted_at_idx
  on public.frictioniq_session (deleted_at)
  where deleted_at is null;

-- The test filter. Partial on is_test — test rows will be a shrinking minority
-- after the backlog is cleared.
create index if not exists frictioniq_session_is_test_idx
  on public.frictioniq_session (is_test, created_at desc)
  where is_test;

-- ── The outbox cascade ─────────────────────────────────────────────────────
-- Deleting a session must stop its scheduled touches too, otherwise the
-- dispatcher (digifusion/lib/frictioniq/outbox.ts) keeps emailing a deleted
-- test submission. Touches get the same soft-delete column; the due query in
-- outbox.ts excludes deleted_at. Outcomes live as columns on the session row,
-- so deleting the row deletes the outcome — there is no separate outcomes table
-- to cascade onto.
alter table public.frictioniq_touch
  add column if not exists deleted_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run this after, and read it before trusting the console
-- ═══════════════════════════════════════════════════════════════════════════
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'frictioniq_session'
--    and column_name in ('deleted_at', 'deleted_by', 'delete_reason', 'is_test')
--  order by column_name;
--
-- Expect four rows. Anything fewer and the server patch will take the sessions
-- route down on the next request.
--
-- And on the outbox:
--
-- select column_name from information_schema.columns
--  where table_name = 'frictioniq_touch' and column_name = 'deleted_at';
-- ═══════════════════════════════════════════════════════════════════════════
