-- ═══════════════════════════════════════════════════════════════════════════
-- 0029_inbound_classification.sql
--
-- Stage 1 of the inbound-email pipeline: one call classifies the message into a
-- single category and extracts structured facts before any drafting.
--
--   classification  text   -- fixed vocabulary (CHECK constraint below)
--   extracted       jsonb  -- { senderName, organisation, statedNeed,
--                              timelineSignal, budgetSignal, referralSource }
--
-- ── EXISTING ROWS ────────────────────────────────────────────────────────────
-- inbound_message already has rows, and `classification` is currently jsonb
-- ({ category, intent, urgency }) written by the old single-prompt flow. This
-- migration narrows it to a single text category:
--   * the jsonb document is NOT ::text-stringified — only `category` is
--     extracted (classification->>'category'), and empty/whitespace → NULL;
--   * legacy `category` values are mapped onto the new vocabulary (UPDATE below);
--   * `intent`/`urgency` are dropped — nothing reads them any more.
--
-- ── CAN IT FAIL ON CURRENT DATA? ─────────────────────────────────────────────
-- No. The type change extracts a scalar; the UPDATE maps every legacy value onto
-- the legal set before the CHECK is added, so the constraint cannot be violated.
--
-- ── RE-RUN SAFE ──────────────────────────────────────────────────────────────
-- Yes. Every step is guarded (data_type check, WHERE-excluded UPDATE, add column
-- if not exists, pg_constraint check, create index if not exists).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. jsonb → text, extracting only `category` (never ::text). Empty/whitespace
--    is absent, not a value.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'inbound_message'
      and column_name  = 'classification'
      and data_type    = 'jsonb'
  ) then
    alter table public.inbound_message
      alter column classification type text
      using nullif(trim(classification->>'category'), '');
  end if;
end $$;

-- 2. Clean legacy category values onto the new vocabulary before adding the
--    CHECK. Guarded by this query (must return only rows this UPDATE fixes):
--      select classification, count(*) from public.inbound_message
--      group by classification order by 2 desc;
update public.inbound_message
set classification = case classification
  when 'inquiry'     then 'client_enquiry'
  when 'sales'       then 'client_enquiry'
  when 'partnership' then 'partner_approach'
  when 'support'     then 'support'
  else 'other'
end
where classification is not null
  and classification not in (
    'client_enquiry', 'partner_approach', 'vendor_pitch', 'recruiter',
    'newsletter', 'notification', 'support', 'not_a_fit', 'other'
  );

-- 3. Extracted facts (jsonb — no fixed vocabulary).
alter table public.inbound_message
  add column if not exists extracted jsonb;

-- 4. Fixed vocabulary, readable from the schema rather than only the code.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname   = 'inbound_message_classification_check'
      and conrelid  = 'public.inbound_message'::regclass
  ) then
    alter table public.inbound_message
      add constraint inbound_message_classification_check
        check (classification in (
          'client_enquiry', 'partner_approach', 'vendor_pitch', 'recruiter',
          'newsletter', 'notification', 'support', 'not_a_fit', 'other'
        ));
  end if;
end $$;

create index if not exists inbound_message_classification_idx
  on public.inbound_message (classification);
