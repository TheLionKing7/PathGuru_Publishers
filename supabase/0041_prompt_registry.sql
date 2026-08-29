-- ═══════════════════════════════════════════════════════════════════════════
-- 0041_prompt_registry.sql
--
-- Versioning for the prompt library. The library itself lives in the repo
-- (backend/prompts/) and always will — these tables hold only what the repo
-- cannot: an edit made from the console, its history, and the record of which
-- prompts actually get used.
--
-- ── THE ONE DESIGN DECISION WORTH READING ──────────────────────────────────
--
-- The prompt BODY is not stored here unless somebody has overridden it.
--
-- A registry that copies every seed into the database on first boot looks
-- tidier and is a trap: from that moment the database shadows the repo, so
-- improving a prompt in code changes nothing, and the only way to find out is
-- to notice that a deploy had no effect. Here, `prompt.live_version` is NULL
-- until an override is published — and NULL means "use the repo". A prompt
-- nobody has edited therefore tracks the repo forever, for free.
--
-- It also means the failure mode is benign. If these tables are empty, wiped,
-- or unreachable, every prompt resolves to its known-good repo body and the
-- console keeps working. A registry that can take the system down when a table
-- is empty is worse than the hard-coded strings it replaced.
--
-- Title, category, purpose and note are likewise NOT stored — they come from
-- the repo. Only the body is overridable, because only the body is the thing
-- an operator is trying to change at 11pm.
--
-- ── RE-RUN SAFE ────────────────────────────────────────────────────────────
-- Yes. Every statement is `if not exists` or `on conflict do nothing`.
--
-- Written with the service-role key by the backend, so no RLS policy is
-- required — nothing anonymous ever touches these.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── One row per prompt that has ever been touched ──────────────────────────
-- Rows are created lazily, on the first draft. An untouched prompt has no row
-- at all, which is the correct representation of "the repo is authoritative".
create table if not exists public.prompt (
  id           text primary key,          -- library id, e.g. 'assess.three-test-filter'
  audience     text not null default 'operator'
               check (audience in ('operator', 'agent')),
  live_version integer,                   -- NULL = resolve from the repo seed
  updated_at   timestamptz not null default now(),
  updated_by   text
);

-- ── Every version ever saved ───────────────────────────────────────────────
-- Drafts are kept. The point of a draft is to exist without being live; a
-- registry that only stores what is published cannot answer "what did I try".
create table if not exists public.prompt_version (
  id           bigserial primary key,
  prompt_id    text not null references public.prompt(id) on delete cascade,
  version      integer not null,
  body         text not null,
  status       text not null default 'draft'
               check (status in ('draft', 'published', 'archived')),
  note         text,                      -- why this version exists
  created_at   timestamptz not null default now(),
  created_by   text,
  published_at timestamptz,
  published_by text,
  unique (prompt_id, version)
);

create index if not exists prompt_version_prompt_idx
  on public.prompt_version (prompt_id, version desc);

-- ── Usage ──────────────────────────────────────────────────────────────────
-- Written when a prompt is COPIED, not when it is composed.
--
-- The console re-composes on every keystroke, so recording composition would
-- produce thousands of rows that measure typing. A copy is the moment the
-- prompt actually leaves the console and goes to work, and it is the only
-- event here worth counting.
--
-- This is what turns the library from a filing cabinet into an instrument: a
-- prompt nobody copies is dead weight, and the sixty-day view says which.
create table if not exists public.prompt_usage (
  id        bigserial primary key,
  prompt_id text not null,
  version   integer,                      -- NULL = the repo seed was used
  industry  text,
  clauses   text[],
  chars     integer,
  unfilled  integer,                      -- placeholders still standing at copy
  surface   text not null default 'console'
            check (surface in ('console', 'slack', 'agent', 'api')),
  actor     text,
  used_at   timestamptz not null default now()
);

create index if not exists prompt_usage_prompt_idx
  on public.prompt_usage (prompt_id, used_at desc);
create index if not exists prompt_usage_recent_idx
  on public.prompt_usage (used_at desc);
