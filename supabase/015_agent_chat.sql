-- Agent chat persistence — full conversation history, ratings, reply threads
-- Run in Supabase SQL editor (shared project).

CREATE TABLE IF NOT EXISTS agent_chat_threads (
  agent_id    TEXT        PRIMARY KEY REFERENCES agents(id),
  epoch       INT         NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT        NOT NULL REFERENCES agents(id),
  epoch       INT         NOT NULL DEFAULT 1,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT        NOT NULL,
  parent_id   UUID        REFERENCES agent_chat_messages(id) ON DELETE SET NULL,
  rating      SMALLINT,   -- NULL | -1 (down) | 1 (up) | 2-5 (stars)
  feedback    TEXT,
  metadata    JSONB       DEFAULT '{}',
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_chat_messages_agent_epoch_idx
  ON agent_chat_messages(agent_id, epoch, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agent_chat_messages_parent_idx
  ON agent_chat_messages(parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_chat_messages_created_idx
  ON agent_chat_messages(created_at DESC)
  WHERE deleted_at IS NULL;
