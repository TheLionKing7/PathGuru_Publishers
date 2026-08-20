-- ═══════════════════════════════════════════════════════════════════════════
-- 0037_approval_event.sql
--
-- Audit trail for every approval decision.
--
-- WHAT THIS IS FOR
-- ────────────────
-- Approvals are currently recorded only as a blob inside the approval task's
-- `output` column (tasks.output), which cannot be queried. Six months from now,
-- "who approved that message to the client?" should be one SQL query against
-- this table — not an archaeology exercise through JSON blobs.
--
-- One row per decision, whatever the surface: Slack button, WhatsApp YES/NO,
-- or the web console. The row records what was approved, by whom (the Slack
-- user id when it came from Slack), from which channel and surface, the
-- decision, the feedback text, and when.
--
-- Safe to run more than once: every statement is IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.approval_event (
  id             uuid        primary key default gen_random_uuid(),
  approval_id    uuid        references public.tasks(id) on delete set null,
  approval_type  text,                    -- blog_post | email_reply | content_commission | ...
  subject        text,                    -- what was approved, as shown to the approver
  decision       text        not null check (decision in ('approved', 'rejected')),
  feedback       text,                    -- feedback / note / reject reason, as given
  slack_user_id  text,                    -- Slack user id (U…) when decided via Slack
  slack_username text,                    -- display name, for readability
  channel        text,                    -- Slack channel id, or 'whatsapp', or 'web'
  surface        text,                    -- 'slack' | 'whatsapp' | 'web'
  decided_at     timestamptz not null default now()
);

comment on table public.approval_event is
  'One row per approval decision, across every surface. The audit trail that
   answers "who approved what, when, from where" with one query.';

comment on column public.approval_event.approval_id is
  'The pending_approval task id this decision resolved. Null only if the task
   was later purged — the event survives because the audit trail must outlive
   the journal.';

comment on column public.approval_event.surface is
  'Where the decision came from: ''slack'' (button/modal), ''whatsapp'' (Boss
   YES/NO), ''web'' (console / API).';

comment on column public.approval_event.slack_user_id is
  'Slack user id (U…) — the accountable individual when the decision was made
   from Slack. Null for WhatsApp and web, which authenticate differently.';

create index if not exists approval_event_approval_idx
  on public.approval_event (approval_id, decided_at desc);

create index if not exists approval_event_decided_at_idx
  on public.approval_event (decided_at desc);

create index if not exists approval_event_slack_user_idx
  on public.approval_event (slack_user_id)
  where slack_user_id is not null;

-- No public policies: like the rest of the operator surface, reads and writes
-- go through route handlers on the service-role client.
alter table public.approval_event enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'approval_event'
--  order by ordinal_position;
-- ═══════════════════════════════════════════════════════════════════════════
