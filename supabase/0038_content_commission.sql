-- ═══════════════════════════════════════════════════════════════════════════
-- 0038_content_commission.sql
--
-- One human-commissioned piece of content, tracked from the moment a source is
-- commissioned ("write about this") through to a published URL or an abandoned
-- commission.
--
-- `status` is the single stage the commission is in. Every transition is
-- written here (the status column) AND mirrored into the Slack thread named by
-- slack_channel / slack_thread_ts, so that thread is the human-readable log of
-- the commission.
--
-- ── RE-RUN SAFE ──────────────────────────────────────────────────────────────
-- create table / create index if not exists are idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.content_commission (
  id                uuid primary key default gen_random_uuid(),
  source_url        text,
  source_note       text,           -- what the human said when commissioning
  commissioned_by   text,
  commissioned_at   timestamptz not null default now(),
  status            text not null default 'intake'
                      check (status in (
                        'intake',
                        'assessing',
                        'angle_review',
                        'researching',
                        'research_review',
                        'synthesising',
                        'drafting',
                        'draft_review',
                        'publishing',
                        'published',
                        'abandoned'
                      )),
  angle             text,
  angle_approved_at timestamptz,
  research_task_id  uuid,
  research_grade    int,
  synthesis_ref     text,
  draft_post_id     uuid,
  published_url     text,
  slack_channel     text,
  slack_thread_ts   text,
  closed_at         timestamptz,
  close_reason      text
);

create index if not exists content_commission_status_commissioned_idx
  on public.content_commission (status, commissioned_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying
-- ═══════════════════════════════════════════════════════════════════════════
-- Confirm the constraint is exactly the eleven stages (nothing more, nothing
-- less) and the index exists:
--
--   select pg_get_constraintdef(oid)
--     from pg_constraint
--     where conrelid = 'public.content_commission'::regclass
--       and contype = 'c';
--
--   select indexname from pg_indexes
--    where tablename = 'content_commission'
--      and indexname = 'content_commission_status_commissioned_idx';
-- ═══════════════════════════════════════════════════════════════════════════
