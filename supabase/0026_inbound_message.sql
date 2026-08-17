-- ═══════════════════════════════════════════════════════════════════════════
-- 0026_inbound_message.sql
--
-- Inbound email captured by POST /api/webhooks/inbound-email. Nexus classifies
-- each message and drafts a reply, but NEVER sends it: the draft sits on this
-- row, an [APPROVAL] task references it via approval_task_id, and only after a
-- human approves (Slack / webapp) does the row move to `approved` and become
-- available on /api/outbound/approved for the sender (Make) to send.
--
-- status lifecycle: received → draft → approved → sent  (or → rejected)
--
-- message_id / thread_id are the ORIGINAL email's provider ids, returned by
-- /api/outbound/approved so the sender can set In-Reply-To and References.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.inbound_message (
  id                  uuid primary key default gen_random_uuid(),
  message_id          text,                 -- provider message id of the ORIGINAL email
  thread_id           text,                 -- provider thread id of the ORIGINAL email
  from_addr           text,
  to_addr             text,
  subject             text,
  body                text,
  received_at         timestamptz,
  classification      jsonb,                -- Nexus classification { category, intent, urgency }
  draft_subject       text,                 -- Nexus-drafted reply subject (never sent by Nexus)
  draft_body          text,                 -- Nexus-drafted reply body (never sent by Nexus)
  status              text not null default 'received',  -- received | draft | approved | rejected | sent
  approval_task_id    uuid references tasks(id) on delete set null,
  approved_at         timestamptz,
  sent_at             timestamptz,
  provider_message_id text,                 -- provider message id of the SENT reply
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists inbound_message_status_idx        on inbound_message(status);
create index if not exists inbound_message_thread_idx        on inbound_message(thread_id);
create index if not exists inbound_message_approval_task_idx on inbound_message(approval_task_id);
