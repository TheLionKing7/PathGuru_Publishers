-- ═══════════════════════════════════════════════════════════════════════════
-- 0028_webhook_queue.sql
--
-- The handoff between the always-warm Cloudflare Worker and the Render backend,
-- which sleeps on the free tier.
--
-- The Worker verifies the sender's signature and writes the RAW body here, then
-- returns 200 inside Slack's 3-second budget and wakes the backend. The backend
-- drains this table and does all the actual work. No business logic touches
-- this row except the backend's.
--
-- Two properties matter and both are enforced here rather than in code:
--
--   NOTHING IS LOST. A row is only marked done after its handler succeeded.
--   A crash mid-processing leaves it claimed but not done, and the reaper below
--   returns it to the queue rather than dropping it.
--
--   NOTHING IS DONE TWICE. Slack, Twilio and Make all retry. The unique index
--   on (kind, dedupe_key) makes a retried delivery a 409 at the edge, which the
--   Worker treats as success — so a retry never becomes a second approval or a
--   second draft.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.webhook_queue (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('slack', 'whatsapp', 'inbound_email')),
  -- Provider's own id for this delivery: Slack has none stable, Twilio has
  -- MessageSid, Make passes the email's messageId. Null where none exists.
  dedupe_key    text,
  content_type  text,
  raw_body      text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'claimed', 'done', 'failed')),
  attempts      int  not null default 0,
  last_error    text,
  claimed_at    timestamptz,
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- The drain query: oldest pending first.
create index if not exists webhook_queue_pending_idx
  on public.webhook_queue (status, created_at)
  where status in ('pending', 'claimed');

-- Retry suppression. Partial, because most rows have no dedupe key and two
-- nulls are not equal in a unique index anyway — being explicit documents it.
create unique index if not exists webhook_queue_dedupe_idx
  on public.webhook_queue (kind, dedupe_key)
  where dedupe_key is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: the Worker holds the ANON key, and this is the only thing it may do
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The alternative was giving the Worker a service-role key, which bypasses RLS
-- across the entire database. An edge function is reachable by the whole
-- internet; if it were ever compromised the whole estate would go with it. With
-- the policy below, the worst a leaked anon key can do is write rows into this
-- one table — and the signature checks in the Worker mean an attacker needs a
-- provider secret to get that far.
--
-- Note there is deliberately NO select policy for anon: the Worker writes and
-- never reads. The backend uses the service-role key and is unaffected by RLS.

alter table public.webhook_queue enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'webhook_queue'
      and policyname = 'webhook_queue_anon_insert'
  ) then
    create policy webhook_queue_anon_insert
      on public.webhook_queue
      for insert
      to anon
      with check (true);
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- The reaper: return abandoned rows to the queue
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A row goes 'claimed' when the backend picks it up. If the backend is killed
-- mid-handler — Render redeploy, OOM, the free tier spinning down under it —
-- that row would sit claimed forever and the message would be silently lost.
-- Five minutes is far longer than any handler should take.
--
-- After 5 attempts it is parked as 'failed' rather than retried forever: a
-- payload that kills the handler five times will kill it a sixth, and an
-- infinite retry loop on a free plan is a way to burn the quota rather than
-- fix anything. Query for status='failed' to find them.

create or replace function public.reap_stale_webhooks()
returns integer
language plpgsql
as $$
declare
  reaped integer;
begin
  with stale as (
    update public.webhook_queue
       set status     = case when attempts >= 5 then 'failed' else 'pending' end,
           claimed_at = null,
           last_error = coalesce(last_error, 'abandoned while claimed')
     where status = 'claimed'
       and claimed_at < now() - interval '5 minutes'
    returning 1
  )
  select count(*) into reaped from stale;
  return reaped;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying
-- ═══════════════════════════════════════════════════════════════════════════
--
-- select tablename, policyname, roles, cmd
--   from pg_policies where tablename = 'webhook_queue';
--   → exactly one row: webhook_queue_anon_insert, {anon}, INSERT
--
-- Health of the queue, once traffic is flowing:
--
-- select kind, status, count(*), max(created_at) as newest
--   from public.webhook_queue group by kind, status order by kind, status;
--
-- Anything sitting in 'pending' for more than a few minutes means the backend
-- is not being woken. Anything in 'failed' needs reading, not retrying.
-- ═══════════════════════════════════════════════════════════════════════════
