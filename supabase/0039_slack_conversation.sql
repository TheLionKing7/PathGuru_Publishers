-- ═══════════════════════════════════════════════════════════════════════════
-- 0039_slack_conversation.sql
--
-- Per-thread conversation memory for Slack. Nexus is conversational in Slack,
-- scoped to a thread: the last 20 turns of (channel, thread_ts) are loaded as
-- context, the new user turn and the assistant reply are persisted, and a new
-- thread is a new conversation.
--
-- The unique index on (channel, thread_ts, created_at) preserves strict
-- turn ordering within a thread; the non-unique index on (channel, thread_ts)
-- makes the 20-turn history load a range scan.
--
-- ── RE-RUN SAFE ──────────────────────────────────────────────────────────────
-- create table / create index if not exists are idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.slack_conversation (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null,
  thread_ts   text not null,
  user_id     text not null,
  role        text not null check (role in ('user','assistant')),
  text        text not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists slack_conversation_thread_seq_idx
  on public.slack_conversation (channel, thread_ts, created_at);

create index if not exists slack_conversation_thread_idx
  on public.slack_conversation (channel, thread_ts);
