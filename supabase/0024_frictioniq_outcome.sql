-- ═══════════════════════════════════════════════════════════════════════════
-- 0024_frictioniq_outcome.sql
--
-- Adds outcome capture to frictioniq_session.
--
-- WHAT THIS IS FOR
-- ────────────────
-- Two numbers in this estate are declared priors rather than measurements:
--
--   · the band priors in lib/frictioniq/commitment.ts, which set every
--     Commitment Sizer recommendation shown on the public site;
--   · the value of a completed assessment in the paid-acquisition sizing rule,
--     which sets the size of the advertising tranche.
--
-- Both are guesses, and both are guesses only because nothing anywhere records
-- what a completed assessment actually became. These three columns are that
-- record. Ten rows carrying a real outcome and both priors stop being priors.
--
-- Run this BEFORE patching backend/server.js. The sessions route adds these
-- names to its select, and PostgREST rejects the entire query when one name is
-- wrong — which takes the register down rather than degrading it.
--
-- Safe to run more than once: every statement is IF NOT EXISTS, and the check
-- constraint is added only when absent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The columns ────────────────────────────────────────────────────────────
-- outcome is nullable and null is meaningful: "not yet known" is a different
-- state from "did not convert", and collapsing the two would put every open
-- row into the denominator of the conversion rate on the day it was captured.
alter table public.frictioniq_session
  add column if not exists outcome       text,
  add column if not exists outcome_value numeric(14,2),
  add column if not exists outcome_at    timestamptz;

comment on column public.frictioniq_session.outcome is
  'won | lost | pending | null. null means not yet assessed — not "lost". The
   denominator of any conversion figure is the count of non-null rows.';

comment on column public.frictioniq_session.outcome_value is
  'Engagement value in naira, recorded only where outcome = ''won''. This is the
   figure that replaces the declared value-per-assessment prior in the
   paid-acquisition sizing rule.';

comment on column public.frictioniq_session.outcome_at is
  'When the outcome was recorded — not when the engagement started. Kept so the
   lag between assessment and decision can itself be measured later.';

-- ── The vocabulary, enforced ───────────────────────────────────────────────
-- The API allowlists these three values too. Enforcing it here as well is not
-- redundancy for its own sake: the API is one of several writers (SQL console,
-- a future import, a repair script), and a free-text outcome column silently
-- accumulates 'Won', 'won ', 'WON' until the group-by lies.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'frictioniq_session_outcome_check'
  ) then
    alter table public.frictioniq_session
      add constraint frictioniq_session_outcome_check
      check (outcome is null or outcome in ('won', 'lost', 'pending'));
  end if;
end $$;

-- A value without a win is a data-entry slip, and it would inflate the mean it
-- feeds. Rejected at the table rather than corrected later.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'frictioniq_session_outcome_value_check'
  ) then
    alter table public.frictioniq_session
      add constraint frictioniq_session_outcome_value_check
      check (
        outcome_value is null
        or (outcome_value > 0 and outcome = 'won')
      );
  end if;
end $$;

-- ── Index ──────────────────────────────────────────────────────────────────
-- Partial, because the interesting query is always "the rows that have an
-- outcome" and those will be a small minority of the table for a long time.
create index if not exists frictioniq_session_outcome_idx
  on public.frictioniq_session (outcome, created_at desc)
  where outcome is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run this after, and read it before trusting the console
-- ═══════════════════════════════════════════════════════════════════════════
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'frictioniq_session'
--    and column_name in ('outcome', 'outcome_value', 'outcome_at')
--  order by column_name;
--
-- Expect exactly three rows. Anything fewer and the server patch will take the
-- sessions route down on the next request.
--
-- The number that matters, once rows start carrying outcomes:
--
-- select
--   count(*) filter (where outcome is not null)              as decided,
--   count(*) filter (where outcome = 'won')                  as won,
--   round(avg(outcome_value) filter (where outcome = 'won')) as mean_value
--   from public.frictioniq_session;
--
-- Do not quote either figure to anyone until `decided` reaches 10. Below that
-- the Wilson lower bound on the conversion share is close to zero and the mean
-- is one engagement wide.
-- ═══════════════════════════════════════════════════════════════════════════
