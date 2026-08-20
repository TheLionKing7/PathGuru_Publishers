-- ═══════════════════════════════════════════════════════════════════════════
-- 0032_system_flags.sql
--
-- A single global switch for the whole estate. `agents_paused` is read by
-- every path that touches the outside world before it acts; when true the
-- system still generates, drafts and queues, but never sends, posts or
-- publishes. One row is seeded here so the flag always exists and defaults
-- to running.
--
-- ── RE-RUN SAFE ──────────────────────────────────────────────────────────────
-- Yes. create table if not exists + insert ... on conflict do nothing are both
-- idempotent; a second run changes nothing.
--
-- The backend reads/writes this table with the service-role key, so no RLS
-- policy is required (unlike webhook_queue, which the anon Worker writes).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.system_flag (
  key        text primary key,
  value      boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.system_flag (key, value, updated_by)
values ('agents_paused', false, 'system')
on conflict (key) do nothing;
